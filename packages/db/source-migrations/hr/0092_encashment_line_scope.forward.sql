CREATE OR REPLACE FUNCTION guard_hr_encashment_case_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l jsonb;s hr_settlement_encashment_source%ROWTYPE;seen text[]:='{}';
BEGIN
 IF NEW.kind<>'settlement' THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.terms->'lines') AS expanded(value) WHERE expanded.value->>'source_reference' LIKE 'Approved encashment rule %' AND NOT(expanded.value ? 'encashment_source_id')) THEN RAISE EXCEPTION 'A calculated encashment reference cannot be detached from its protected source';END IF;
 FOR l IN SELECT * FROM jsonb_array_elements(NEW.terms->'lines') WHERE value ? 'encashment_source_id' LOOP
  SELECT * INTO s FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND case_id=NEW.id AND id=l->>'encashment_source_id';
  IF s.id IS NULL OR(l-'encashment_source_id') IS DISTINCT FROM s.snapshot->'line' OR s.leave_type_id=ANY(seen) THEN RAISE EXCEPTION 'Calculated encashment lines retain their exact source and cannot duplicate a leave type';END IF;
  seen:=array_append(seen,s.leave_type_id);
 END LOOP;
 RETURN NEW;
END $$;


INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',92,'encashment_line_scope');
