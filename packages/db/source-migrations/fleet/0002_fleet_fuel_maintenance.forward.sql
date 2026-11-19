-- Fuel and maintenance entries (meeting 16 Nov 2026).
-- Fuel average = (current odometer - previous odometer) / litres added, in km per litre.
-- Vendor purchases record the supplier and its invoice reference; bill creation is a later phase,
-- so billing_status stays 'pending' until Procurement/Finance billing is connected.
CREATE TABLE fleet_fuel_entry (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^FUE-[0-9]{4,}$'),
 vehicle_id text NOT NULL, driver_id text,
 entry_date date NOT NULL,
 previous_odometer numeric(12,1) NOT NULL CHECK(previous_odometer>=0),
 odometer numeric(12,1) NOT NULL,
 litres numeric(10,2) NOT NULL CHECK(litres>0),
 rate numeric(14,2) NOT NULL CHECK(rate>=0),
 amount numeric(16,2) NOT NULL CHECK(amount>=0),
 km_per_litre numeric(10,2) NOT NULL,
 supplier_id text,
 supplier_invoice_ref text NOT NULL DEFAULT '' CHECK(length(supplier_invoice_ref)<=80),
 billing_status text NOT NULL CHECK(billing_status IN ('not_applicable','pending','billed')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 CHECK(odometer>previous_odometer),
 CHECK(km_per_litre=round((odometer-previous_odometer)/litres,2)),
 CHECK(amount=round(litres*rate,2)),
 CHECK((supplier_id IS NULL AND billing_status='not_applicable') OR (supplier_id IS NOT NULL AND billing_status<>'not_applicable')),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,vehicle_id) REFERENCES fleet_vehicle(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,driver_id) REFERENCES fleet_driver(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
-- Readings for one vehicle must keep rising; the next entry's previous reading is the highest so far.
CREATE UNIQUE INDEX fleet_fuel_vehicle_odometer ON fleet_fuel_entry(tenant_id,company_id,vehicle_id,odometer);
CREATE INDEX fleet_fuel_directory ON fleet_fuel_entry(tenant_id,company_id,entry_date DESC,code DESC);

CREATE TABLE fleet_maintenance_entry (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^MNT-[0-9]{4,}$'),
 vehicle_id text NOT NULL,
 entry_date date NOT NULL,
 odometer numeric(12,1) CHECK(odometer IS NULL OR odometer>=0),
 work_description text NOT NULL CHECK(length(btrim(work_description)) BETWEEN 3 AND 2000),
 labour_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(labour_amount>=0),
 parts_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(parts_amount>=0),
 total_amount numeric(16,2) NOT NULL,
 is_external boolean NOT NULL DEFAULT false,
 supplier_id text,
 supplier_invoice_ref text NOT NULL DEFAULT '' CHECK(length(supplier_invoice_ref)<=80),
 billing_status text NOT NULL CHECK(billing_status IN ('not_applicable','pending','billed')),
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 CHECK(total_amount=labour_amount+parts_amount AND total_amount>0),
 -- Outsourced work names its vendor; in-house work has none.
 CHECK((is_external AND supplier_id IS NOT NULL AND billing_status<>'not_applicable')
    OR (NOT is_external AND supplier_id IS NULL AND billing_status='not_applicable')),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,company_id,vehicle_id) REFERENCES fleet_vehicle(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,supplier_id) REFERENCES procurement_supplier(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE INDEX fleet_maintenance_directory ON fleet_maintenance_entry(tenant_id,company_id,entry_date DESC,code DESC);
CREATE INDEX fleet_maintenance_vehicle ON fleet_maintenance_entry(tenant_id,company_id,vehicle_id,entry_date);

DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['fleet_fuel_entry','fleet_maintenance_entry'] LOOP
  EXECUTE format('CREATE TRIGGER fleet_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_fleet_record()',name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER fleet_evidence AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_fleet_evidence()',name);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',name);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('fleet',2,'fleet_fuel_maintenance');
