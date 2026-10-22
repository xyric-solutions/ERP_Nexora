CREATE TABLE hr_personal_data_correction(
 tenant_id text NOT NULL,id text NOT NULL,company_id text NOT NULL,employee_id text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN('submitted','approved','rejected','cancelled')),
 before_profile jsonb NOT NULL,proposed_profile jsonb NOT NULL,source_hash text NOT NULL CHECK(source_hash~'^[0-9a-f]{64}$'),
 requested_by text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 1000),created_at timestamptz NOT NULL DEFAULT now(),
 decided_by text,decision_reason text NOT NULL DEFAULT '',review_reference text NOT NULL DEFAULT '',decided_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),FOREIGN KEY(tenant_id,employee_id) REFERENCES employee(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES security_user_account(tenant_id,id),FOREIGN KEY(tenant_id,decided_by) REFERENCES security_user_account(tenant_id,id),
 CHECK(jsonb_typeof(before_profile)='object' AND jsonb_typeof(proposed_profile)='object' AND before_profile<>proposed_profile)
);
CREATE UNIQUE INDEX hr_personal_data_one_pending ON hr_personal_data_correction(tenant_id,employee_id) WHERE state='submitted';
CREATE INDEX hr_personal_data_company_queue ON hr_personal_data_correction(tenant_id,company_id,state,created_at DESC,id);
CREATE FUNCTION hr_personal_profile_snapshot(t text,e text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('first_name',first_name,'middle_name',middle_name,'last_name',last_name,'preferred_name',preferred_name,'date_of_birth',date_of_birth::text,'personal_email',personal_email,'phone',phone) FROM employee WHERE tenant_id=t AND id=e AND t=current_setting('nexora.tenant_id',true)
$$;
CREATE FUNCTION guard_hr_personal_data_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Personal correction history is immutable';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'submitted' OR NEW.version<>1 OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decision_reason<>'' OR NEW.review_reference<>'' OR NEW.before_profile IS DISTINCT FROM hr_personal_profile_snapshot(NEW.tenant_id,NEW.employee_id) THEN RAISE EXCEPTION 'Corrections start with the actual reviewed employee profile';END IF;
 ELSE
  IF OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected','cancelled') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','state','decided_by','decision_reason','review_reference','decided_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','decided_by','decision_reason','review_reference','decided_at']) OR NEW.decided_by IS NULL OR NEW.decided_at IS NULL OR length(btrim(NEW.decision_reason))<12 THEN RAISE EXCEPTION 'Personal corrections require immutable terms and a versioned decision';END IF;
  IF NEW.state='cancelled' AND NEW.decided_by<>NEW.requested_by THEN RAISE EXCEPTION 'Only the requester can cancel';END IF;
  IF NEW.state IN('approved','rejected') AND(NEW.decided_by=NEW.requested_by OR EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.employee_id AND b.user_id=NEW.decided_by AND b.ended_at IS NULL AND b.effective_from<=current_date AND(b.effective_to IS NULL OR b.effective_to>=current_date))) THEN RAISE EXCEPTION 'An independent HR reviewer is required';END IF;
  IF NEW.state='approved' AND length(btrim(NEW.review_reference))<12 THEN RAISE EXCEPTION 'Supporting information must be independently reviewed';END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.proposed_profile))<>7 OR NOT NEW.proposed_profile ?& ARRAY['first_name','middle_name','last_name','preferred_name','date_of_birth','personal_email','phone'] THEN RAISE EXCEPTION 'Only personal profile fields may be corrected';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_personal_data_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_personal_data_correction FOR EACH ROW EXECUTE FUNCTION guard_hr_personal_data_correction();
CREATE FUNCTION check_hr_personal_data_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='approved' AND(NEW.proposed_profile IS DISTINCT FROM hr_personal_profile_snapshot(NEW.tenant_id,NEW.employee_id) OR NOT EXISTS(SELECT 1 FROM hr_employee_profile_version v WHERE v.tenant_id=NEW.tenant_id AND v.employee_id=NEW.employee_id AND v.source_reference='hr:personal-data-correction:'||NEW.id AND v.recorded_by=NEW.decided_by)) THEN RAISE EXCEPTION 'Approval must atomically apply the canonical profile and immutable version';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hr_personal_data_application AFTER INSERT OR UPDATE ON hr_personal_data_correction DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_hr_personal_data_application();
ALTER TABLE hr_personal_data_correction ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_personal_data_correction FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_personal_data_tenant ON hr_personal_data_correction USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',117,'personal_data_corrections');
