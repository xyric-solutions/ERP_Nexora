DO $migration$
BEGIN
    IF to_regclass('public.approval_override_event') IS NULL THEN
        RAISE EXCEPTION 'HR approval override integration requires Security migration 0014';
    END IF;
END
$migration$;

ALTER TABLE hr_employee_draft_approval
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employment_lifecycle_policy
    ADD COLUMN approval_override_event_id text,
    ADD COLUMN activation_override_event_id text;
ALTER TABLE hr_employment_lifecycle_request
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employee_transfer_request
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employee_promotion_request
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employee_manager_change_request
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employee_work_location_change_request
    ADD COLUMN approval_override_event_id text;
ALTER TABLE hr_employee_organization_placement_change_request
    ADD COLUMN approval_override_event_id text;

ALTER TABLE hr_employee_draft_approval
    ADD CONSTRAINT hr_employee_draft_approval_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employment_lifecycle_policy
    ADD CONSTRAINT hr_lifecycle_policy_approval_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_lifecycle_policy_activation_override_event_fk
        FOREIGN KEY (tenant_id,activation_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employment_lifecycle_request
    ADD CONSTRAINT hr_lifecycle_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_transfer_request
    ADD CONSTRAINT hr_transfer_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_promotion_request
    ADD CONSTRAINT hr_promotion_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_manager_change_request
    ADD CONSTRAINT hr_manager_change_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_work_location_change_request
    ADD CONSTRAINT hr_work_location_change_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;
ALTER TABLE hr_employee_organization_placement_change_request
    ADD CONSTRAINT hr_organization_placement_request_override_event_fk
        FOREIGN KEY (tenant_id,approval_override_event_id)
        REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT;

DO $migration$
DECLARE existing_constraint record;
BEGIN
    FOR existing_constraint IN
        SELECT conrelid::regclass AS relation_name,conname
          FROM pg_constraint
         WHERE contype='c'
           AND conrelid=ANY(ARRAY[
               'hr_employee_transfer_request'::regclass,
               'hr_employee_promotion_request'::regclass,
               'hr_employee_manager_change_request'::regclass,
               'hr_employee_work_location_change_request'::regclass,
               'hr_employee_organization_placement_change_request'::regclass
           ])
           AND pg_get_constraintdef(oid) LIKE '%decided_by <> requested_by%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',existing_constraint.relation_name,existing_constraint.conname);
    END LOOP;

    FOR existing_constraint IN
        SELECT conrelid::regclass AS relation_name,conname
          FROM pg_constraint
         WHERE contype='c'
           AND conrelid='hr_employee_draft_approval'::regclass
           AND pg_get_constraintdef(oid) LIKE '%decision_reason%'
           AND pg_get_constraintdef(oid) LIKE '%state =%pending%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',existing_constraint.relation_name,existing_constraint.conname);
    END LOOP;
END
$migration$;

ALTER TABLE hr_employee_draft_approval
    ADD CONSTRAINT hr_employee_draft_approval_state_evidence_v2 CHECK (
        (
            state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND approval_override_event_id IS NULL
        )
        OR (
            state IN ('approved','rejected')
            AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
        )
    );

ALTER TABLE hr_employment_lifecycle_request
    ADD CONSTRAINT hr_lifecycle_request_override_evidence CHECK (
        (approval_state='pending' AND approval_override_event_id IS NULL)
        OR (
            approval_state IN ('approved','rejected')
            AND (
                (decided_by<>requested_by AND approval_override_event_id IS NULL)
                OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)
            )
        )
        OR (approval_state='cancelled' AND approval_override_event_id IS NULL)
    );

CREATE FUNCTION enforce_hr_request_approval_override() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    row_data jsonb := to_jsonb(NEW);
    old_data jsonb := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    target_resource_id text := row_data->>TG_ARGV[1];
    state_value text := row_data->>TG_ARGV[2];
    maker_actor text := row_data->>TG_ARGV[3];
    decision_actor text := row_data->>'decided_by';
    override_event_id text := row_data->>'approval_override_event_id';
    creator_actor text;
    same_actor boolean;
    target_decision_action text;
BEGIN
    IF state_value IN ('pending','pending_approval') THEN
        IF override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'pending HR decisions cannot contain override evidence'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF state_value NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

    IF TG_TABLE_NAME='hr_employee_draft_approval' THEN
        SELECT employee.created_by INTO creator_actor
          FROM employee
         WHERE employee.tenant_id=NEW.tenant_id
           AND employee.id=NEW.employee_id;
    END IF;
    same_actor := decision_actor IS NOT NULL
        AND (decision_actor=maker_actor OR decision_actor=creator_actor);
    IF same_actor <> (override_event_id IS NOT NULL) THEN
        RAISE EXCEPTION 'same-actor HR approval requires governed override evidence'
            USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE'
       AND old_data->>TG_ARGV[2] IN ('approved','rejected')
       AND old_data->>'approval_override_event_id' IS DISTINCT FROM override_event_id THEN
        RAISE EXCEPTION 'decided HR override evidence is immutable'
            USING ERRCODE='23514';
    END IF;
    IF override_event_id IS NULL THEN RETURN NEW; END IF;

    target_decision_action := CASE state_value WHEN 'approved' THEN 'approve' ELSE 'reject' END;
    IF NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=override_event_id
           AND event.resource_type=TG_ARGV[0]
           AND event.resource_id=target_resource_id
           AND event.actor_user_id=decision_actor
           AND event.decision_action=target_decision_action
    ) THEN
        RAISE EXCEPTION 'approval override event does not match the governed HR decision'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER hr_employee_draft_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_draft_approval
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_draft_approval','id','state','submitted_by'
);
CREATE TRIGGER hr_lifecycle_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employment_lifecycle_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employment_lifecycle_request','id','approval_state','requested_by'
);
CREATE TRIGGER hr_transfer_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_transfer_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_transfer_request','id','request_state','requested_by'
);
CREATE TRIGGER hr_promotion_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_promotion_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_promotion_request','id','request_state','requested_by'
);
CREATE TRIGGER hr_manager_change_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_manager_change_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_manager_change_request','id','request_state','requested_by'
);
CREATE TRIGGER hr_work_location_change_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_work_location_change_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_work_location_change_request','id','request_state','requested_by'
);
CREATE TRIGGER hr_organization_placement_request_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employee_organization_placement_change_request
FOR EACH ROW EXECUTE FUNCTION enforce_hr_request_approval_override(
    'hr.employee_organization_placement_change_request','id','request_state','requested_by'
);

CREATE FUNCTION enforce_hr_lifecycle_policy_approval_override() RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    approval_same_actor boolean;
    activation_same_actor boolean;
BEGIN
    IF NEW.status IN ('draft','pending_approval') THEN
        IF NEW.approval_override_event_id IS NOT NULL
           OR NEW.activation_override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'undecided lifecycle policies cannot contain override evidence'
                USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;

    approval_same_actor := NEW.approved_by IS NOT NULL
        AND (NEW.approved_by=NEW.created_by OR NEW.approved_by=NEW.submitted_by);
    IF approval_same_actor <> (NEW.approval_override_event_id IS NOT NULL) THEN
        RAISE EXCEPTION 'same-actor lifecycle-policy approval requires governed override evidence'
            USING ERRCODE='23514';
    END IF;
    IF NEW.approval_override_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM approval_override_event event
         WHERE event.tenant_id=NEW.tenant_id
           AND event.event_id=NEW.approval_override_event_id
           AND event.resource_type='hr.employment_lifecycle_policy'
           AND event.resource_id=NEW.id
           AND event.actor_user_id=NEW.approved_by
           AND event.decision_action='approve'
    ) THEN
        RAISE EXCEPTION 'approval override event does not match lifecycle-policy approval'
            USING ERRCODE='23514';
    END IF;

    IF NEW.status='approved' THEN
        IF NEW.activation_override_event_id IS NOT NULL THEN
            RAISE EXCEPTION 'unactivated lifecycle policies cannot contain activation override evidence'
                USING ERRCODE='23514';
        END IF;
    ELSE
        activation_same_actor := NEW.activated_by IS NOT NULL
            AND (NEW.activated_by=NEW.created_by OR NEW.activated_by=NEW.submitted_by);
        IF activation_same_actor <> (NEW.activation_override_event_id IS NOT NULL) THEN
            RAISE EXCEPTION 'same-actor lifecycle-policy activation requires governed override evidence'
                USING ERRCODE='23514';
        END IF;
        IF NEW.activation_override_event_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM approval_override_event event
             WHERE event.tenant_id=NEW.tenant_id
               AND event.event_id=NEW.activation_override_event_id
               AND event.resource_type='hr.employment_lifecycle_policy'
               AND event.resource_id=NEW.id
               AND event.actor_user_id=NEW.activated_by
               AND event.decision_action='activate'
        ) THEN
            RAISE EXCEPTION 'approval override event does not match lifecycle-policy activation'
                USING ERRCODE='23514';
        END IF;
    END IF;

    IF TG_OP='UPDATE' THEN
        IF OLD.approval_override_event_id IS DISTINCT FROM NEW.approval_override_event_id
           AND NOT (OLD.status='pending_approval' AND NEW.status='approved') THEN
            RAISE EXCEPTION 'lifecycle-policy approval evidence is immutable'
                USING ERRCODE='23514';
        END IF;
        IF OLD.activation_override_event_id IS DISTINCT FROM NEW.activation_override_event_id
           AND NOT (OLD.status='approved' AND NEW.status='active') THEN
            RAISE EXCEPTION 'lifecycle-policy activation evidence is immutable'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER hr_lifecycle_policy_approval_override_guard
BEFORE INSERT OR UPDATE ON hr_employment_lifecycle_policy
FOR EACH ROW EXECUTE FUNCTION enforce_hr_lifecycle_policy_approval_override();

ALTER TABLE hr_employee_transfer_request
    ADD CONSTRAINT hr_transfer_request_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL
            AND approval_override_event_id IS NULL)
        OR (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
        OR (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
    );
ALTER TABLE hr_employee_promotion_request
    ADD CONSTRAINT hr_promotion_request_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL
            AND approval_override_event_id IS NULL)
        OR (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
        OR (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
    );
ALTER TABLE hr_employee_manager_change_request
    ADD CONSTRAINT hr_manager_change_request_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL
            AND approval_override_event_id IS NULL)
        OR (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
        OR (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
    );
ALTER TABLE hr_employee_work_location_change_request
    ADD CONSTRAINT hr_work_location_change_request_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL
            AND approval_override_event_id IS NULL)
        OR (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
        OR (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
    );
ALTER TABLE hr_employee_organization_placement_change_request
    ADD CONSTRAINT hr_organization_placement_request_state_evidence_v2 CHECK (
        (request_state='pending' AND decided_by IS NULL AND decided_at IS NULL
            AND decision_reason IS NULL AND projected_assignment_id IS NULL
            AND approval_override_event_id IS NULL)
        OR (request_state='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NOT NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
        OR (request_state='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
            AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000
            AND projected_assignment_id IS NULL
            AND ((decided_by<>requested_by AND approval_override_event_id IS NULL)
              OR (decided_by=requested_by AND approval_override_event_id IS NOT NULL)))
    );

CREATE OR REPLACE FUNCTION protect_hr_employee_transfer_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'transfer requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided transfer requests are immutable' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id']) THEN
        RAISE EXCEPTION 'transfer request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION protect_hr_employee_promotion_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'promotion requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided promotion requests are immutable' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id']) THEN
        RAISE EXCEPTION 'promotion request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION protect_hr_employee_manager_change_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'manager-change requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided manager-change requests are immutable' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id']) THEN
        RAISE EXCEPTION 'manager-change request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION protect_hr_employee_work_location_change_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'work-location change requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided work-location change requests are immutable' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id']) THEN
        RAISE EXCEPTION 'work-location change request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION protect_hr_employee_organization_placement_change_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'organization placement change requests cannot be deleted' USING ERRCODE='23514'; END IF;
    IF OLD.request_state<>'pending' THEN RAISE EXCEPTION 'decided organization placement change requests are immutable' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id'])
       <> (to_jsonb(OLD)-ARRAY['request_state','decided_by','decided_at','decision_reason','projected_assignment_id','row_version','approval_override_event_id']) THEN
        RAISE EXCEPTION 'organization placement request evidence is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$function$;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',34,'global_approval_override');
