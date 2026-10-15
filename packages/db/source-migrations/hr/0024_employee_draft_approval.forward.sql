DO $$
BEGIN
    IF to_regclass('public.employee') IS NULL
       OR to_regclass('public.hr_employee_draft_scope') IS NULL THEN
        RAISE EXCEPTION 'employee draft approval requires HR draft scope';
    END IF;
END $$;

CREATE TABLE hr_employee_draft_approval (
    id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
    tenant_id text NOT NULL,
    employee_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('pending','approved','rejected')),
    submitted_by text NOT NULL CHECK (length(btrim(submitted_by)) BETWEEN 1 AND 128),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    decided_by text,
    decided_at timestamptz,
    decision_reason text,
    audit_event_id text,
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,employee_id),
    FOREIGN KEY (tenant_id,employee_id) REFERENCES employee (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,audit_event_id) REFERENCES platform_admin_audit_event (tenant_id,id) ON DELETE RESTRICT,
    CHECK ((state='pending' AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
       OR (state IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL
           AND char_length(btrim(decision_reason)) BETWEEN 1 AND 1000))
);

CREATE INDEX idx_hr_employee_draft_approval_queue
    ON hr_employee_draft_approval (tenant_id,state,submitted_at);

ALTER TABLE hr_employee_draft_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_draft_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_draft_approval_tenant_isolation ON hr_employee_draft_approval
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',24,'employee_draft_approval');
