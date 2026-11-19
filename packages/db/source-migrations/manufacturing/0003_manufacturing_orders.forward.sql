-- Manufacturing orders with assigned approval (draft -> submitted -> approved, or returned for correction).
-- An approved order grants no material issue, production, costing or stock movement.
CREATE TABLE manufacturing_order (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^MO-[0-9]{3,}$'),
 product_id text NOT NULL, bom_id text NOT NULL,
 bom_code text NOT NULL CHECK(bom_code ~ '^BOM-[0-9]{3,}$'),
 plan_id text,
 quantity numeric(20,4) NOT NULL CHECK(quantity>0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 order_date date NOT NULL,
 project_id text NOT NULL, location_id text NOT NULL,
 approver_id text,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','returned','approved')),
 return_comment text NOT NULL DEFAULT '' CHECK(length(return_comment)<=2000),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 approval_instance_id text,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 CHECK(state<>'returned' OR length(btrim(return_comment))>0),
 CHECK(state IN ('draft','returned') OR approver_id IS NOT NULL),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,bom_id) REFERENCES manufacturing_bom(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,plan_id) REFERENCES manufacturing_plan(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,approval_instance_id) REFERENCES approval_instance(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
-- A production plan converts into at most one manufacturing order.
CREATE UNIQUE INDEX manufacturing_order_plan ON manufacturing_order(tenant_id,company_id,plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX manufacturing_order_directory ON manufacturing_order(tenant_id,company_id,code);
CREATE INDEX manufacturing_order_assigned_review ON manufacturing_order(tenant_id,company_id,approver_id,id) WHERE state='submitted';
CREATE TABLE manufacturing_order_line (
 tenant_id text NOT NULL, company_id text NOT NULL, order_id text NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 200),
 product_id text NOT NULL,
 standard_quantity numeric(20,4) NOT NULL CHECK(standard_quantity>=0),
 quantity numeric(20,4) NOT NULL CHECK(quantity>=0),
 unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 40),
 remark text NOT NULL DEFAULT '' CHECK(length(remark)<=500),
 -- Meeting decision: a quantity that differs from the BOM standard must carry a remark for the approver.
 CHECK(quantity=standard_quantity OR length(btrim(remark))>0),
 PRIMARY KEY(tenant_id,order_id,line_no), UNIQUE(tenant_id,order_id,product_id),
 FOREIGN KEY(tenant_id,company_id,order_id) REFERENCES manufacturing_order(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,product_id) REFERENCES inventory_product(tenant_id,company_id,id)
);
ALTER TABLE manufacturing_plan ADD CONSTRAINT manufacturing_plan_order_fk
 FOREIGN KEY(tenant_id,company_id,manufacturing_order_id) REFERENCES manufacturing_order(tenant_id,company_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION manufacturing_snapshot(entity text,tenant text,company text,record_id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE entity
  WHEN 'bom' THEN (SELECT to_jsonb(b)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_bom_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.bom_id=record_id),'[]'::jsonb))
   FROM manufacturing_bom b WHERE b.tenant_id=tenant AND b.company_id=company AND b.id=record_id)
  WHEN 'plan' THEN (SELECT to_jsonb(p)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_plan_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.plan_id=record_id),'[]'::jsonb))
   FROM manufacturing_plan p WHERE p.tenant_id=tenant AND p.company_id=company AND p.id=record_id)
  WHEN 'order' THEN (SELECT to_jsonb(o)||jsonb_build_object('line_rows',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no) FROM manufacturing_order_line l WHERE l.tenant_id=tenant AND l.company_id=company AND l.order_id=record_id),'[]'::jsonb))
   FROM manufacturing_order o WHERE o.tenant_id=tenant AND o.company_id=company AND o.id=record_id)
 END;
$$;
CREATE OR REPLACE FUNCTION guard_manufacturing_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Manufacturing records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Manufacturing version required' USING ERRCODE='23514'; END IF;
 -- PL/pgSQL does not short-circuit AND: only read NEW.state on tables that have it.
 IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('manufacturing_plan','manufacturing_order') THEN
  IF NEW.state<>'draft' THEN RAISE EXCEPTION 'Manufacturing documents start as drafts' USING ERRCODE='23514'; END IF;
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
  IF TG_TABLE_NAME='manufacturing_order' THEN
   IF OLD.state='approved' THEN RAISE EXCEPTION 'Approved manufacturing orders are immutable' USING ERRCODE='23514'; END IF;
   IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN RAISE EXCEPTION 'A manufacturing order keeps its source plan' USING ERRCODE='23514'; END IF;
   IF OLD.state='submitted' AND (to_jsonb(NEW)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','row_version','updated_by','updated_at','approval_instance_id','return_comment']) THEN
    RAISE EXCEPTION 'Submitted manufacturing order terms are immutable' USING ERRCODE='23514';
   END IF;
   IF NOT ((OLD.state IN ('draft','returned') AND NEW.state IN (OLD.state,'submitted'))
     OR (OLD.state='submitted' AND NEW.state IN ('approved','returned'))) THEN
    RAISE EXCEPTION 'Invalid manufacturing order lifecycle transition' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Lines change only while the order is a draft or returned for correction.
CREATE FUNCTION guard_manufacturing_order_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM manufacturing_order o WHERE o.tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id)
  AND o.company_id=coalesce(NEW.company_id,OLD.company_id) AND o.id=coalesce(NEW.order_id,OLD.order_id) AND o.state NOT IN ('draft','returned'))
 THEN RAISE EXCEPTION 'Submitted manufacturing order lines are immutable' USING ERRCODE='23514'; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER manufacturing_guard BEFORE INSERT OR UPDATE OR DELETE ON manufacturing_order FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_record();
CREATE TRIGGER manufacturing_order_line_guard BEFORE INSERT OR UPDATE OR DELETE ON manufacturing_order_line FOR EACH ROW EXECUTE FUNCTION guard_manufacturing_order_line();
CREATE CONSTRAINT TRIGGER manufacturing_evidence AFTER INSERT OR UPDATE ON manufacturing_order DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
CREATE CONSTRAINT TRIGGER manufacturing_lines_evidence AFTER INSERT OR UPDATE OR DELETE ON manufacturing_order_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_manufacturing_evidence();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['manufacturing_order','manufacturing_order_line'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('manufacturing',3,'manufacturing_orders');
