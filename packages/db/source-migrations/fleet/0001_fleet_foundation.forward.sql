-- Fleet foundation (meeting 16 Nov 2026): vehicles, drivers and the tools kept in each vehicle.
-- Fleet owns the vehicle record until a live Assets register exists; asset_number links it informally.
-- Lease installments stay in Assets. Operational records only: no stock, GL or bank posting.
CREATE TABLE fleet_driver (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^DRV-[0-9]{3,}$'),
 -- Drivers are always HR employees; Fleet keeps the licence details HR does not hold.
 employee_id text NOT NULL,
 licence_number text NOT NULL CHECK(length(btrim(licence_number)) BETWEEN 1 AND 60),
 licence_class text NOT NULL CHECK(length(btrim(licence_class)) BETWEEN 1 AND 40),
 licence_expires_on date NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 UNIQUE(tenant_id,company_id,employee_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE fleet_vehicle (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^VEH-[0-9]{3,}$'),
 registration_no text NOT NULL CHECK(registration_no ~ '^[A-Z0-9][A-Z0-9 -]{0,19}$'),
 asset_number text NOT NULL DEFAULT '' CHECK(length(asset_number)<=40),
 make_model text NOT NULL CHECK(length(btrim(make_model)) BETWEEN 1 AND 160),
 category text NOT NULL CHECK(length(btrim(category)) BETWEEN 1 AND 80),
 ownership text NOT NULL CHECK(ownership IN ('owned','leased')),
 fuel_type text NOT NULL CHECK(fuel_type IN ('petrol','diesel','cng','hybrid','electric')),
 opening_odometer numeric(12,1) NOT NULL CHECK(opening_odometer>=0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','workshop','retired')),
 current_driver_id text,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 UNIQUE(tenant_id,company_id,registration_no),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,current_driver_id) REFERENCES fleet_driver(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
-- A driver is assigned to at most one vehicle at a time.
CREATE UNIQUE INDEX fleet_vehicle_one_driver ON fleet_vehicle(tenant_id,company_id,current_driver_id) WHERE current_driver_id IS NOT NULL;
-- Equipment kept in a vehicle (fire extinguisher, wrench...). A damaged or destroyed item stays on record;
-- its replacement is a new row that points back to it.
CREATE TABLE fleet_vehicle_tool (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 vehicle_id text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 999),
 condition text NOT NULL DEFAULT 'good' CHECK(condition IN ('good','damaged','destroyed')),
 replaces_tool_id text,
 recorded_on date NOT NULL,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id),
 UNIQUE(tenant_id,company_id,replaces_tool_id),
 CHECK(replaces_tool_id IS NULL OR replaces_tool_id<>id),
 FOREIGN KEY(tenant_id,company_id,vehicle_id) REFERENCES fleet_vehicle(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,replaces_tool_id) REFERENCES fleet_vehicle_tool(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
-- One append-only evidence ledger for every Fleet record.
CREATE TABLE fleet_change (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 entity_type text NOT NULL CHECK(entity_type IN ('vehicle','driver','tool','fuel','maintenance')), entity_id text NOT NULL,
 record_version integer NOT NULL CHECK(record_version>0), actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('created','saved')),
 audit_event_id text NOT NULL,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot jsonb NOT NULL, result jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,actor_id,idempotency_key), UNIQUE(tenant_id,entity_type,entity_id,record_version),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES platform_admin_audit_event(tenant_id,id)
);
CREATE INDEX fleet_vehicle_directory ON fleet_vehicle(tenant_id,company_id,registration_no);
CREATE INDEX fleet_driver_directory ON fleet_driver(tenant_id,company_id,code);
CREATE INDEX fleet_vehicle_tool_vehicle ON fleet_vehicle_tool(tenant_id,company_id,vehicle_id,name);
CREATE INDEX fleet_change_history ON fleet_change(tenant_id,company_id,entity_type,entity_id,record_version);

CREATE FUNCTION guard_fleet_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Fleet records must be retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.row_version<>1 THEN RAISE EXCEPTION 'Initial Fleet version required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at)
    OR NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Immutable Fleet identity/version' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Every insert or update of a Fleet record must be matched by an evidence row for that exact version.
CREATE FUNCTION require_fleet_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entity text;
BEGIN
 entity:=CASE TG_TABLE_NAME
  WHEN 'fleet_vehicle' THEN 'vehicle' WHEN 'fleet_driver' THEN 'driver' WHEN 'fleet_vehicle_tool' THEN 'tool'
  WHEN 'fleet_fuel_entry' THEN 'fuel' ELSE 'maintenance' END;
 IF NOT EXISTS(SELECT 1 FROM fleet_change e JOIN platform_admin_audit_event a ON a.tenant_id=e.tenant_id AND a.id=e.audit_event_id
  WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.entity_type=entity AND e.entity_id=NEW.id
  AND e.record_version=NEW.row_version AND e.actor_id=NEW.updated_by
  AND a.entity_id=NEW.id AND a.actor_id=e.actor_id AND a.action='fleet.'||entity||'.'||e.action)
 THEN RAISE EXCEPTION 'Immutable Fleet audit evidence required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['fleet_driver','fleet_vehicle','fleet_vehicle_tool'] LOOP
  EXECUTE format('CREATE TRIGGER fleet_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_fleet_record()',name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER fleet_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_fleet_evidence()',name);
 END LOOP;
END $$;
CREATE TRIGGER fleet_change_immutable BEFORE UPDATE OR DELETE ON fleet_change FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['fleet_driver','fleet_vehicle','fleet_vehicle_tool','fleet_change'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fleet',1,'fleet_foundation');
