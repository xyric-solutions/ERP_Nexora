-- Additive Finance-owned Cash & Bank nominal authority. No company code policy
-- or master data is guessed here; missing legacy authority requires review.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM account child JOIN account parent
          ON parent.tenant_id=child.tenant_id AND parent.id=child.parent_id
         WHERE parent.company_id<>child.company_id
    ) THEN
        RAISE EXCEPTION 'Finance nominal preflight: cross-company account parents require review';
    END IF;
    IF EXISTS (
        SELECT 1 FROM bank_account bank LEFT JOIN currency master
          ON master.tenant_id=bank.tenant_id AND master.code=bank.currency
         WHERE master.code IS NULL
    ) THEN
        RAISE EXCEPTION 'Finance nominal preflight: legacy bank currencies require Currency Master review';
    END IF;
END $$;

ALTER TABLE account
    ADD COLUMN description text CHECK (description IS NULL OR char_length(description)<=2000),
    ADD COLUMN managed_bank_nominal boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT account_company_parent_fk FOREIGN KEY (tenant_id,company_id,parent_id)
        REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT account_managed_bank_shape CHECK (
        NOT managed_bank_nominal OR (
            type='asset' AND NOT is_header AND parent_id IS NOT NULL
            AND manual_posting_allowed AND reconciliation_required AND NOT is_system_account
            AND char_length(btrim(name)) BETWEEN 1 AND 160
        )
    );
CREATE UNIQUE INDEX uq_account_managed_bank_name
    ON account (tenant_id,company_id,parent_id,lower(btrim(name))) WHERE managed_bank_nominal;
CREATE INDEX idx_account_company_parent_code ON account (tenant_id,company_id,parent_id,code,id);

CREATE TABLE finance_nominal_section_policy (
    tenant_id text NOT NULL,
    company_id text NOT NULL,
    section_id text NOT NULL,
    category_id text NOT NULL,
    section_role text NOT NULL CHECK (section_role='cash_and_bank'),
    prefix text NOT NULL CHECK (char_length(prefix)<=100),
    code_width smallint NOT NULL CHECK (code_width BETWEEN 1 AND 18),
    first_value bigint NOT NULL CHECK (first_value>0),
    last_value bigint NOT NULL,
    next_value bigint NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,company_id,section_id),
    UNIQUE (tenant_id,company_id,section_role),
    FOREIGN KEY (tenant_id,company_id,section_id) REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,category_id) REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT,
    CHECK (section_id<>category_id),
    CHECK (last_value>=first_value AND last_value<power(10::numeric,code_width)),
    CHECK (next_value BETWEEN first_value AND last_value+1),
    CHECK (char_length(prefix)+code_width<=128)
);
ALTER TABLE finance_nominal_section_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_nominal_section_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_nominal_section_policy_tenant ON finance_nominal_section_policy
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));

ALTER TABLE bank_account
    ADD COLUMN identity_mode text NOT NULL DEFAULT 'legacy_detailed'
        CHECK (identity_mode IN ('legacy_detailed','nominal_only')),
    ALTER COLUMN bank_name DROP NOT NULL,
    ALTER COLUMN branch DROP NOT NULL,
    ALTER COLUMN swift_bic DROP NOT NULL,
    DROP CONSTRAINT bank_account_identifier_envelope_check,
    ADD CONSTRAINT bank_account_currency_master_fk FOREIGN KEY (tenant_id,currency)
        REFERENCES currency (tenant_id,code) ON DELETE RESTRICT,
    ADD CONSTRAINT bank_account_identity_mode_shape CHECK (
        (identity_mode='legacy_detailed' AND bank_name IS NOT NULL
            AND branch IS NOT NULL AND swift_bic IS NOT NULL)
        OR (identity_mode='nominal_only' AND status<>'review_required'
            AND bank_name IS NULL AND branch IS NULL AND swift_bic IS NULL
            AND account_number_masked IS NULL AND account_number_ciphertext IS NULL
            AND account_number_nonce IS NULL AND account_number_hash IS NULL
            AND iban_masked IS NULL AND iban_ciphertext IS NULL AND iban_nonce IS NULL AND iban_hash IS NULL
            AND encryption_key_version IS NULL AND overdraft_limit=0
            AND account_type IN ('current','cash'))
    ),
    ADD CONSTRAINT bank_account_identifier_envelope_check CHECK (
        identity_mode='nominal_only' OR status='review_required' OR (
            created_by IS NOT NULL
            AND account_number_ciphertext IS NOT NULL AND octet_length(account_number_ciphertext)>16
            AND account_number_nonce IS NOT NULL AND octet_length(account_number_nonce)=12
            AND account_number_hash IS NOT NULL AND encryption_key_version IS NOT NULL
            AND char_length(encryption_key_version) BETWEEN 1 AND 64
        )
    );

CREATE TABLE finance_nominal_event (
    tenant_id text NOT NULL,
    event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 128),
    company_id text NOT NULL,
    nominal_id text NOT NULL,
    bank_account_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','updated','submitted','approved','rejected','deactivated')),
    resulting_version bigint NOT NULL CHECK (resulting_version>0),
    actor_id text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
    approval_override_event_id text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id,event_id),
    UNIQUE (tenant_id,nominal_id,resulting_version),
    FOREIGN KEY (tenant_id,company_id,nominal_id) REFERENCES account (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,company_id,bank_account_id) REFERENCES bank_account (tenant_id,company_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,actor_id) REFERENCES security_user_account (tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id,approval_override_event_id) REFERENCES approval_override_event (tenant_id,event_id) ON DELETE RESTRICT,
    CHECK (event_type IN ('created','updated') OR reason IS NOT NULL),
    CHECK (event_type IN ('approved','rejected') OR approval_override_event_id IS NULL)
);
CREATE INDEX idx_finance_nominal_event_history
    ON finance_nominal_event (tenant_id,company_id,nominal_id,resulting_version);
ALTER TABLE finance_nominal_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_nominal_event FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_nominal_event_tenant ON finance_nominal_event
    USING (tenant_id=current_setting('nexora.tenant_id',true))
    WITH CHECK (tenant_id=current_setting('nexora.tenant_id',true));
CREATE TRIGGER finance_nominal_event_immutable
    BEFORE UPDATE OR DELETE ON finance_nominal_event
    FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();

CREATE FUNCTION enforce_finance_nominal_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Finance nominal policy cannot be deleted' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF (NEW.tenant_id,NEW.company_id,NEW.section_id,NEW.category_id,NEW.section_role,
            NEW.prefix,NEW.code_width,NEW.first_value,NEW.last_value,NEW.created_at)
           IS DISTINCT FROM
           (OLD.tenant_id,OLD.company_id,OLD.section_id,OLD.category_id,OLD.section_role,
            OLD.prefix,OLD.code_width,OLD.first_value,OLD.last_value,OLD.created_at)
           OR NEW.next_value<OLD.next_value OR NEW.row_version<>OLD.row_version+1
           OR NEW.updated_at<=OLD.updated_at THEN
            RAISE EXCEPTION 'Finance nominal policy identity, allocation and version are protected' USING ERRCODE='23514';
        END IF;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM account section JOIN account category
          ON category.tenant_id=section.tenant_id AND category.company_id=section.company_id
         AND category.id=section.parent_id
         WHERE section.tenant_id=NEW.tenant_id AND section.company_id=NEW.company_id
           AND section.id=NEW.section_id AND category.id=NEW.category_id
           AND section.is_header AND category.is_header AND section.type='asset' AND category.type='asset'
           AND section.status='active' AND category.status='active'
         FOR SHARE OF section,category
    ) THEN
        RAISE EXCEPTION 'Finance nominal policy requires same-company active asset headers' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER finance_nominal_section_policy_guard
    BEFORE INSERT OR UPDATE OR DELETE ON finance_nominal_section_policy
    FOR EACH ROW EXECUTE FUNCTION enforce_finance_nominal_policy();

CREATE FUNCTION allocate_finance_nominal_code(tenant_value text,company_value text,section_value text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    policy finance_nominal_section_policy%ROWTYPE;
    allocated_code text;
BEGIN
    SELECT * INTO policy FROM finance_nominal_section_policy
     WHERE tenant_id=tenant_value AND company_id=company_value AND section_id=section_value
       AND status='active' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finance nominal code policy is not configured' USING ERRCODE='23514';
    END IF;
    IF policy.next_value>policy.last_value THEN
        RAISE EXCEPTION 'Finance nominal code range is exhausted' USING ERRCODE='23514';
    END IF;
    allocated_code:=policy.prefix||lpad(policy.next_value::text,policy.code_width,'0');
    IF EXISTS (SELECT 1 FROM account WHERE tenant_id=tenant_value AND company_id=company_value AND code=allocated_code) THEN
        RAISE EXCEPTION 'Finance nominal code conflicts with an existing account' USING ERRCODE='23505';
    END IF;
    UPDATE finance_nominal_section_policy SET next_value=next_value+1,row_version=row_version+1,
           updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
     WHERE tenant_id=tenant_value AND company_id=company_value AND section_id=section_value;
    RETURN allocated_code;
END $$;

-- Immediate identity protection complements final-state deferred checks below.
CREATE FUNCTION protect_finance_nominal_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='bank_account' THEN
        IF NEW.identity_mode IS DISTINCT FROM OLD.identity_mode
           OR (OLD.identity_mode='nominal_only' AND NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
            RAISE EXCEPTION 'Bank nominal identity mode and mapping are immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.managed_bank_nominal THEN
            RAISE EXCEPTION 'Managed bank nominals cannot be deleted' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.managed_bank_nominal IS DISTINCT FROM OLD.managed_bank_nominal THEN
        RAISE EXCEPTION 'Managed bank nominal classification is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.managed_bank_nominal THEN
        IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.code,NEW.parent_id,NEW.type,NEW.is_header,
            NEW.manual_posting_allowed,NEW.reconciliation_required,NEW.is_system_account,NEW.created_at)
           IS DISTINCT FROM
           (OLD.id,OLD.tenant_id,OLD.company_id,OLD.code,OLD.parent_id,OLD.type,OLD.is_header,
            OLD.manual_posting_allowed,OLD.reconciliation_required,OLD.is_system_account,OLD.created_at) THEN
            RAISE EXCEPTION 'Managed bank nominal accounting identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.name,NEW.description,NEW.required_dimensions) IS DISTINCT FROM (OLD.name,OLD.description,OLD.required_dimensions)
           AND NOT EXISTS (SELECT 1 FROM bank_account WHERE tenant_id=OLD.tenant_id
                           AND account_id=OLD.id AND identity_mode='nominal_only' AND status='draft') THEN
            RAISE EXCEPTION 'Only draft nominal business fields may be edited' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER finance_nominal_identity_guard BEFORE UPDATE OR DELETE ON account
    FOR EACH ROW EXECUTE FUNCTION protect_finance_nominal_identity();
CREATE TRIGGER bank_nominal_identity_guard BEFORE UPDATE ON bank_account
    FOR EACH ROW EXECUTE FUNCTION protect_finance_nominal_identity();

CREATE FUNCTION validate_finance_bank_nominal(tenant_value text,nominal_value text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    nominal account%ROWTYPE;
    bank bank_account%ROWTYPE;
    policy finance_nominal_section_policy%ROWTYPE;
    currency_status text;
BEGIN
    SELECT * INTO nominal FROM account WHERE tenant_id=tenant_value AND id=nominal_value FOR SHARE;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO bank FROM bank_account WHERE tenant_id=tenant_value AND account_id=nominal_value;
    IF NOT nominal.managed_bank_nominal THEN
        IF FOUND AND bank.identity_mode='nominal_only' THEN
            RAISE EXCEPTION 'Nominal-only capability requires a managed Finance account' USING ERRCODE='23514';
        END IF;
        RETURN;
    END IF;
    IF bank.id IS NULL OR bank.identity_mode<>'nominal_only' OR bank.company_id<>nominal.company_id
       OR bank.account_name<>nominal.name THEN
        RAISE EXCEPTION 'Managed Finance nominal requires exactly one synchronized Banking capability' USING ERRCODE='23514';
    END IF;
    SELECT * INTO policy FROM finance_nominal_section_policy
     WHERE tenant_id=tenant_value AND company_id=nominal.company_id AND section_id=nominal.parent_id FOR SHARE;
    IF NOT FOUND OR policy.section_role<>'cash_and_bank' OR NOT EXISTS (
        SELECT 1 FROM account section JOIN account category
          ON category.tenant_id=section.tenant_id AND category.company_id=section.company_id AND category.id=section.parent_id
         WHERE section.tenant_id=tenant_value AND section.id=nominal.parent_id AND section.company_id=nominal.company_id
           AND category.id=policy.category_id AND section.is_header AND category.is_header
           AND section.type='asset' AND category.type='asset' AND section.status='active' AND category.status='active'
         FOR SHARE OF section,category
    ) THEN
        RAISE EXCEPTION 'Managed nominal requires its governed Cash & Bank hierarchy' USING ERRCODE='23514';
    END IF;
    IF (bank.status='active') IS DISTINCT FROM (nominal.status='active') THEN
        RAISE EXCEPTION 'Finance and Banking nominal states must agree' USING ERRCODE='23514';
    END IF;
    SELECT status INTO currency_status FROM currency WHERE tenant_id=tenant_value AND code=bank.currency FOR SHARE;
    IF bank.status='active' AND (currency_status IS DISTINCT FROM 'active' OR policy.status<>'active') THEN
        RAISE EXCEPTION 'Active bank nominal requires active Currency and Section policy' USING ERRCODE='23514';
    END IF;
END $$;

CREATE FUNCTION enforce_finance_bank_nominal_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target record;
BEGIN
    IF TG_TABLE_NAME='bank_account' THEN
        PERFORM validate_finance_bank_nominal(NEW.tenant_id,NEW.account_id);
    ELSIF TG_TABLE_NAME='account' THEN
        PERFORM validate_finance_bank_nominal(NEW.tenant_id,NEW.id);
        IF NOT NEW.is_header THEN RETURN NULL; END IF;
        -- Revalidate dependants if a Section or Category header is changed.
        FOR target IN SELECT leaf.id FROM account leaf
          JOIN finance_nominal_section_policy policy ON policy.tenant_id=leaf.tenant_id
           AND policy.company_id=leaf.company_id AND policy.section_id=leaf.parent_id
         WHERE leaf.tenant_id=NEW.tenant_id AND leaf.managed_bank_nominal
           AND (policy.section_id=NEW.id OR policy.category_id=NEW.id)
        LOOP PERFORM validate_finance_bank_nominal(NEW.tenant_id,target.id); END LOOP;
    ELSE
        -- Allocation advances only the cursor/version. Its unchanged policy
        -- does not require scanning every nominal in a large Cash & Bank Section.
        IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NULL; END IF;
        FOR target IN SELECT id FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id
                      AND parent_id=NEW.section_id AND managed_bank_nominal
        LOOP PERFORM validate_finance_bank_nominal(NEW.tenant_id,target.id); END LOOP;
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_bank_nominal_consistency AFTER INSERT OR UPDATE ON account
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_bank_nominal_consistency();
CREATE CONSTRAINT TRIGGER bank_finance_nominal_consistency AFTER INSERT OR UPDATE ON bank_account
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_bank_nominal_consistency();
CREATE CONSTRAINT TRIGGER finance_nominal_policy_consistency AFTER INSERT OR UPDATE ON finance_nominal_section_policy
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_bank_nominal_consistency();

CREATE FUNCTION guard_bank_nominal_currency_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='inactive' AND OLD.status='active' AND EXISTS (
        SELECT 1 FROM bank_account WHERE tenant_id=OLD.tenant_id AND currency=OLD.code
          AND identity_mode='nominal_only' AND status='active'
    ) THEN
        RAISE EXCEPTION 'Currency is referenced by an active Bank nominal' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER currency_bank_nominal_status_guard BEFORE UPDATE OF status ON currency
    FOR EACH ROW EXECUTE FUNCTION guard_bank_nominal_currency_status();

CREATE FUNCTION validate_finance_nominal_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    bank bank_account%ROWTYPE;
    expected_state text;
BEGIN
    SELECT * INTO bank FROM bank_account WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_account_id FOR SHARE;
    expected_state:=CASE NEW.event_type WHEN 'created' THEN 'draft' WHEN 'updated' THEN 'draft'
        WHEN 'submitted' THEN 'pending_approval' WHEN 'approved' THEN 'active'
        WHEN 'rejected' THEN 'rejected' WHEN 'deactivated' THEN 'inactive' END;
    IF bank.id IS NULL OR bank.identity_mode<>'nominal_only' OR bank.account_id<>NEW.nominal_id
       OR bank.company_id<>NEW.company_id OR bank.row_version<>NEW.resulting_version OR bank.status<>expected_state
       OR NEW.approval_override_event_id IS DISTINCT FROM
          (CASE WHEN NEW.event_type IN ('approved','rejected') THEN bank.approval_override_event_id ELSE NULL END) THEN
        RAISE EXCEPTION 'Finance nominal event does not match its Banking lifecycle evidence' USING ERRCODE='23514';
    END IF;
    IF NEW.actor_id IS DISTINCT FROM (CASE NEW.event_type
        WHEN 'created' THEN bank.created_by WHEN 'submitted' THEN bank.submitted_by
        WHEN 'approved' THEN bank.approved_by WHEN 'rejected' THEN bank.rejected_by
        WHEN 'deactivated' THEN bank.deactivated_by ELSE NEW.actor_id END) THEN
        RAISE EXCEPTION 'Finance nominal event actor does not match lifecycle authority' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER finance_nominal_event_authority_guard BEFORE INSERT ON finance_nominal_event
    FOR EACH ROW EXECUTE FUNCTION validate_finance_nominal_event();

INSERT INTO security_permission_definition (
    permission_key,module,resource,action,description,required_assurance,
    field_context_required,source_state_context_required,sensitivity
) VALUES
('finance.nominal.read','finance','nominal','read','Read company-scoped Finance nominals.','password',false,false,'sensitive'),
('finance.nominal.create','finance','nominal','create','Create Cash & Bank nominal drafts.','password',true,true,'restricted'),
('finance.nominal.update','finance','nominal','update','Update Cash & Bank nominal drafts.','password',true,true,'restricted'),
('finance.nominal.submit','finance','nominal','submit','Submit Cash & Bank nominals.','password',false,true,'restricted'),
('finance.nominal.approve','finance','nominal','approve','Approve or reject Cash & Bank nominals.','password',false,true,'restricted'),
('finance.nominal.status','finance','nominal','status','Deactivate Cash & Bank nominals.','password',false,true,'restricted')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO nexora_schema_migration (module_name,version,name) VALUES ('finance',9,'bank_nominal_master_data');
