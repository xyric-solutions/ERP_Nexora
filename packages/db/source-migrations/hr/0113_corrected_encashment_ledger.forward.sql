ALTER TABLE hr_leave_transaction DROP CONSTRAINT hr_leave_transaction_kind_check,DROP CONSTRAINT hr_leave_transaction_source_type_check;
ALTER TABLE hr_leave_transaction ADD CONSTRAINT hr_leave_transaction_kind_check CHECK(kind IN('opening','accrual','carry_forward','adjustment','used','expiry','reversal','encashed','encashment_reversal','encashment_correction')),
 ADD CONSTRAINT hr_leave_transaction_source_type_check CHECK(source_type IN('opening','policy','manual_adjustment','leave_request','reversal','final_settlement','settlement_void','settlement_correction'));
CREATE FUNCTION guard_hr_corrected_encashment_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source hr_settlement_encashment_source%ROWTYPE;execution hr_settlement_correction_execution%ROWTYPE;entry jsonb;available numeric;encashed numeric;
BEGIN
 IF NEW.kind<>'encashment_correction' AND NEW.source_type<>'settlement_correction' THEN RETURN NEW;END IF;
 SELECT * INTO execution FROM hr_settlement_correction_execution WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.evidence_json->>'execution_id' AND state='posted';
 SELECT * INTO source FROM hr_settlement_encashment_source WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.evidence_json->>'original_source_id' AND case_id=execution.case_id;
 SELECT value INTO entry FROM jsonb_array_elements(execution.snapshot->'leave_changes') WHERE value->>'source_id'=source.id;
 IF NEW.kind<>'encashment_correction' OR NEW.source_type<>'settlement_correction' OR execution.id IS NULL OR source.id IS NULL OR entry IS NULL OR NEW.source_id<>execution.id||':'||source.id OR NEW.created_by<>execution.posted_by OR NEW.days IS DISTINCT FROM(entry->>'delta_days')::numeric OR NEW.days=0 OR NEW.employee_id<>entry->>'employee_id' OR NEW.leave_type_id<>source.leave_type_id OR NEW.effective_on<>source.as_of OR NEW.policy_version_id IS DISTINCT FROM source.leave_policy_version_id OR NEW.evidence_hash IS DISTINCT FROM execution.source_hash THEN RAISE EXCEPTION 'Leave correction requires its exact independently approved and actually posted supplemental source';END IF;
 SELECT -coalesce(sum(days),0) INTO encashed FROM hr_leave_transaction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND((kind='encashed' AND source_type='final_settlement' AND source_id=source.id) OR(kind='encashment_correction' AND evidence_json->>'original_source_id'=source.id));
 IF encashed IS DISTINCT FROM(entry->>'original_days')::numeric OR encashed-NEW.days<0 THEN RAISE EXCEPTION 'The original encashment quantity changed or would be restored twice';END IF;
 IF NEW.days<0 THEN
  SELECT coalesce(sum(CASE WHEN effective_on<=NEW.effective_on THEN days WHEN kind IN('used','reversal','encashed','encashment_reversal','encashment_correction') THEN days ELSE 0 END),0)-(SELECT coalesce(sum(requested_days),0) FROM hr_leave_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND status IN('pending_manager','pending_hr')) INTO available FROM hr_leave_transaction WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id;
  IF available+NEW.days<0 THEN RAISE EXCEPTION 'Additional encashment cannot consume reserved or unavailable leave';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER hr_corrected_encashment_ledger BEFORE INSERT ON hr_leave_transaction FOR EACH ROW EXECUTE FUNCTION guard_hr_corrected_encashment_ledger();
CREATE FUNCTION validate_hr_corrected_encashment_commit() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE item jsonb;BEGIN
 IF NEW.state='posted' THEN FOR item IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'leave_changes') LOOP
  IF NOT EXISTS(SELECT 1 FROM hr_leave_transaction t WHERE t.tenant_id=NEW.tenant_id AND t.company_id=NEW.company_id AND t.kind='encashment_correction' AND t.source_type='settlement_correction' AND t.source_id=NEW.id||':'||(item->>'source_id') AND t.days=(item->>'delta_days')::numeric AND t.evidence_hash=NEW.source_hash) THEN RAISE EXCEPTION 'Supplemental posting and its exact leave correction must commit atomically';END IF;
 END LOOP;END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_corrected_encashment_commit AFTER INSERT OR UPDATE ON hr_settlement_correction_execution DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_hr_corrected_encashment_commit();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',113,'corrected_encashment_ledger');
