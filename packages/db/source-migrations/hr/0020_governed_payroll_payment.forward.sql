-- Governed Payroll payment authority. Plaintext bank data never enters PostgreSQL.

ALTER TABLE employee_bank_account
    ADD COLUMN company_id text,
    ADD COLUMN currency_code text,
    ADD COLUMN effective_from date,
    ADD COLUMN effective_to date,
    ADD COLUMN iban_ciphertext bytea,
    ADD COLUMN iban_nonce bytea,
    ADD COLUMN iban_wrapped_data_key bytea,
    ADD COLUMN iban_wrap_nonce bytea,
    ADD COLUMN encryption_key_version text,
    ADD COLUMN iban_hash text,
    ADD COLUMN created_by text,
    ADD COLUMN updated_by text,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT employee_bank_company_fk FOREIGN KEY (tenant_id,company_id)
        REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT employee_bank_currency_check CHECK (
        currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'
    ),
    ADD CONSTRAINT employee_bank_effective_dates_check CHECK (
        effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
    ),
    ADD CONSTRAINT employee_bank_envelope_check CHECK (
        (iban_ciphertext IS NULL AND iban_nonce IS NULL AND iban_wrapped_data_key IS NULL
         AND iban_wrap_nonce IS NULL AND encryption_key_version IS NULL AND iban_hash IS NULL)
        OR
        (iban_ciphertext IS NOT NULL AND octet_length(iban_ciphertext) > 16
         AND octet_length(iban_nonce) = 12
         AND iban_wrapped_data_key IS NOT NULL AND octet_length(iban_wrapped_data_key) > 32
         AND octet_length(iban_wrap_nonce) = 12
         AND char_length(encryption_key_version) BETWEEN 1 AND 64
         AND iban_hash ~ '^[0-9a-f]{64}$'
         AND company_id IS NOT NULL AND currency_code IS NOT NULL
         AND effective_from IS NOT NULL AND created_by IS NOT NULL)
    );

CREATE UNIQUE INDEX uq_employee_bank_iban_hash
    ON employee_bank_account (tenant_id,employee_id,iban_hash)
    WHERE iban_hash IS NOT NULL;
CREATE INDEX idx_employee_bank_payment_resolution
    ON employee_bank_account (tenant_id,company_id,employee_id,status,effective_from,effective_to)
    WHERE iban_ciphertext IS NOT NULL;
DROP INDEX uq_employee_primary_bank;
ALTER TABLE employee_bank_account ADD CONSTRAINT employee_primary_bank_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        company_id WITH =,
        currency_code WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    ) WHERE (is_primary AND status='active' AND company_id IS NOT NULL AND effective_from IS NOT NULL);

CREATE TABLE hr_payment_export_profile (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 120),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    version_number integer NOT NULL CHECK (version_number > 0),
    message_type text NOT NULL CHECK (message_type = 'pain.001.001.09'),
    adapter_code text NOT NULL CHECK (adapter_code = 'iso20022_pain_001_001_09'),
    adapter_version text NOT NULL CHECK (char_length(adapter_version) BETWEEN 1 AND 32),
    finance_bank_account_id text NOT NULL,
    initiating_party_name text NOT NULL CHECK (char_length(btrim(initiating_party_name)) BETWEEN 1 AND 140),
    debtor_name text NOT NULL CHECK (char_length(btrim(debtor_name)) BETWEEN 1 AND 140),
    debtor_agent_bic text NOT NULL CHECK (debtor_agent_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    debtor_iban_masked text NOT NULL CHECK (debtor_iban_masked ~ '^\*{20}.{4}$'),
    debtor_iban_ciphertext bytea NOT NULL CHECK (octet_length(debtor_iban_ciphertext) > 16),
    debtor_iban_nonce bytea NOT NULL CHECK (octet_length(debtor_iban_nonce) = 12),
    debtor_iban_wrapped_data_key bytea NOT NULL CHECK (octet_length(debtor_iban_wrapped_data_key) > 32),
    debtor_iban_wrap_nonce bytea NOT NULL CHECK (octet_length(debtor_iban_wrap_nonce) = 12),
    encryption_key_version text NOT NULL CHECK (char_length(encryption_key_version) BETWEEN 1 AND 64),
    debtor_iban_hash text NOT NULL CHECK (debtor_iban_hash ~ '^[0-9a-f]{64}$'),
    effective_from date NOT NULL,
    effective_to date,
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','rejected','retired')),
    source_reference text NOT NULL CHECK (char_length(btrim(source_reference)) BETWEEN 1 AND 240),
    created_by text NOT NULL,
    submitted_by text,
    approved_by text,
    rejected_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    approved_at timestamptz,
    rejected_at timestamptz,
    evidence_hash text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,company_id,reference,version_number),
    FOREIGN KEY (tenant_id,company_id) REFERENCES organization_unit (tenant_id,id) ON DELETE RESTRICT,
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK ((state='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND evidence_hash IS NOT NULL)
        OR state<>'approved')
);
CREATE INDEX idx_hr_payment_profile_resolution
    ON hr_payment_export_profile (tenant_id,company_id,state,effective_from,effective_to,currency_code);
ALTER TABLE hr_payment_export_profile ADD CONSTRAINT hr_payment_profile_approved_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_id WITH =,
        reference WITH =,
        currency_code WITH =,
        daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') WITH &&
    ) WHERE (state='approved');

ALTER TABLE hr_payroll_payment_batch
    DROP CONSTRAINT hr_payroll_payment_batch_state_check,
    DROP CONSTRAINT hr_payroll_payment_batch_tenant_id_period_id_key,
    ADD CONSTRAINT hr_payroll_payment_batch_state_check CHECK (state IN (
        'draft','released','confirmed','validated','pending_approval','approved','exported',
        'submitted','paid','failed','rejected','cancelled'
    )),
    ADD COLUMN payment_date date,
    ADD COLUMN currency_code text,
    ADD COLUMN export_profile_id text,
    ADD COLUMN payroll_run_number integer,
    ADD COLUMN payroll_result_count integer,
    ADD COLUMN payroll_result_hash text,
    ADD COLUMN validation_hash text,
    ADD COLUMN validated_by text,
    ADD COLUMN validated_at timestamptz,
    ADD COLUMN approved_by text,
    ADD COLUMN approved_at timestamptz,
    ADD COLUMN exported_by text,
    ADD COLUMN exported_at timestamptz,
    ADD COLUMN submitted_by text,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN paid_by text,
    ADD COLUMN paid_at timestamptz,
    ADD COLUMN failed_by text,
    ADD COLUMN failed_at timestamptz,
    ADD COLUMN rejected_by text,
    ADD COLUMN rejected_at timestamptz,
    ADD COLUMN cancelled_by text,
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    ADD COLUMN last_retry_by text,
    ADD COLUMN last_retry_at timestamptz,
    ADD COLUMN reconciliation_hash text,
    ADD CONSTRAINT hr_payment_batch_profile_fk FOREIGN KEY (tenant_id,export_profile_id)
        REFERENCES hr_payment_export_profile (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_payment_batch_currency_check CHECK (
        currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'
    ),
    ADD CONSTRAINT hr_payment_batch_hashes_check CHECK (
        (payroll_result_hash IS NULL OR payroll_result_hash ~ '^[0-9a-f]{64}$')
        AND (validation_hash IS NULL OR validation_hash ~ '^[0-9a-f]{64}$')
        AND (reconciliation_hash IS NULL OR reconciliation_hash ~ '^[0-9a-f]{64}$')
    );
CREATE UNIQUE INDEX uq_hr_payment_batch_period_obligation
    ON hr_payroll_payment_batch (tenant_id,period_id)
    WHERE state NOT IN ('rejected','cancelled');

ALTER TABLE hr_payroll_payment
    DROP CONSTRAINT hr_payroll_payment_state_check,
    ADD CONSTRAINT hr_payroll_payment_state_check CHECK (state IN (
        'pending','confirmed','validated','exported','submitted','paid','failed','rejected','cancelled'
    )),
    ADD COLUMN currency_code text,
    ADD COLUMN employee_bank_account_id text,
    ADD COLUMN beneficiary_name text,
    ADD COLUMN iban_masked text,
    ADD COLUMN payroll_result_hash text,
    ADD COLUMN exported_at timestamptz,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN paid_at timestamptz,
    ADD COLUMN failed_at timestamptz,
    ADD COLUMN rejected_at timestamptz,
    ADD COLUMN cancelled_at timestamptz,
    ADD CONSTRAINT hr_payment_employee_bank_fk FOREIGN KEY (tenant_id,employee_bank_account_id)
        REFERENCES employee_bank_account (tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT hr_payment_currency_check CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT hr_payment_result_hash_check CHECK (
        payroll_result_hash IS NULL OR payroll_result_hash ~ '^[0-9a-f]{64}$'
    );
CREATE UNIQUE INDEX uq_hr_payment_external_reference
    ON hr_payroll_payment (tenant_id,external_reference)
    WHERE external_reference IS NOT NULL;

CREATE TABLE hr_payroll_payment_export (
    id text NOT NULL,
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    batch_id text NOT NULL,
    payroll_period_id text NOT NULL,
    payroll_run_number integer NOT NULL CHECK (payroll_run_number > 0),
    export_profile_id text NOT NULL,
    export_profile_version integer NOT NULL CHECK (export_profile_version > 0),
    message_type text NOT NULL CHECK (message_type = 'pain.001.001.09'),
    adapter_code text NOT NULL,
    adapter_version text NOT NULL,
    file_identifier text NOT NULL,
    file_version integer NOT NULL CHECK (file_version > 0),
    generated_at timestamptz NOT NULL,
    payment_count integer NOT NULL CHECK (payment_count > 0),
    total_amount numeric(20,4) NOT NULL CHECK (total_amount > 0),
    currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    file_ciphertext bytea NOT NULL CHECK (octet_length(file_ciphertext) > 16),
    file_nonce bytea NOT NULL CHECK (octet_length(file_nonce) = 12),
    file_wrapped_data_key bytea NOT NULL CHECK (octet_length(file_wrapped_data_key) > 32),
    file_wrap_nonce bytea NOT NULL CHECK (octet_length(file_wrap_nonce) = 12),
    encryption_key_version text NOT NULL CHECK (char_length(encryption_key_version) BETWEEN 1 AND 64),
    maker_id text NOT NULL,
    checker_id text NOT NULL,
    approved_at timestamptz NOT NULL,
    state text NOT NULL DEFAULT 'exported' CHECK (state IN ('exported','submitted','paid','failed','rejected')),
    submitted_at timestamptz,
    reconciliation_status text NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN ('pending','reconciled','exception')),
    reconciliation_hash text CHECK (reconciliation_hash IS NULL OR reconciliation_hash ~ '^[0-9a-f]{64}$'),
    evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,id),
    UNIQUE (tenant_id,batch_id),
    UNIQUE (tenant_id,company_id,file_identifier,file_version),
    FOREIGN KEY (tenant_id,batch_id) REFERENCES hr_payroll_payment_batch (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,payroll_period_id,company_id) REFERENCES hr_payroll_period (tenant_id,id,company_id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,export_profile_id) REFERENCES hr_payment_export_profile (tenant_id,id) ON DELETE RESTRICT,
    CHECK (maker_id <> checker_id)
);
CREATE INDEX idx_hr_payment_export_company
    ON hr_payroll_payment_export (tenant_id,company_id,state,generated_at DESC);

CREATE FUNCTION protect_hr_payment_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.state IN ('approved','retired') THEN
        IF NEW.debtor_iban_ciphertext IS DISTINCT FROM OLD.debtor_iban_ciphertext
           OR NEW.debtor_iban_nonce IS DISTINCT FROM OLD.debtor_iban_nonce
           OR NEW.debtor_iban_wrapped_data_key IS DISTINCT FROM OLD.debtor_iban_wrapped_data_key
           OR NEW.debtor_iban_wrap_nonce IS DISTINCT FROM OLD.debtor_iban_wrap_nonce
           OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
           OR NEW.debtor_iban_hash IS DISTINCT FROM OLD.debtor_iban_hash
           OR NEW.reference IS DISTINCT FROM OLD.reference
           OR NEW.version_number IS DISTINCT FROM OLD.version_number
           OR NEW.finance_bank_account_id IS DISTINCT FROM OLD.finance_bank_account_id
           OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
           OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
           OR NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
            RAISE EXCEPTION 'approved payment export profile evidence is immutable';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_payment_profile_immutable
    BEFORE UPDATE ON hr_payment_export_profile FOR EACH ROW EXECUTE FUNCTION protect_hr_payment_authority();

CREATE FUNCTION protect_hr_payment_export_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.payroll_period_id IS DISTINCT FROM OLD.payroll_period_id
       OR NEW.payroll_run_number IS DISTINCT FROM OLD.payroll_run_number
       OR NEW.export_profile_id IS DISTINCT FROM OLD.export_profile_id
       OR NEW.export_profile_version IS DISTINCT FROM OLD.export_profile_version
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.adapter_code IS DISTINCT FROM OLD.adapter_code
       OR NEW.adapter_version IS DISTINCT FROM OLD.adapter_version
       OR NEW.file_identifier IS DISTINCT FROM OLD.file_identifier
       OR NEW.file_version IS DISTINCT FROM OLD.file_version
       OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
       OR NEW.payment_count IS DISTINCT FROM OLD.payment_count
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
       OR NEW.file_ciphertext IS DISTINCT FROM OLD.file_ciphertext
       OR NEW.file_nonce IS DISTINCT FROM OLD.file_nonce
       OR NEW.file_wrapped_data_key IS DISTINCT FROM OLD.file_wrapped_data_key
       OR NEW.file_wrap_nonce IS DISTINCT FROM OLD.file_wrap_nonce
       OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version
       OR NEW.maker_id IS DISTINCT FROM OLD.maker_id
       OR NEW.checker_id IS DISTINCT FROM OLD.checker_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'payment export evidence is immutable';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_payment_export_immutable
    BEFORE UPDATE ON hr_payroll_payment_export
    FOR EACH ROW EXECUTE FUNCTION protect_hr_payment_export_evidence();
CREATE TRIGGER hr_payment_export_no_delete
    BEFORE DELETE ON hr_payroll_payment_export
    FOR EACH ROW EXECUTE FUNCTION reject_payroll_snapshot_mutation();

CREATE FUNCTION enforce_hr_payment_state_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'hr_payroll_payment_export' THEN
        IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
            (OLD.state='exported' AND NEW.state='submitted')
            OR (OLD.state='submitted' AND NEW.state IN ('paid','failed','rejected'))
            OR (OLD.state='failed' AND NEW.state='submitted')
        ) THEN
            RAISE EXCEPTION 'invalid payroll payment export state transition: % -> %', OLD.state, NEW.state;
        END IF;
        IF NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status
           AND NOT (OLD.reconciliation_status='pending' AND NEW.reconciliation_status IN ('reconciled','exception')) THEN
            RAISE EXCEPTION 'invalid payroll payment reconciliation transition: % -> %', OLD.reconciliation_status, NEW.reconciliation_status;
        END IF;
        IF NEW.reconciliation_status='reconciled'
           AND (NEW.state<>'paid' OR NEW.reconciliation_hash IS NULL) THEN
            RAISE EXCEPTION 'reconciled payment export requires paid state and reconciliation evidence';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.state = OLD.state THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'hr_payroll_payment_batch' THEN
        IF NOT (
            (OLD.state='draft' AND NEW.state IN ('validated','released','cancelled'))
            OR (OLD.state='released' AND NEW.state='confirmed')
            OR (OLD.state='validated' AND NEW.state IN ('pending_approval','cancelled'))
            OR (OLD.state='pending_approval' AND NEW.state IN ('approved','rejected','cancelled'))
            OR (OLD.state='approved' AND NEW.state='exported')
            OR (OLD.state='exported' AND NEW.state='submitted')
            OR (OLD.state='submitted' AND NEW.state IN ('paid','failed'))
            OR (OLD.state='failed' AND NEW.state='submitted')
        ) THEN
            RAISE EXCEPTION 'invalid payroll payment batch state transition: % -> %', OLD.state, NEW.state;
        END IF;
    ELSIF TG_TABLE_NAME = 'hr_payroll_payment' THEN
        IF NOT (
            (OLD.state='pending' AND NEW.state IN ('validated','confirmed','cancelled'))
            OR (OLD.state='validated' AND NEW.state IN ('exported','rejected','cancelled'))
            OR (OLD.state='exported' AND NEW.state='submitted')
            OR (OLD.state='submitted' AND NEW.state IN ('paid','failed'))
            OR (OLD.state='failed' AND NEW.state='submitted')
        ) THEN
            RAISE EXCEPTION 'invalid payroll payment state transition: % -> %', OLD.state, NEW.state;
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER hr_payment_batch_state_transition
    BEFORE UPDATE ON hr_payroll_payment_batch
    FOR EACH ROW EXECUTE FUNCTION enforce_hr_payment_state_transition();
CREATE TRIGGER hr_payment_state_transition
    BEFORE UPDATE ON hr_payroll_payment
    FOR EACH ROW EXECUTE FUNCTION enforce_hr_payment_state_transition();
CREATE TRIGGER hr_payment_export_state_transition
    BEFORE UPDATE ON hr_payroll_payment_export
    FOR EACH ROW EXECUTE FUNCTION enforce_hr_payment_state_transition();

ALTER TABLE hr_payment_export_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payment_export_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payment_export_profile_tenant_isolation ON hr_payment_export_profile
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_payroll_payment_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_payment_export FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_payroll_payment_export_tenant_isolation ON hr_payroll_payment_export
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

INSERT INTO nexora_schema_migration (module_name,version,name)
VALUES ('hr',20,'governed_payroll_payment');
