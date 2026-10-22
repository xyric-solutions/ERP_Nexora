-- Extend the existing attendance authority; legacy rows remain visible until configured.
ALTER TABLE hr_shift ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN time_zone text CHECK(time_zone IS NULL OR char_length(time_zone) BETWEEN 1 AND 80),
 ADD COLUMN work_location_id text,
 ADD COLUMN required_work_minutes smallint CHECK(required_work_minutes BETWEEN 1 AND 1440),
 ADD COLUMN rotation_anchor_date date CHECK(rotation_anchor_date IS NULL OR extract(isodow from rotation_anchor_date)=1),
 ADD CONSTRAINT fk_hr_shift_work_location FOREIGN KEY(tenant_id,work_location_id) REFERENCES hr_master_record(tenant_id,id) ON DELETE RESTRICT;
CREATE TABLE hr_shift_rule_event (
 tenant_id text NOT NULL,id text NOT NULL,shift_id text NOT NULL,version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('create','update','status')),reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 8 AND 1000),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),actor_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,shift_id,version),
 FOREIGN KEY(tenant_id,shift_id) REFERENCES hr_shift(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
ALTER TABLE hr_shift_rule_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_shift_rule_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_shift_rule_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER hr_shift_rule_event_immutable BEFORE UPDATE OR DELETE ON hr_shift_rule_event FOR EACH ROW EXECUTE FUNCTION reject_hr_immutable_mutation();
CREATE FUNCTION guard_hr_shift_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Shift history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.company_id,NEW.company_type,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.company_id,OLD.company_type,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Shift identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Shift version must advance by one' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','updated_at','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','version']) AND
   (EXISTS(SELECT 1 FROM hr_shift_assignment WHERE tenant_id=OLD.tenant_id AND shift_id=OLD.id) OR EXISTS(SELECT 1 FROM hr_shift_rotation WHERE tenant_id=OLD.tenant_id AND rotation_shift_id=OLD.id)) THEN RAISE EXCEPTION 'Referenced shift rules are immutable; create a new shift code' USING ERRCODE='23514'; END IF;
 IF NEW.status='inactive' AND OLD.status='active' AND
   (EXISTS(SELECT 1 FROM hr_shift_assignment WHERE tenant_id=OLD.tenant_id AND shift_id=OLD.id AND (effective_to IS NULL OR effective_to>=current_date)) OR EXISTS(SELECT 1 FROM hr_shift_rotation r JOIN hr_shift p ON p.tenant_id=r.tenant_id AND p.id=r.shift_id WHERE r.tenant_id=OLD.tenant_id AND r.rotation_shift_id=OLD.id AND p.status='active')) THEN RAISE EXCEPTION 'Current or future assignments and active rotations require this shift' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_rules_guard BEFORE UPDATE OR DELETE ON hr_shift FOR EACH ROW EXECUTE FUNCTION guard_hr_shift_rules();
CREATE FUNCTION guard_hr_shift_child_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; row_tenant text;
BEGIN
 parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.shift_id ELSE NEW.shift_id END;
 row_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 IF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.shift_id) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.shift_id) THEN RAISE EXCEPTION 'Shift child ownership is immutable' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM hr_shift WHERE tenant_id=row_tenant AND id=parent_id FOR SHARE;
 IF EXISTS(SELECT 1 FROM hr_shift_assignment WHERE tenant_id=row_tenant AND shift_id=parent_id) OR EXISTS(SELECT 1 FROM hr_shift_rotation WHERE tenant_id=row_tenant AND rotation_shift_id=parent_id) THEN RAISE EXCEPTION 'Referenced shift rules are immutable; create a new shift code' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_break_rules_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_shift_break FOR EACH ROW EXECUTE FUNCTION guard_hr_shift_child_rules();
CREATE TRIGGER hr_shift_rotation_rules_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_shift_rotation FOR EACH ROW EXECUTE FUNCTION guard_hr_shift_child_rules();
CREATE FUNCTION lock_hr_shift_rotation_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.rotation_shift_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM hr_shift target JOIN hr_shift base ON base.tenant_id=target.tenant_id AND base.id=NEW.shift_id WHERE target.tenant_id=NEW.tenant_id AND target.id=NEW.rotation_shift_id AND target.company_id=base.company_id AND target.kind<>'rotating' AND target.status='active' AND target.time_zone IS NOT NULL AND target.required_work_minutes IS NOT NULL AND target.time_zone=base.time_zone AND target.work_location_id IS NOT DISTINCT FROM base.work_location_id) THEN RAISE EXCEPTION 'Rotation members must be configured leaf shifts at the same company, timezone and location' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_rotation_target_lock BEFORE INSERT OR UPDATE ON hr_shift_rotation FOR EACH ROW EXECUTE FUNCTION lock_hr_shift_rotation_target();
-- Serialize rule/status changes with assignments. Existing scope validation remains authoritative.
CREATE FUNCTION lock_hr_shift_assignment_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM hr_shift WHERE tenant_id=NEW.tenant_id AND id=NEW.shift_id AND time_zone IS NOT NULL AND required_work_minutes IS NOT NULL AND (kind<>'rotating' OR rotation_anchor_date IS NOT NULL)) THEN RAISE EXCEPTION 'Configure shift timezone and work rules before assigning it' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_assignment_rules_lock BEFORE INSERT OR UPDATE ON hr_shift_assignment FOR EACH ROW EXECUTE FUNCTION lock_hr_shift_assignment_rules();
CREATE FUNCTION validate_hr_shift_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.work_location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_master_record WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.work_location_id AND master_type='work_location' AND status='active') THEN RAISE EXCEPTION 'Work location must be active in the shift company' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_shift_location_scope BEFORE INSERT OR UPDATE OF work_location_id ON hr_shift FOR EACH ROW EXECUTE FUNCTION validate_hr_shift_location();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',44,'shift_rules_workspace');
