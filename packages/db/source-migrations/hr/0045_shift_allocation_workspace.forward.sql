ALTER TABLE hr_shift_assignment ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN reference text,ADD COLUMN cancelled_at timestamptz,ADD COLUMN cancelled_by text,
 ADD COLUMN cancellation_reason text,ADD COLUMN replaces_assignment_id text,
 ADD CONSTRAINT fk_hr_shift_allocation_cancel_actor FOREIGN KEY(tenant_id,cancelled_by) REFERENCES security_user_account(tenant_id,id),
 ADD CONSTRAINT fk_hr_shift_allocation_previous FOREIGN KEY(tenant_id,replaces_assignment_id) REFERENCES hr_shift_assignment(tenant_id,id),
 ADD CONSTRAINT ck_hr_shift_allocation_cancel CHECK((cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND char_length(btrim(cancellation_reason)) BETWEEN 8 AND 1000));
-- Prepare metadata-only backfill without revalidating historical masters.
CREATE OR REPLACE FUNCTION lock_hr_shift_assignment_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 PERFORM 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id AND time_zone IS NOT NULL AND required_work_minutes IS NOT NULL AND (kind<>'rotating' OR rotation_anchor_date IS NOT NULL)) THEN RAISE EXCEPTION 'Configure shift timezone and work rules before assigning it' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION validate_hr_shift_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE site text;covered boolean;
BEGIN
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 SELECT work_location_id INTO site FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id AND company_id=NEW.company_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shift is unavailable in the selected company' USING ERRCODE='23514'; END IF;
 IF NEW.scope='employee' THEN
  SELECT coalesce(range_agg(daterange(a.effective_from,coalesce(a.effective_to,'infinity'::date),'[]')) @> daterange(NEW.effective_from,coalesce(NEW.effective_to,'infinity'::date),'[]'),false) INTO covered
   FROM employee_assignment a JOIN employee e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id LEFT JOIN hr_employment_relationship r ON r.tenant_id=a.tenant_id AND r.id=a.employment_relationship_id
   WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.employee_id=NEW.scope_id AND e.status IN ('active','probation','confirmed') AND (a.assignment_status='legacy_compatibility' OR (a.assignment_status='active' AND r.approval_state='approved' AND r.status='active'));
  IF NOT covered THEN RAISE EXCEPTION 'Approved employment must cover the complete shift allocation interval' USING ERRCODE='23514'; END IF;
  IF site IS NOT NULL AND EXISTS(SELECT 1 FROM employee_assignment a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.employee_id=NEW.scope_id AND a.assignment_status IN ('active','legacy_compatibility') AND daterange(a.effective_from,coalesce(a.effective_to,'infinity'::date),'[]') && daterange(NEW.effective_from,coalesce(NEW.effective_to,'infinity'::date),'[]') AND a.work_location_id IS DISTINCT FROM site) THEN RAISE EXCEPTION 'Employee placement does not match the shift work location' USING ERRCODE='23514'; END IF;
 ELSE
  IF site IS NOT NULL THEN RAISE EXCEPTION 'Department and branch defaults require a company-wide shift' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(WITH RECURSIVE ancestors AS(SELECT id,parent_id,type FROM organization_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.scope_id AND type=NEW.scope AND status='active' UNION ALL SELECT p.id,p.parent_id,p.type FROM organization_unit p JOIN ancestors c ON c.parent_id=p.id WHERE p.tenant_id=NEW.tenant_id AND p.status='active') SELECT 1 FROM ancestors WHERE id=NEW.company_id AND type='company') THEN RAISE EXCEPTION 'Shift organisation scope must have the exact type and belong to this company' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

UPDATE hr_shift_assignment SET reference='SAS-'||upper(substr(md5(id),1,16));
ALTER TABLE hr_shift_assignment ALTER COLUMN reference SET NOT NULL;
ALTER TABLE hr_shift_assignment ALTER COLUMN reference SET DEFAULT ('SAS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)));
CREATE UNIQUE INDEX uq_hr_shift_allocation_reference ON hr_shift_assignment(tenant_id,company_id,reference);
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='hr_shift_assignment'::regclass AND contype IN ('u','x') LOOP EXECUTE format('ALTER TABLE hr_shift_assignment DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX uq_hr_shift_allocation_start ON hr_shift_assignment(tenant_id,company_id,scope,scope_id,effective_from) WHERE cancelled_at IS NULL;
ALTER TABLE hr_shift_assignment ADD CONSTRAINT ex_hr_shift_allocation_interval EXCLUDE USING gist(tenant_id WITH =,company_id WITH =,scope WITH =,scope_id WITH =,daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') WITH &&) WHERE(cancelled_at IS NULL);
CREATE TABLE hr_shift_assignment_event (
 tenant_id text NOT NULL,id text NOT NULL,assignment_id text NOT NULL,version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('create','close','cancel','supersede')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 8 AND 1000),related_assignment_id text,
 before_snapshot jsonb,after_snapshot jsonb NOT NULL,actor_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,assignment_id,version),
 FOREIGN KEY(tenant_id,assignment_id) REFERENCES hr_shift_assignment(tenant_id,id),
 FOREIGN KEY(tenant_id,related_assignment_id) REFERENCES hr_shift_assignment(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE hr_shift_assignment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_shift_assignment_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_shift_assignment_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_shift_assignment_event_immutable BEFORE UPDATE OR DELETE ON hr_shift_assignment_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE FUNCTION guard_hr_shift_allocation_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_from date;affected_to date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Shift allocation history cannot be deleted' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));
 affected_from:=NEW.effective_from;affected_to:=NEW.effective_to;
 IF TG_OP='UPDATE' THEN
  IF OLD.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Cancelled allocation evidence is immutable' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.scope,NEW.scope_id,NEW.shift_id,NEW.effective_from,NEW.note,NEW.created_by,NEW.created_at,NEW.reference,NEW.replaces_assignment_id) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.scope,OLD.scope_id,OLD.shift_id,OLD.effective_from,OLD.note,OLD.created_by,OLD.created_at,OLD.reference,OLD.replaces_assignment_id) THEN RAISE EXCEPTION 'Shift allocation identity is immutable; create a replacement' USING ERRCODE='23514'; END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Allocation version must advance by one' USING ERRCODE='23514'; END IF;
  affected_to:=OLD.effective_to;
  IF NEW.cancelled_at IS NOT NULL THEN
   IF OLD.effective_from<current_date OR NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN RAISE EXCEPTION 'Only unstarted allocations can be cancelled' USING ERRCODE='23514'; END IF;
  ELSE
   IF NEW.effective_to IS NULL OR NEW.effective_to<greatest(OLD.effective_from,current_date-1) OR (OLD.effective_to IS NOT NULL AND NEW.effective_to>=OLD.effective_to) THEN RAISE EXCEPTION 'Closing can only shorten the current or future interval' USING ERRCODE='23514'; END IF;
   affected_from:=NEW.effective_to+1;
  END IF;
 END IF;
 PERFORM 1 FROM hr_attendance_period p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND daterange(p.month,(p.month+interval '1 month')::date,'[)') && daterange(affected_from,coalesce(affected_to,'infinity'::date),'[]') FOR SHARE;
 IF EXISTS(SELECT 1 FROM hr_attendance_period p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.state='locked' AND daterange(p.month,(p.month+interval '1 month')::date,'[)') && daterange(affected_from,coalesce(affected_to,'infinity'::date),'[]')) THEN RAISE EXCEPTION 'Shift allocation cannot change locked attendance' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_a0_shift_allocation_history BEFORE INSERT OR UPDATE OR DELETE ON hr_shift_assignment FOR EACH ROW EXECUTE FUNCTION guard_hr_shift_allocation_history();
CREATE FUNCTION lock_hr_attendance_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('nexora:hr:attendance:'||NEW.tenant_id||':'||NEW.company_id,0));RETURN NEW;
END $$;
CREATE TRIGGER hr_a0_period_configuration_lock BEFORE INSERT OR UPDATE OF state ON hr_attendance_period FOR EACH ROW EXECUTE FUNCTION lock_hr_attendance_configuration();
-- Ending/cancelling historical legacy allocations must not revalidate changed masters.
-- The root shift guard is replaced below to exclude cancelled allocations from availability checks.

CREATE OR REPLACE FUNCTION guard_hr_shift_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Shift history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.company_type,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.company_type,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Shift identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Shift version must advance by one' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','updated_at','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','version']) AND
   (EXISTS(SELECT 1 FROM hr_shift_assignment WHERE tenant_id=OLD.tenant_id AND shift_id=OLD.id) OR EXISTS(SELECT 1 FROM hr_shift_rotation WHERE tenant_id=OLD.tenant_id AND rotation_shift_id=OLD.id)) THEN RAISE EXCEPTION 'Referenced shift rules are immutable; create a new shift code' USING ERRCODE='23514'; END IF;
 IF NEW.status='inactive' AND OLD.status='active' AND
   (EXISTS(SELECT 1 FROM hr_shift_assignment WHERE tenant_id=OLD.tenant_id AND shift_id=OLD.id AND cancelled_at IS NULL AND (effective_to IS NULL OR effective_to>=current_date)) OR EXISTS(SELECT 1 FROM hr_shift_rotation r JOIN hr_shift p ON p.tenant_id=r.tenant_id AND p.id=r.shift_id WHERE r.tenant_id=OLD.tenant_id AND r.rotation_shift_id=OLD.id AND p.status='active')) THEN RAISE EXCEPTION 'Current or future assignments and active rotations require this shift' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',45,'shift_allocation_workspace');
