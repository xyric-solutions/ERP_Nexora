CREATE TABLE security_permission_definition (
    permission_key text PRIMARY KEY CHECK (
        permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'
    ),
    module text NOT NULL CHECK (module ~ '^[a-z][a-z0-9_]*$'),
    resource text NOT NULL CHECK (
        resource ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    ),
    action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*$'),
    description text NOT NULL CHECK (length(description) BETWEEN 1 AND 512),
    required_assurance text NOT NULL CHECK (
        required_assurance IN ('password', 'mfa')
    ),
    field_context_required boolean NOT NULL DEFAULT false,
    source_state_context_required boolean NOT NULL DEFAULT false,
    sensitivity text NOT NULL CHECK (
        sensitivity IN ('standard', 'sensitive', 'restricted')
    ),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    CHECK (permission_key = module || '.' || resource || '.' || action)
);

WITH reviewed_permission(permission_key) AS (
    SELECT unnest(ARRAY[
        'finance.account.create',
        'finance.account.read',
        'finance.accounting_event.create',
        'finance.accounting_event.post',
        'finance.accounting_event.read',
        'finance.budget.create',
        'finance.consolidation.configure',
        'finance.journal.create',
        'finance.journal.post',
        'finance.journal.read',
        'finance.journal.reverse',
        'finance.period.close',
        'finance.period.reopen',
        'finance.recurring_journal.create',
        'finance.report.audit_read',
        'finance.report.consolidate',
        'finance.report.drilldown',
        'finance.report.read',
        'finance.report_definition.manage',
        'hr.attendance.calendar.manage',
        'hr.attendance.calendar.read',
        'hr.attendance.correction.cancel',
        'hr.attendance.correction.create',
        'hr.attendance.correction.hr_approve',
        'hr.attendance.correction.hr_reject',
        'hr.attendance.correction.manager_approve',
        'hr.attendance.correction.manager_reject',
        'hr.attendance.correction.read',
        'hr.attendance.correction.submit',
        'hr.attendance.overtime.cancel',
        'hr.attendance.overtime.create',
        'hr.attendance.overtime.hr_approve',
        'hr.attendance.overtime.hr_reject',
        'hr.attendance.overtime.manager_approve',
        'hr.attendance.overtime.manager_reject',
        'hr.attendance.overtime.read',
        'hr.attendance.overtime.submit',
        'hr.attendance.overtime_rule.manage',
        'hr.attendance.overtime_rule.read',
        'hr.attendance.payroll_input.read',
        'hr.attendance.period.lock',
        'hr.attendance.period.manage',
        'hr.attendance.period.read',
        'hr.attendance.punch.create',
        'hr.attendance.punch.read',
        'hr.attendance.read',
        'hr.attendance.shift.manage',
        'hr.attendance.shift.read',
        'hr.employee.approve',
        'hr.employee.create',
        'hr.employee.read',
        'hr.employee.submit',
        'hr.employee.update',
        'hr.employee_assignment.change',
        'hr.employee_assignment.create',
        'hr.employee_assignment.manager_change',
        'hr.employee_assignment.organization_change',
        'hr.employee_assignment.read',
        'hr.employee_assignment.transfer',
        'hr.employee_assignment.work_location_change',
        'hr.employee_audit.read',
        'hr.employee_contact.manage',
        'hr.employee_contact.read',
        'hr.employee_document.manage',
        'hr.employee_document.read',
        'hr.employee_emergency_contact.manage',
        'hr.employee_emergency_contact.read',
        'hr.employee_identity.manage',
        'hr.employee_identity.read',
        'hr.employee_private.read',
        'hr.employee_private.update',
        'hr.employee_profile_history.read',
        'hr.employee_sensitive_metadata.read',
        'hr.employment_context.read',
        'hr.employment_history.read',
        'hr.employment_lifecycle.action',
        'hr.employment_lifecycle.approve',
        'hr.employment_lifecycle.rehire',
        'hr.employment_lifecycle.terminate',
        'hr.employment_lifecycle_policy.approve',
        'hr.employment_lifecycle_policy.manage',
        'hr.employment_lifecycle_policy.read',
        'hr.employment_relationship.create',
        'hr.employment_relationship.read',
        'hr.jurisdiction_override.approve',
        'hr.jurisdiction_override.manage',
        'hr.jurisdiction_override.read',
        'hr.leave.balance.adjust',
        'hr.leave.balance.read',
        'hr.leave.request.cancel',
        'hr.leave.request.create',
        'hr.leave.request.hr_approve',
        'hr.leave.request.hr_reject',
        'hr.leave.request.manager_approve',
        'hr.leave.request.manager_reject',
        'hr.leave.request.read',
        'hr.leave.request.submit',
        'hr.leave.type.manage',
        'hr.leave.type.read',
        'hr.localization_resolution.read',
        'hr.master.create',
        'hr.master.delete',
        'hr.master.read',
        'hr.master.update',
        'hr.organization.read',
        'hr.organization.update',
        'hr.payroll.adjustment.approve',
        'hr.payroll.adjustment.manage',
        'hr.payroll.adjustment.read',
        'hr.payroll.loan.approve',
        'hr.payroll.loan.manage',
        'hr.payroll.loan.read',
        'hr.payroll.payment.confirm',
        'hr.payroll.payment.manage',
        'hr.payroll.payment.read',
        'hr.payroll.payslip.read',
        'hr.payroll.payslip.release',
        'hr.payroll.period.approve',
        'hr.payroll.period.manage',
        'hr.payroll.period.read',
        'hr.payroll.recalculate',
        'hr.payroll.report.read',
        'hr.payroll.result.read',
        'hr.payroll.salary.approve',
        'hr.payroll.salary.manage',
        'hr.payroll.salary.read',
        'hr.payroll.setup.manage',
        'hr.payroll.setup.read',
        'hr.statutory_rule.read',
        'hr.work_location_jurisdiction.manage',
        'hr.work_location_jurisdiction.read',
        'inventory.bin.create',
        'inventory.bin.read',
        'inventory.item.create',
        'inventory.item.read',
        'inventory.stock.read',
        'platform.accounting_period.create',
        'platform.accounting_period.read',
        'platform.audit_event.read',
        'platform.company_legal_profile.manage',
        'platform.company_legal_profile.read',
        'platform.company_payroll_configuration.manage',
        'platform.company_payroll_configuration.read',
        'platform.company_registration.manage',
        'platform.company_registration.read',
        'platform.currency.create',
        'platform.currency.read',
        'platform.currency_rate.create',
        'platform.currency_rate.read',
        'platform.fiscal_calendar.create',
        'platform.fiscal_calendar.read',
        'platform.localization.activate',
        'platform.localization.read',
        'platform.numbering_sequence.allocate',
        'platform.numbering_sequence.create',
        'platform.numbering_sequence.read',
        'platform.organization_unit.create',
        'platform.organization_unit.read',
        'platform.organization_unit.update',
        'platform.resources.create',
        'platform.resources.read',
        'platform.setup_draft.activate',
        'platform.setup_draft.create',
        'platform.setup_draft.decide',
        'platform.setup_draft.read',
        'platform.tenant.create',
        'platform.tenant.read',
        'platform.tenant_module.create',
        'platform.tenant_module.read',
        'platform.tenant_policy.create',
        'platform.tenant_policy.read',
        'procurement.document.action',
        'procurement.document.approve',
        'procurement.document.create',
        'procurement.document.read',
        'procurement.document.submit',
        'procurement.invoice_match.create',
        'procurement.purchase_order.create',
        'procurement.receipt.create',
        'procurement.receipt.post',
        'procurement.requisition.create',
        'procurement.vendor.create',
        'procurement.vendor.read',
        'security.role_assignment.create',
        'security.role_policy.create',
        'security.user_account.create',
        'workflow.approval.approve',
        'workflow.approval.reject'
    ]::text[])
)
INSERT INTO security_permission_definition (
    permission_key, module, resource, action, description,
    required_assurance, field_context_required,
    source_state_context_required, sensitivity
)
SELECT
    permission_key,
    split_part(permission_key, '.', 1),
    regexp_replace(permission_key, '^[^.]+\.(.*)\.[^.]+$', '\1'),
    split_part(
        permission_key,
        '.',
        array_length(string_to_array(permission_key, '.'), 1)
    ),
    'Reviewed production permission ' || permission_key || '.',
    'password',
    false,
    false,
    'standard'
FROM reviewed_permission;

INSERT INTO security_permission_definition (
    permission_key, module, resource, action, description,
    required_assurance, field_context_required,
    source_state_context_required, sensitivity
)
VALUES
    ('security.authorization.administer', 'security', 'authorization', 'administer', 'Administer tenant authorization without delegated grant limits.', 'mfa', false, false, 'restricted'),
    ('security.authorization.permission.read', 'security', 'authorization.permission', 'read', 'Read the reviewed permission catalogue.', 'password', false, false, 'sensitive'),
    ('security.authorization.role.read', 'security', 'authorization.role', 'read', 'Read tenant roles and policy versions.', 'password', false, false, 'sensitive'),
    ('security.authorization.role.create', 'security', 'authorization.role', 'create', 'Create a draft tenant role policy.', 'mfa', true, false, 'restricted'),
    ('security.authorization.role.edit', 'security', 'authorization.role', 'edit', 'Edit a draft tenant role policy.', 'mfa', true, true, 'restricted'),
    ('security.authorization.role.submit', 'security', 'authorization.role', 'submit', 'Submit a draft tenant role policy for approval.', 'mfa', false, true, 'restricted'),
    ('security.authorization.role.approve', 'security', 'authorization.role', 'approve', 'Approve or reject a submitted tenant role policy.', 'mfa', false, true, 'restricted'),
    ('security.authorization.role.activate', 'security', 'authorization.role', 'activate', 'Activate an approved tenant role policy.', 'mfa', false, true, 'restricted'),
    ('security.authorization.role.archive', 'security', 'authorization.role', 'archive', 'Archive a tenant role or active policy version.', 'mfa', false, true, 'restricted'),
    ('security.authorization.assignment.read', 'security', 'authorization.assignment', 'read', 'Read governed role assignments.', 'password', false, false, 'sensitive'),
    ('security.authorization.assignment.create', 'security', 'authorization.assignment', 'create', 'Create a governed role assignment request.', 'mfa', true, false, 'restricted'),
    ('security.authorization.assignment.edit', 'security', 'authorization.assignment', 'edit', 'Edit a pending governed role assignment request.', 'mfa', true, true, 'restricted'),
    ('security.authorization.assignment.submit', 'security', 'authorization.assignment', 'submit', 'Submit a governed role assignment request for approval.', 'mfa', false, true, 'restricted'),
    ('security.authorization.assignment.approve', 'security', 'authorization.assignment', 'approve', 'Approve or reject a governed role assignment request.', 'mfa', false, true, 'restricted'),
    ('security.authorization.assignment.revoke', 'security', 'authorization.assignment', 'revoke', 'Revoke an effective governed role assignment.', 'mfa', false, true, 'restricted'),
    ('security.authorization.audit.read', 'security', 'authorization.audit', 'read', 'Read tenant authorization administration evidence.', 'password', false, false, 'sensitive');

CREATE FUNCTION protect_security_permission_definition() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF current_user <> pg_get_userbyid(
        (SELECT relowner FROM pg_class WHERE oid = TG_RELID)
    ) THEN
        RAISE EXCEPTION 'security permission definitions are migration-owned'
            USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(NEW, OLD);
END
$function$;

CREATE TRIGGER security_permission_definition_owner_write
BEFORE INSERT OR UPDATE OR DELETE ON security_permission_definition
FOR EACH ROW EXECUTE FUNCTION protect_security_permission_definition();

CREATE TABLE security_tenant_role (
    tenant_id text NOT NULL,
    role_id text NOT NULL CHECK (length(role_id) BETWEEN 1 AND 128),
    role_code text NOT NULL CHECK (role_code ~ '^[a-z][a-z0-9_]{0,63}$'),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 128),
    description text NOT NULL DEFAULT '' CHECK (length(description) <= 512),
    lifecycle_state text NOT NULL DEFAULT 'active' CHECK (
        lifecycle_state IN ('active', 'archived')
    ),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    archived_by text,
    archived_at timestamptz,
    PRIMARY KEY (tenant_id, role_id),
    UNIQUE (tenant_id, role_code),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, archived_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (lifecycle_state = 'active' AND archived_by IS NULL AND archived_at IS NULL)
        OR
        (lifecycle_state = 'archived' AND archived_by IS NOT NULL AND archived_at IS NOT NULL)
    )
);

CREATE TABLE security_administration_command (
    tenant_id text NOT NULL,
    command_id text NOT NULL CHECK (length(command_id) BETWEEN 1 AND 128),
    actor_id text NOT NULL,
    operation text NOT NULL CHECK (
        operation ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    ),
    correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 128),
    idempotency_key text NOT NULL CHECK (
        idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
    ),
    request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
    outcome text NOT NULL DEFAULT 'pending' CHECK (
        outcome IN ('pending', 'completed', 'rejected')
    ),
    result_projection jsonb CHECK (
        result_projection IS NULL OR jsonb_typeof(result_projection) = 'object'
    ),
    audit_event_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    PRIMARY KEY (tenant_id, command_id),
    UNIQUE (tenant_id, actor_id, operation, idempotency_key),
    FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, actor_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, audit_event_id)
        REFERENCES security_audit_event (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (outcome = 'pending' AND completed_at IS NULL AND audit_event_id IS NULL)
        OR
        (
            outcome IN ('completed', 'rejected')
            AND completed_at IS NOT NULL
            AND audit_event_id IS NOT NULL
            AND result_projection IS NOT NULL
        )
    )
);

ALTER TABLE security_role_policy
    ADD COLUMN role_id text,
    ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'active' CHECK (
        lifecycle_state IN ('draft', 'submitted', 'approved', 'active', 'archived')
    ),
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    ADD COLUMN supersedes_policy_id text,
    ADD COLUMN created_by text,
    ADD COLUMN submitted_by text,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN approved_by text,
    ADD COLUMN approved_at timestamptz,
    ADD COLUMN activated_by text,
    ADD COLUMN activated_at timestamptz,
    ADD COLUMN archived_by text,
    ADD COLUMN archived_at timestamptz,
    ADD CONSTRAINT security_role_policy_role_fk
        FOREIGN KEY (tenant_id, role_id)
        REFERENCES security_tenant_role (tenant_id, role_id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_submitted_by_fk
        FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_approved_by_fk
        FOREIGN KEY (tenant_id, approved_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_activated_by_fk
        FOREIGN KEY (tenant_id, activated_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_archived_by_fk
        FOREIGN KEY (tenant_id, archived_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_role_policy_submission_evidence CHECK (
        (submitted_by IS NULL AND submitted_at IS NULL)
        OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)
    ),
    ADD CONSTRAINT security_role_policy_approval_evidence CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    ADD CONSTRAINT security_role_policy_activation_evidence CHECK (
        (activated_by IS NULL AND activated_at IS NULL)
        OR (activated_by IS NOT NULL AND activated_at IS NOT NULL)
    ),
    ADD CONSTRAINT security_role_policy_archive_evidence CHECK (
        (archived_by IS NULL AND archived_at IS NULL)
        OR (archived_by IS NOT NULL AND archived_at IS NOT NULL)
    );

CREATE INDEX security_role_policy_tenant_role_identity
    ON security_role_policy (tenant_id, role_id, lifecycle_state);

CREATE TABLE security_role_permission_grant (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, permission_key),
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (permission_key)
        REFERENCES security_permission_definition (permission_key) ON DELETE RESTRICT
);

CREATE TABLE security_role_scope_grant (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    scope_kind text NOT NULL CHECK (
        scope_kind IN ('tenant', 'company', 'owner', 'record')
    ),
    scope_value text NOT NULL CHECK (length(scope_value) BETWEEN 1 AND 256),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, permission_key, scope_kind, scope_value),
    FOREIGN KEY (tenant_id, role_policy_id, permission_key)
        REFERENCES security_role_permission_grant (
            tenant_id, role_policy_id, permission_key
        ) ON DELETE RESTRICT
);

CREATE TABLE security_role_field_grant (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    field_name text NOT NULL CHECK (field_name ~ '^[a-z][a-z0-9_]{0,127}$'),
    effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, permission_key, field_name, effect),
    FOREIGN KEY (tenant_id, role_policy_id, permission_key)
        REFERENCES security_role_permission_grant (
            tenant_id, role_policy_id, permission_key
        ) ON DELETE RESTRICT
);

CREATE TABLE security_role_source_state (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    source_state text NOT NULL CHECK (source_state ~ '^[a-z][a-z0-9_]{0,63}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, permission_key, source_state),
    FOREIGN KEY (tenant_id, role_policy_id, permission_key)
        REFERENCES security_role_permission_grant (
            tenant_id, role_policy_id, permission_key
        ) ON DELETE RESTRICT
);

CREATE TABLE security_role_assignment_sod_rule (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    conflicting_role_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, conflicting_role_id),
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, conflicting_role_id)
        REFERENCES security_tenant_role (tenant_id, role_id) ON DELETE RESTRICT
);

CREATE TABLE security_role_transaction_sod_rule (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    conflicting_actor_attribute text NOT NULL CHECK (
        conflicting_actor_attribute ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (
        tenant_id, role_policy_id, permission_key, conflicting_actor_attribute
    ),
    FOREIGN KEY (tenant_id, role_policy_id, permission_key)
        REFERENCES security_role_permission_grant (
            tenant_id, role_policy_id, permission_key
        ) ON DELETE RESTRICT
);

CREATE TABLE security_role_permission_delegation (
    tenant_id text NOT NULL,
    role_policy_id text NOT NULL,
    permission_key text NOT NULL,
    scope_kind text NOT NULL CHECK (
        scope_kind IN ('tenant', 'company', 'owner', 'record')
    ),
    scope_value text NOT NULL CHECK (length(scope_value) BETWEEN 1 AND 256),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, role_policy_id, permission_key, scope_kind, scope_value),
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (permission_key)
        REFERENCES security_permission_definition (permission_key) ON DELETE RESTRICT
);

ALTER TABLE security_user_role_assignment
    ADD COLUMN assignment_id text,
    ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'active' CHECK (
        lifecycle_state IN ('active', 'revoked')
    ),
    ADD COLUMN valid_from timestamptz,
    ADD COLUMN valid_until timestamptz,
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    ADD COLUMN revoked_by text,
    ADD COLUMN revoked_at timestamptz,
    ADD COLUMN revocation_reason text,
    ADD COLUMN approved_command_id text;

-- The migration owner is subject to the v1 FORCE RLS policy. Relax FORCE only
-- for this deterministic compatibility backfill, then restore it immediately.
ALTER TABLE security_user_role_assignment NO FORCE ROW LEVEL SECURITY;

UPDATE security_user_role_assignment
SET assignment_id = 'assignment-' || gen_random_uuid()::text,
    valid_from = assigned_at;

ALTER TABLE security_user_role_assignment FORCE ROW LEVEL SECURITY;

ALTER TABLE security_user_role_assignment
    ALTER COLUMN assignment_id SET NOT NULL,
    ALTER COLUMN assignment_id SET DEFAULT ('assignment-' || gen_random_uuid()::text),
    ALTER COLUMN valid_from SET NOT NULL,
    ADD CONSTRAINT security_assignment_stable_id_unique
        UNIQUE (tenant_id, assignment_id),
    ADD CONSTRAINT security_assignment_validity CHECK (
        valid_until IS NULL OR valid_until > valid_from
    ),
    ADD CONSTRAINT security_assignment_revocation_evidence CHECK (
        (
            lifecycle_state = 'active'
            AND revoked_by IS NULL
            AND revoked_at IS NULL
            AND revocation_reason IS NULL
        )
        OR
        (
            lifecycle_state = 'revoked'
            AND revoked_by IS NOT NULL
            AND revoked_at IS NOT NULL
            AND length(revocation_reason) BETWEEN 1 AND 512
        )
    ),
    ADD CONSTRAINT security_assignment_revoked_by_fk
        FOREIGN KEY (tenant_id, revoked_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT security_assignment_command_fk
        FOREIGN KEY (tenant_id, approved_command_id)
        REFERENCES security_administration_command (tenant_id, command_id)
        ON DELETE RESTRICT;

CREATE INDEX security_assignment_tenant_lifecycle
    ON security_user_role_assignment (
        tenant_id, user_id, lifecycle_state, valid_from, valid_until
    );

CREATE FUNCTION populate_security_assignment_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.valid_from IS NULL THEN
        NEW.valid_from := NEW.assigned_at;
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_assignment_lifecycle_defaults
BEFORE INSERT ON security_user_role_assignment
FOR EACH ROW EXECUTE FUNCTION populate_security_assignment_lifecycle();

CREATE TABLE security_user_role_assignment_version (
    tenant_id text NOT NULL,
    assignment_id text NOT NULL,
    version bigint NOT NULL CHECK (version > 0),
    supersedes_version bigint,
    user_id text NOT NULL,
    role_policy_id text NOT NULL,
    lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('active', 'revoked')),
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    assigned_by text NOT NULL,
    revoked_by text,
    revoked_at timestamptz,
    revocation_reason text,
    administration_command_id text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, assignment_id, version),
    FOREIGN KEY (tenant_id, assignment_id)
        REFERENCES security_user_role_assignment (tenant_id, assignment_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, assignment_id, supersedes_version)
        REFERENCES security_user_role_assignment_version (
            tenant_id, assignment_id, version
        ) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, assigned_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, revoked_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, administration_command_id)
        REFERENCES security_administration_command (tenant_id, command_id)
        ON DELETE RESTRICT,
    CHECK (valid_until IS NULL OR valid_until > valid_from),
    CHECK (
        (version = 1 AND supersedes_version IS NULL)
        OR (version > 1 AND supersedes_version = version - 1)
    ),
    CHECK (
        (lifecycle_state = 'active' AND revoked_by IS NULL AND revoked_at IS NULL)
        OR
        (
            lifecycle_state = 'revoked'
            AND revoked_by IS NOT NULL
            AND revoked_at IS NOT NULL
            AND length(revocation_reason) BETWEEN 1 AND 512
        )
    )
);

CREATE TABLE security_role_approval_request (
    tenant_id text NOT NULL,
    request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
    role_policy_id text NOT NULL,
    requested_action text NOT NULL CHECK (
        requested_action IN ('approve', 'activate', 'archive')
    ),
    request_state text NOT NULL DEFAULT 'pending' CHECK (
        request_state IN ('pending', 'approved', 'rejected')
    ),
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    PRIMARY KEY (tenant_id, request_id),
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (request_state = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
        OR
        (
            request_state IN ('approved', 'rejected')
            AND decided_by IS NOT NULL
            AND decided_at IS NOT NULL
            AND decided_by <> requested_by
        )
    )
);

CREATE TABLE security_assignment_approval_request (
    tenant_id text NOT NULL,
    request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
    assignment_id text,
    target_user_id text NOT NULL,
    role_policy_id text NOT NULL,
    requested_action text NOT NULL CHECK (
        requested_action IN ('create', 'edit', 'revoke')
    ),
    proposed_assignment jsonb NOT NULL CHECK (
        jsonb_typeof(proposed_assignment) = 'object'
    ),
    request_state text NOT NULL DEFAULT 'pending' CHECK (
        request_state IN ('pending', 'approved', 'rejected')
    ),
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
    PRIMARY KEY (tenant_id, request_id),
    FOREIGN KEY (tenant_id, assignment_id)
        REFERENCES security_user_role_assignment (tenant_id, assignment_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, target_user_id)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, role_policy_id)
        REFERENCES security_role_policy (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, requested_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, decided_by)
        REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    CHECK (
        (request_state = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
        OR
        (
            request_state IN ('approved', 'rejected')
            AND decided_by IS NOT NULL
            AND decided_at IS NOT NULL
            AND decided_by <> requested_by
        )
    )
);

CREATE INDEX security_role_approval_pending
    ON security_role_approval_request (tenant_id, request_state, requested_at);
CREATE INDEX security_assignment_approval_pending
    ON security_assignment_approval_request (
        tenant_id, request_state, requested_at
    );
CREATE INDEX security_admin_command_created
    ON security_administration_command (tenant_id, created_at);

CREATE FUNCTION reject_security_assignment_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    RAISE EXCEPTION 'security assignment versions are append-only'
        USING ERRCODE = 'P0001';
END
$function$;

CREATE TRIGGER security_assignment_version_immutable
BEFORE UPDATE OR DELETE ON security_user_role_assignment_version
FOR EACH ROW EXECUTE FUNCTION reject_security_assignment_version_mutation();

CREATE FUNCTION protect_security_administration_command() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.outcome <> 'pending' THEN
        RAISE EXCEPTION 'completed security administration commands are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tenant_id <> OLD.tenant_id
       OR NEW.command_id <> OLD.command_id
       OR NEW.actor_id <> OLD.actor_id
       OR NEW.operation <> OLD.operation
       OR NEW.correlation_id <> OLD.correlation_id
       OR NEW.idempotency_key <> OLD.idempotency_key
       OR NEW.request_fingerprint <> OLD.request_fingerprint
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'security administration command identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_administration_command_evidence
BEFORE UPDATE OR DELETE ON security_administration_command
FOR EACH ROW EXECUTE FUNCTION protect_security_administration_command();

CREATE FUNCTION protect_security_approval_request() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.request_state <> 'pending' THEN
        RAISE EXCEPTION 'decided security approval requests are immutable'
            USING ERRCODE = 'P0001';
    END IF;
    IF (
        to_jsonb(NEW) - ARRAY[
            'request_state', 'decided_by', 'decided_at',
            'decision_reason', 'row_version'
        ]
    ) <> (
        to_jsonb(OLD) - ARRAY[
            'request_state', 'decided_by', 'decided_at',
            'decision_reason', 'row_version'
        ]
    ) THEN
        RAISE EXCEPTION 'security approval request identity is immutable'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER security_role_approval_evidence
BEFORE UPDATE OR DELETE ON security_role_approval_request
FOR EACH ROW EXECUTE FUNCTION protect_security_approval_request();
CREATE TRIGGER security_assignment_approval_evidence
BEFORE UPDATE OR DELETE ON security_assignment_approval_request
FOR EACH ROW EXECUTE FUNCTION protect_security_approval_request();

ALTER TABLE security_tenant_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_tenant_role FORCE ROW LEVEL SECURITY;
CREATE POLICY security_tenant_role_tenant_isolation ON security_tenant_role
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_administration_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_administration_command FORCE ROW LEVEL SECURITY;
CREATE POLICY security_admin_command_tenant_isolation
    ON security_administration_command
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_permission_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_permission_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY security_permission_grant_tenant_isolation
    ON security_role_permission_grant
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_scope_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_scope_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY security_scope_grant_tenant_isolation ON security_role_scope_grant
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_field_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_field_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY security_field_grant_tenant_isolation ON security_role_field_grant
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_source_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_source_state FORCE ROW LEVEL SECURITY;
CREATE POLICY security_source_state_tenant_isolation ON security_role_source_state
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_assignment_sod_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_assignment_sod_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY security_assignment_sod_tenant_isolation
    ON security_role_assignment_sod_rule
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_transaction_sod_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_transaction_sod_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY security_transaction_sod_tenant_isolation
    ON security_role_transaction_sod_rule
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_permission_delegation ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_permission_delegation FORCE ROW LEVEL SECURITY;
CREATE POLICY security_delegation_tenant_isolation
    ON security_role_permission_delegation
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_user_role_assignment_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_user_role_assignment_version FORCE ROW LEVEL SECURITY;
CREATE POLICY security_assignment_version_tenant_isolation
    ON security_user_role_assignment_version
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_role_approval_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_role_approval_request FORCE ROW LEVEL SECURITY;
CREATE POLICY security_role_approval_tenant_isolation
    ON security_role_approval_request
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

ALTER TABLE security_assignment_approval_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_assignment_approval_request FORCE ROW LEVEL SECURITY;
CREATE POLICY security_assignment_approval_tenant_isolation
    ON security_assignment_approval_request
    USING (tenant_id = current_setting('nexora.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));

INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('security', 2, 'dynamic_authorization');
