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


CREATE FUNCTION verify_payroll_correction_return_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.workflow_managed AND OLD.state='under_review' AND NEW.state='open' AND NOT EXISTS(
  SELECT 1 FROM hr_payroll_workspace_event e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id
   AND e.record_id=NEW.id AND e.record_type='run' AND e.action='return' AND e.actor_id=NEW.reviewed_by
   AND length(btrim(e.reason))>=5 AND e.before_json#>>'{period,state}'='under_review'
   AND e.before_json#>>'{period,version}'=OLD.version::text
   AND e.after_json#>>'{period,state}'='open' AND e.after_json#>>'{period,version}'=NEW.version::text
   AND e.after_json#>>'{period,run_number}'=OLD.run_number::text
 ) THEN RAISE EXCEPTION 'Payroll correction return requires its matching immutable review event';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER hr_payroll_correction_return_provenance AFTER UPDATE ON hr_payroll_period
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_payroll_correction_return_event();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',124,'payroll_return_for_correction');
