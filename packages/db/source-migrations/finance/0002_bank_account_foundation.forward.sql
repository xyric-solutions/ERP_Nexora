-- Governed Banking account master data. Existing Finance migration history is immutable.

ALTER TABLE bank_account
    DROP CONSTRAINT bank_account_status_check,
    ADD COLUMN reference text,
    ADD COLUMN account_name text,
    ADD COLUMN account_type text NOT NULL DEFAULT 'current',
    ADD COLUMN branch text NOT NULL DEFAULT '',
    ADD COLUMN account_number_masked text,
    ADD COLUMN account_number_ciphertext bytea,
    ADD COLUMN account_number_nonce bytea,
    ADD COLUMN account_number_hash text,
    ADD COLUMN iban_masked text,
    ADD COLUMN iban_ciphertext bytea,
    ADD COLUMN iban_nonce bytea,
    ADD COLUMN iban_hash text,
    ADD COLUMN encryption_key_version text,
    ADD COLUMN swift_bic text NOT NULL DEFAULT '',
    ADD COLUMN overdraft_limit numeric(38,8) NOT NULL DEFAULT 0,
    ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
    ADD COLUMN created_by text,
    ADD COLUMN submitted_by text,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN submission_reason text,
    ADD COLUMN approved_by text,
    ADD COLUMN approved_at timestamptz,
    ADD COLUMN rejected_by text,
    ADD COLUMN rejected_at timestamptz,
    ADD COLUMN decision_reason text,
    ADD COLUMN deactivated_by text,
    ADD COLUMN deactivated_at timestamptz,
    ADD COLUMN closed_by text,
    ADD COLUMN closed_at timestamptz,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Legacy rows have no trustworthy approval or protected identifier evidence.
-- Keep them visible for explicit review but ineligible for payroll/transactions.
UPDATE bank_account
SET reference = id,
    account_name = bank_name,
    account_number_masked = 'Legacy review required',
    status = 'review_required';

ALTER TABLE bank_account
    ALTER COLUMN reference SET NOT NULL,
    ALTER COLUMN account_name SET NOT NULL,
    ALTER COLUMN account_type DROP DEFAULT,
    ADD CONSTRAINT bank_account_reference_length CHECK (char_length(btrim(reference)) BETWEEN 1 AND 64),
    ADD CONSTRAINT bank_account_name_length CHECK (char_length(btrim(account_name)) BETWEEN 1 AND 160),
    ADD CONSTRAINT bank_account_type_check CHECK (account_type IN ('current','deposit','escrow','cash')),
    ADD CONSTRAINT bank_account_status_check CHECK (
        status IN ('draft','pending_approval','active','rejected','inactive','closed','review_required')
    ),
    ADD CONSTRAINT bank_account_mask_length CHECK (char_length(account_number_masked) BETWEEN 4 AND 80),
    ADD CONSTRAINT bank_account_swift_check CHECK (
        swift_bic = '' OR swift_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'
    ),
    ADD CONSTRAINT bank_account_overdraft_check CHECK (overdraft_limit >= 0),
    ADD CONSTRAINT bank_account_version_check CHECK (row_version > 0),
    ADD CONSTRAINT bank_account_hash_check CHECK (
        account_number_hash IS NULL OR account_number_hash ~ '^[0-9a-f]{64}$'
    ),
    ADD CONSTRAINT bank_account_iban_hash_check CHECK (iban_hash IS NULL OR iban_hash ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT bank_account_identifier_envelope_check CHECK (
        status = 'review_required'
        OR (
            created_by IS NOT NULL
            AND account_number_ciphertext IS NOT NULL AND octet_length(account_number_ciphertext) > 16
            AND account_number_nonce IS NOT NULL AND octet_length(account_number_nonce) = 12
            AND account_number_hash IS NOT NULL
            AND encryption_key_version IS NOT NULL
            AND char_length(encryption_key_version) BETWEEN 1 AND 64
        )
    ),
    ADD CONSTRAINT bank_account_iban_envelope_check CHECK (
        (iban_masked IS NULL AND iban_ciphertext IS NULL AND iban_nonce IS NULL AND iban_hash IS NULL)
        OR (
            iban_masked IS NOT NULL AND char_length(iban_masked) BETWEEN 4 AND 80
            AND iban_ciphertext IS NOT NULL AND octet_length(iban_ciphertext) > 16
            AND iban_nonce IS NOT NULL AND octet_length(iban_nonce) = 12
            AND iban_hash IS NOT NULL
            AND encryption_key_version IS NOT NULL
        )
    ),
    ADD CONSTRAINT bank_account_lifecycle_evidence_check CHECK (
        status = 'review_required'
        OR (
            created_by IS NOT NULL
            AND (
                (status = 'draft'
                 AND submitted_by IS NULL AND submitted_at IS NULL AND submission_reason IS NULL
                 AND approved_by IS NULL AND approved_at IS NULL
                 AND rejected_by IS NULL AND rejected_at IS NULL AND decision_reason IS NULL)
                OR
                (status = 'pending_approval'
                 AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND submission_reason IS NOT NULL
                 AND approved_by IS NULL AND approved_at IS NULL
                 AND rejected_by IS NULL AND rejected_at IS NULL AND decision_reason IS NULL)
                OR
                (status IN ('active','inactive','closed')
                 AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND submission_reason IS NOT NULL
                 AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND decision_reason IS NOT NULL
                 AND rejected_by IS NULL AND rejected_at IS NULL)
                OR
                (status = 'rejected'
                 AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND submission_reason IS NOT NULL
                 AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND decision_reason IS NOT NULL
                 AND approved_by IS NULL AND approved_at IS NULL)
            )
        )
    ),
    ADD CONSTRAINT bank_account_status_action_evidence_check CHECK (
        status = 'review_required'
        OR (status IN ('draft','pending_approval','active','rejected')
            AND deactivated_by IS NULL AND deactivated_at IS NULL
            AND closed_by IS NULL AND closed_at IS NULL)
        OR (status = 'inactive'
            AND deactivated_by IS NOT NULL AND deactivated_at IS NOT NULL
            AND closed_by IS NULL AND closed_at IS NULL)
        OR (status = 'closed'
            AND deactivated_by IS NOT NULL AND deactivated_at IS NOT NULL
            AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
    ),
    ADD CONSTRAINT bank_account_created_by_fk FOREIGN KEY (tenant_id,created_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_submitted_by_fk FOREIGN KEY (tenant_id,submitted_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_approved_by_fk FOREIGN KEY (tenant_id,approved_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_rejected_by_fk FOREIGN KEY (tenant_id,rejected_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_deactivated_by_fk FOREIGN KEY (tenant_id,deactivated_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_closed_by_fk FOREIGN KEY (tenant_id,closed_by)
        REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_bank_account_reference
    ON bank_account (tenant_id,company_id,reference);
CREATE UNIQUE INDEX uq_bank_account_number_hash
    ON bank_account (tenant_id,company_id,account_number_hash)
    WHERE account_number_hash IS NOT NULL AND status <> 'closed';
CREATE UNIQUE INDEX uq_bank_account_iban_hash
    ON bank_account (tenant_id,company_id,iban_hash)
    WHERE iban_hash IS NOT NULL AND status <> 'closed';
CREATE INDEX idx_bank_account_directory
    ON bank_account (tenant_id,company_id,status,currency,account_name,id);
CREATE INDEX idx_bank_account_bank
    ON bank_account (tenant_id,company_id,bank_name,status);

CREATE TABLE bank_account_event (
    tenant_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    account_id text NOT NULL,
    event_type text NOT NULL CHECK (
        event_type IN ('created','updated','submitted','approved','rejected','revised','deactivated','closed')
    ),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    state_snapshot jsonb NOT NULL CHECK (jsonb_typeof(state_snapshot) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    FOREIGN KEY (tenant_id,account_id) REFERENCES bank_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_bank_account_event_history
    ON bank_account_event (tenant_id,account_id,occurred_at,event_id);

ALTER TABLE bank_account_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_account_event FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_account_event_tenant_isolation ON bank_account_event
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

CREATE FUNCTION protect_bank_account_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'bank account lifecycle evidence is immutable';
END $$;
CREATE TRIGGER bank_account_event_immutable
    BEFORE UPDATE OR DELETE ON bank_account_event
    FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();

CREATE FUNCTION enforce_bank_account_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'bank accounts cannot be deleted';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'bank account identity and creation evidence are immutable';
    END IF;
    IF NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at <= OLD.updated_at THEN
        RAISE EXCEPTION 'bank account version and update time must advance';
    END IF;
    IF OLD.status = 'review_required' THEN
        RAISE EXCEPTION 'legacy bank account requires an explicit migration review workflow';
    END IF;
    IF NEW.status = OLD.status THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'only draft bank accounts may be edited';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status='draft' AND NEW.status='pending_approval')
        OR (OLD.status='pending_approval' AND NEW.status IN ('active','rejected'))
        OR (OLD.status='rejected' AND NEW.status='draft')
        OR (OLD.status='active' AND NEW.status='inactive')
        OR (OLD.status='inactive' AND NEW.status='closed')
    ) THEN
        RAISE EXCEPTION 'invalid bank account lifecycle transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NOT (OLD.status='rejected' AND NEW.status='draft')
       AND (to_jsonb(NEW)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at')
           IS DISTINCT FROM
           (to_jsonb(OLD)
            - 'status' - 'row_version' - 'updated_at'
            - 'submitted_by' - 'submitted_at' - 'submission_reason'
            - 'approved_by' - 'approved_at'
            - 'rejected_by' - 'rejected_at' - 'decision_reason'
            - 'deactivated_by' - 'deactivated_at' - 'closed_by' - 'closed_at') THEN
        RAISE EXCEPTION 'bank account business fields cannot change during a lifecycle decision';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER bank_account_transition_guard
    BEFORE UPDATE OR DELETE ON bank_account
    FOR EACH ROW EXECUTE FUNCTION enforce_bank_account_transition();

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
) VALUES
('banking.bank_account.read','banking','bank_account','read','Read governed bank accounts and ledger balance projections.','password',false,false,'sensitive'),
('banking.bank_account.create','banking','bank_account','create','Create governed bank-account drafts.','password',true,true,'restricted'),
('banking.bank_account.update','banking','bank_account','update','Update governed bank-account drafts.','password',true,true,'restricted'),
('banking.bank_account.submit','banking','bank_account','submit','Submit governed bank accounts for independent approval.','password',false,true,'restricted'),
('banking.bank_account.approve','banking','bank_account','approve','Approve or reject governed bank accounts.','password',false,true,'restricted'),
('banking.bank_account.status','banking','bank_account','status','Deactivate or close governed bank accounts.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('finance',2,'bank_account_foundation');
