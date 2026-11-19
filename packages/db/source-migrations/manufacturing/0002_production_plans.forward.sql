-- Production plans: required component quantities from the product's Bill of Materials.
-- Availability is not stored: no stock ledger exists yet, so no shortfall is computed or reserved.
CREATE TABLE manufacturing_plan (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^PP-[0-9]{3,}$'),
 product_id text NOT NULL, bom_id text NOT NULL,
 planned_quantity numeric(20,4) NOT NULL CHECK(planned_quantity>0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','converted')),
 manufacturing_order_id text,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 CHECK((state='converted')=(manufacturing_order_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,bom_id) REFERENCES manufacturing_bom(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE manufacturing_plan_line (
 tenant_id text NOT NULL, company_id text NOT NULL, plan_id text NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 200),
 product_id text NOT NULL,
 bom_quantity numeric(20,4) NOT NULL CHECK(bom_quantity>0),
 required_quantity numeric(20,4) NOT NULL CHECK(required_quantity>=0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 PRIMARY KEY(tenant_id,plan_id,line_no), UNIQUE(tenant_id,plan_id,product_id),
 FOREIGN KEY(tenant_id,company_id,plan_id) REFERENCES manufacturing_plan(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id)
);
CREATE INDEX manufacturing_plan_directory ON manufacturing_plan(tenant_id,company_id,code);
CREATE INDEX manufacturing_plan_bom ON manufacturing_plan(tenant_id,company_id,bom_id);

CREATE OR REPLACE FUNCTION manufacturing_snapshot(entity text,tenant text,company text,record_id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE entity
  WHEN 'bom' THEN (SELECT to_jsonb(b)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_bom_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.bom_id=record_id),'[]'::jsonb))
   FROM manufacturing_bom b WHERE b.tenant_id=tenant AND b.company_id=company AND b.id=record_id)
  WHEN 'plan' THEN (SELECT to_jsonb(p)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_plan_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.plan_id=record_id),'[]'::jsonb))
   FROM manufacturing_plan p WHERE p.tenant_id=tenant AND p.company_id=company AND p.id=record_id)
 END;
$$;
CREATE OR REPLACE FUNCTION guard_manufacturing_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manufacturing records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Manufacturing version required' USING ERRCODE='23514'; END IF;
 -- PL/pgSQL does not short-circuit AND: only read NEW.state on tables that have it.
 IF TG_OP='INSERT' AND TG_TABLE_NAME='manufacturing_plan' THEN
  IF NEW.state<>'draft' THEN RAISE EXCEPTION 'A production plan starts as a draft' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at)
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable Manufacturing identity/version' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='manufacturing_bom' AND NEW.product_id<>OLD.product_id THEN
   RAISE EXCEPTION 'A Bill of Materials keeps its finished product' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='manufacturing_plan' THEN
   IF OLD.state='converted' THEN RAISE EXCEPTION 'Converted production plans are immutable' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Converted plans keep their material lines exactly as they were converted.
CREATE FUNCTION guard_manufacturing_plan_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM manufacturing_plan p WHERE p.tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id)
  AND p.company_id=coalesce(NEW.company_id,OLD.company_id) AND p.id=coalesce(NEW.plan_id,OLD.plan_id) AND p.state<>'draft')
 THEN RAISE EXCEPTION 'Converted production plan lines are immutable' USING ERRCODE='23514'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER manufacturing_guard BEFORE INSERT OR UPDATE OR DELETE ON manufacturing_plan FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_record();
CREATE TRIGGER manufacturing_plan_line_guard BEFORE INSERT OR UPDATE OR DELETE ON manufacturing_plan_line FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_plan_line();
CREATE CONSTRAINT TRIGGER manufacturing_evidence AFTER INSERT OR UPDATE ON manufacturing_plan DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
CREATE CONSTRAINT TRIGGER manufacturing_lines_evidence AFTER INSERT OR UPDATE OR DELETE ON manufacturing_plan_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['manufacturing_plan','manufacturing_plan_line'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('manufacturing',2,'production_plans');
