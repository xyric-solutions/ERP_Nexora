-- Retain the inherited dormant payment-state protection while keeping Banking integration deferred.
CREATE OR REPLACE FUNCTION protect_governed_payroll_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.workflow_managed THEN RAISE EXCEPTION 'Governed Payroll periods cannot be deleted'; END IF; RETURN OLD; END IF;
-- Reopening is a review decision. Retain prior calculations; invalidate their submission fingerprint.
IF OLD.workflow_managed AND OLD.state='under_review' AND NEW.state='open' THEN
 IF NEW.version<>OLD.version+1 OR NEW.run_number<>OLD.run_number OR NEW.review_hash IS NOT NULL
  OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
  OR (to_jsonb(NEW)-ARRAY['state','version','reviewed_by','reviewed_at','review_hash','approved_by','approved_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','version','reviewed_by','reviewed_at','review_hash','approved_by','approved_at'])
 THEN RAISE EXCEPTION 'Payroll correction return must preserve the run and retain its reviewer';END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed AND OLD.state='posted' AND NEW.state='paid' THEN
 IF NEW.version<>OLD.version+1 OR NEW.paid_by IS NULL OR NEW.paid_at IS NULL OR (to_jsonb(NEW)-ARRAY['state','version','paid_by','paid_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','paid_by','paid_at']) OR NOT EXISTS(SELECT 1 FROM hr_payroll_payment_batch b WHERE b.tenant_id=NEW.tenant_id AND b.company_id=NEW.company_id AND b.period_id=NEW.id AND b.workflow_managed AND b.payroll_run_number=NEW.run_number AND b.state='confirmed' AND b.confirmed_by=NEW.paid_by AND NOT EXISTS(SELECT 1 FROM hr_payroll_result r WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.period_id=NEW.id AND r.run_number=NEW.run_number AND r.net>0 AND NOT EXISTS(SELECT 1 FROM hr_payroll_payment_settlement s WHERE s.tenant_id=r.tenant_id AND s.company_id=r.company_id AND s.result_id=r.id AND s.batch_id=b.id))) THEN RAISE EXCEPTION 'Paid Payroll requires complete independently confirmed bank evidence';END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed AND ((OLD.state='approved' AND NEW.state='posting_ready') OR(OLD.state='posting_ready' AND NEW.state IN('approved','posted'))) THEN
 IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_by','posted_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','version','posted_by','posted_at']) OR NOT EXISTS(SELECT 1 FROM hr_payroll_journal_proposal j WHERE j.tenant_id=OLD.tenant_id AND j.company_id=OLD.company_id AND j.period_id=OLD.id AND j.run_number=OLD.run_number AND j.workflow_managed AND j.state=CASE WHEN NEW.state='posting_ready' THEN 'accepted' WHEN NEW.state='approved' THEN 'rejected' ELSE 'posted' END) THEN RAISE EXCEPTION 'Payroll posting transition requires its matching governed Finance proposal'; END IF;
 IF NEW.state='posted' AND(NEW.posted_by IS NULL OR NEW.posted_at IS NULL) THEN RAISE EXCEPTION 'Actual Payroll posting evidence is required'; END IF;
 RETURN NEW;
END IF;
IF OLD.workflow_managed THEN
 IF NEW.version<>OLD.version+1 OR ROW(NEW.id,NEW.tenant_id,NEW.company_id,NEW.attendance_period_id,NEW.policy_id,NEW.month,NEW.created_by,NEW.created_at,NEW.workflow_managed) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.company_id,OLD.attendance_period_id,OLD.policy_id,OLD.month,OLD.created_by,OLD.created_at,OLD.workflow_managed) THEN RAISE EXCEPTION 'Payroll identity or version is protected'; END IF;
 IF NOT ((OLD.state IN('open','calculated') AND NEW.state='calculated' AND NEW.run_number=OLD.run_number+1) OR (OLD.state='calculated' AND NEW.state='under_review' AND NEW.run_number=OLD.run_number) OR (OLD.state='under_review' AND NEW.state IN('calculated','approved') AND NEW.run_number=OLD.run_number)) THEN RAISE EXCEPTION 'Unsupported Payroll lifecycle transition'; END IF;
 IF NEW.state='calculated' AND NEW.run_number>OLD.run_number AND (NEW.calculated_by IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Calculation evidence is required'; END IF;
 IF NEW.state='under_review' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL) THEN RAISE EXCEPTION 'Review submission evidence is required'; END IF;
 IF NEW.state='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.review_hash IS NULL) THEN RAISE EXCEPTION 'Payroll approval evidence is required'; END IF;
END IF; RETURN NEW; END $$;



INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',125,'preserve_payroll_paid_transition');
