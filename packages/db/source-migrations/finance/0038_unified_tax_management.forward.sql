-- Additive company tax configuration; no grants, rates or financial data are seeded.
CREATE FUNCTION finance_tax_admin(tenant text, company text, actor text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT bank_has_live_permission(tenant,company,actor,'finance.tax.manage')
 AND bank_has_live_permission(tenant,company,actor,'finance.tax_mapping.admin')
 AND EXISTS (
 SELECT 1 FROM security_user_role_assignment_version a
 JOIN security_role_policy p ON p.tenant_id=a.tenant_id AND p.id=a.role_policy_id AND p.status='active' AND p.lifecycle_state='active'
 JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id AND r.lifecycle_state='active'
 WHERE a.tenant_id=tenant AND a.user_id=actor AND a.lifecycle_state='active'
 AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
 AND a.version=(SELECT max(v.version) FROM security_user_role_assignment_version v WHERE v.tenant_id=a.tenant_id AND v.assignment_id=a.assignment_id)
 AND r.role_code IN ('administrator','super_administrator'))
$$;
CREATE TABLE finance_tax_definition (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 code text NOT NULL CHECK(code ~ '^TAX-[0-9]{3,}$'),
 status text NOT NULL CHECK(status IN ('active','inactive')), version integer NOT NULL CHECK(version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,code),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE finance_tax_revision (
 tenant_id text NOT NULL, company_id text NOT NULL, definition_id text NOT NULL,
 revision integer NOT NULL CHECK(revision>0), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 tax_type text NOT NULL CHECK(tax_type IN ('WHT','GST','VAT','Excise','Payroll Tax','Other')),
 rate numeric NOT NULL CHECK(rate>=0 AND rate<=100 AND rate=round(rate,2)),
 description text NOT NULL CHECK(length(description)<=2000), effective_date date NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,definition_id,revision),
 FOREIGN KEY(tenant_id,company_id,definition_id) REFERENCES finance_tax_definition(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id)
);
CREATE TABLE finance_tax_mapping_rule (
 tenant_id text NOT NULL, company_id text NOT NULL, definition_id text NOT NULL, revision integer NOT NULL,
 module text NOT NULL, treatment text NOT NULL, trigger text NOT NULL, account_id text NOT NULL,
 payroll_component_id text, payroll_basis_component_id text,
 CHECK ((module='payroll')=(payroll_component_id IS NOT NULL AND payroll_basis_component_id IS NOT NULL)),
 PRIMARY KEY(tenant_id,company_id,definition_id,revision),
 FOREIGN KEY(tenant_id,company_id,definition_id,revision) REFERENCES finance_tax_revision(tenant_id,company_id,definition_id,revision),
 FOREIGN KEY(tenant_id,company_id,account_id) REFERENCES account(tenant_id,company_id,id),
 CHECK ((module='purchases' AND ((treatment='recoverable' AND trigger='recognition') OR (treatment='withholding' AND trigger IN ('recognition','settlement'))))
 OR (module='sales' AND treatment='output' AND trigger='recognition')
 OR (module='payroll' AND treatment='payroll_deduction' AND trigger='calculation')
 OR (module='fixed_assets' AND treatment IN ('recoverable','withholding') AND trigger='recognition'))
);
CREATE TABLE finance_tax_sequence (
 tenant_id text NOT NULL, company_id text NOT NULL, next_value bigint NOT NULL CHECK(next_value>0),
 PRIMARY KEY(tenant_id,company_id), FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE INDEX finance_tax_mapping_nominal ON finance_tax_mapping_rule(tenant_id,company_id,account_id);
CREATE FUNCTION guard_finance_tax_control_reuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM finance_tax_mapping_rule m WHERE m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id
 AND m.account_id IN (NEW.receivable_account_id,NEW.payable_account_id)) THEN
 RAISE EXCEPTION 'A tax nominal cannot also become a receivable or payable control account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_tax_control_reuse BEFORE INSERT ON finance_subledger_policy FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_control_reuse();
CREATE TABLE finance_tax_audit (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, definition_id text NOT NULL,
 actor_id text NOT NULL, action text NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 evidence jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), FOREIGN KEY(tenant_id,company_id,definition_id) REFERENCES finance_tax_definition(tenant_id,company_id,id)
);
CREATE TABLE finance_tax_idempotency (
 tenant_id text NOT NULL, company_id text NOT NULL, actor_id text NOT NULL, key text NOT NULL,
 fingerprint text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,company_id,actor_id,key), FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id)
);
CREATE TABLE finance_tax_application (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, definition_id text NOT NULL, revision integer NOT NULL,
 source_type text NOT NULL, source_id text NOT NULL, source_line text NOT NULL, application_date date NOT NULL,
 prior_basis numeric NOT NULL DEFAULT 0, prior_amount numeric NOT NULL DEFAULT 0,
 basis numeric NOT NULL, amount numeric NOT NULL, currency text NOT NULL, decimal_places integer NOT NULL CHECK(decimal_places BETWEEN 0 AND 8),
 base_amount numeric NOT NULL, rate numeric NOT NULL CHECK(rate>0), base_decimal_places integer NOT NULL CHECK(base_decimal_places BETWEEN 0 AND 8),
 journal_id text NOT NULL, reverses_id text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,source_type,source_id,source_line),
 UNIQUE(tenant_id,company_id,reverses_id),
 FOREIGN KEY(tenant_id,company_id,definition_id,revision) REFERENCES finance_tax_mapping_rule(tenant_id,company_id,definition_id,revision),
 FOREIGN KEY(tenant_id,company_id,journal_id) REFERENCES journal_entry(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id,reverses_id) REFERENCES finance_tax_application(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,currency) REFERENCES currency(tenant_id,code),
 CHECK(basis=round(basis,decimal_places) AND amount=round(amount,decimal_places) AND base_amount=round(base_amount,base_decimal_places))
);
CREATE INDEX finance_tax_application_source ON finance_tax_application(tenant_id,company_id,source_type,source_id);
CREATE INDEX finance_tax_application_journal ON finance_tax_application(tenant_id,company_id,journal_id,currency);
CREATE INDEX finance_tax_application_item ON finance_tax_application(tenant_id,company_id,definition_id,revision,source_line,currency);
CREATE INDEX finance_tax_revision_effective ON finance_tax_revision(tenant_id,company_id,definition_id,effective_date DESC,revision DESC);
CREATE FUNCTION guard_finance_tax_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Tax configuration cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NOT finance_tax_admin(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true)) THEN
 RAISE EXCEPTION 'Tax mapping requires current administrator authority' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='finance_tax_definition' AND TG_OP='UPDATE' THEN
 IF
 ((NEW.tenant_id,NEW.company_id,NEW.id,NEW.code,NEW.created_by,NEW.created_at) IS DISTINCT FROM
 (OLD.tenant_id,OLD.company_id,OLD.id,OLD.code,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1) THEN
 RAISE EXCEPTION 'Tax identity or optimistic version changed' USING ERRCODE='40001'; END IF; END IF;
 IF TG_TABLE_NAME='finance_tax_mapping_rule' THEN
 IF NOT EXISTS(
 SELECT 1 FROM account a WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.id=NEW.account_id
 AND a.status='active' AND NOT a.is_header AND NOT a.reconciliation_required
 AND a.type=CASE WHEN NEW.treatment='recoverable' THEN 'asset' ELSE 'liability' END
 AND NOT EXISTS(SELECT 1 FROM bank_account b WHERE b.tenant_id=a.tenant_id AND b.company_id=a.company_id AND b.account_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM finance_subledger_policy p WHERE p.tenant_id=a.tenant_id AND p.company_id=a.company_id AND a.id IN (p.receivable_account_id,p.payable_account_id))) THEN
 RAISE EXCEPTION 'Select an eligible company tax posting account' USING ERRCODE='23514'; END IF; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tax_definition_authority BEFORE INSERT OR UPDATE OR DELETE ON finance_tax_definition FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_admin();
CREATE TRIGGER tax_revision_authority BEFORE INSERT ON finance_tax_revision FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_admin();
CREATE TRIGGER tax_mapping_authority BEFORE INSERT ON finance_tax_mapping_rule FOR EACH ROW EXECUTE FUNCTION guard_finance_tax_admin();
CREATE FUNCTION check_finance_tax_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tax_rate numeric; mapped_account text; treatment text; expected_effect numeric; actual_effect numeric; actual_native numeric; previous_basis numeric; previous_amount numeric; original finance_tax_application%ROWTYPE;
BEGIN
 SELECT r.rate,m.account_id,m.treatment INTO tax_rate,mapped_account,treatment FROM finance_tax_revision r JOIN finance_tax_mapping_rule m
 USING(tenant_id,company_id,definition_id,revision) WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.definition_id=NEW.definition_id AND r.revision=NEW.revision;
 IF NEW.amount<>round((NEW.basis+NEW.prior_basis)*tax_rate/100,NEW.decimal_places)-NEW.prior_amount OR NEW.base_amount<>round(NEW.amount*NEW.rate,NEW.base_decimal_places) THEN
 RAISE EXCEPTION 'Tax application arithmetic disagrees with its retained revision' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id AND posting_date=NEW.application_date AND status IN ('posted','reversed')) THEN
 RAISE EXCEPTION 'Tax application requires its atomic posted journal' USING ERRCODE='23514'; END IF;
 IF NEW.source_type='currency_subledger' THEN
 IF NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'finance.subledger.post') OR NOT EXISTS(
 SELECT 1 FROM finance_subledger_operation o WHERE o.tenant_id=NEW.tenant_id AND o.company_id=NEW.company_id AND o.id=NEW.source_id AND o.state='posted' AND o.journal_id=NEW.journal_id
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.preview->'taxes') WITH ORDINALITY v(t,position) WHERE t->>'definition_id'=NEW.definition_id AND (t->>'revision')::integer=NEW.revision AND (t->>'basis')::numeric=NEW.basis AND (t->>'amount')::numeric=NEW.amount AND coalesce(t->>'source_item_id',(position-1)::text)=NEW.source_line AND t->>'currency'=NEW.currency)) THEN
 RAISE EXCEPTION 'Tax applications require the authorized source posting and retained preview' USING ERRCODE='23514'; END IF;
 IF NEW.reverses_id IS NULL AND EXISTS(SELECT 1 FROM finance_tax_mapping_rule m WHERE m.tenant_id=NEW.tenant_id AND m.company_id=NEW.company_id AND m.definition_id=NEW.definition_id AND m.revision=NEW.revision AND m.trigger='settlement') THEN
 SELECT coalesce(sum(basis),0),coalesce(sum(amount),0) INTO previous_basis,previous_amount FROM finance_tax_application
 WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND definition_id=NEW.definition_id AND revision=NEW.revision AND source_line=NEW.source_line AND currency=NEW.currency AND id<>NEW.id;
 IF NEW.prior_basis<>previous_basis OR NEW.prior_amount<>previous_amount THEN
 RAISE EXCEPTION 'Cumulative withholding must use the retained prior applications' USING ERRCODE='23514'; END IF;
 END IF;
 ELSIF NEW.source_type='hr.payroll' THEN
 IF NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,current_setting('nexora.user_id',true),'finance.journal.post') OR NOT EXISTS(
 SELECT 1 FROM journal_entry j JOIN accounting_event e ON e.tenant_id=j.tenant_id AND e.id=j.source_id
 WHERE j.tenant_id=NEW.tenant_id AND j.company_id=NEW.company_id AND j.id=NEW.journal_id AND e.source_type='hr.payroll' AND e.source_id=NEW.source_id AND e.state='posted') THEN
 RAISE EXCEPTION 'Payroll tax applications require the authorized Payroll accounting event' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_payroll_result_item i JOIN hr_payroll_result r ON r.tenant_id=i.tenant_id AND r.id=i.result_id
 JOIN hr_payroll_period p ON p.tenant_id=r.tenant_id AND p.company_id=r.company_id AND p.id=r.period_id AND p.run_number=r.run_number AND p.state IN ('posted','paid')
 WHERE r.tenant_id=NEW.tenant_id AND r.company_id=NEW.company_id AND r.period_id=NEW.source_id AND i.id=NEW.source_line
 AND i.tax_snapshot->>'definition_id'=NEW.definition_id AND (i.tax_snapshot->>'revision')::integer=NEW.revision
 AND (i.tax_snapshot->>'basis')::numeric=NEW.basis AND i.amount=NEW.amount AND r.currency_code=NEW.currency) THEN
 RAISE EXCEPTION 'Payroll tax evidence must identify its exact immutable result item' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported tax posting source' USING ERRCODE='23514'; END IF;
 IF NEW.reverses_id IS NOT NULL THEN
 SELECT * INTO original FROM finance_tax_application WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.reverses_id;
 IF (NEW.definition_id,NEW.revision,NEW.currency,NEW.rate,NEW.basis,NEW.amount,NEW.base_amount,NEW.prior_basis,NEW.prior_amount) IS DISTINCT FROM
 (original.definition_id,original.revision,original.currency,original.rate,-original.basis,-original.amount,-original.base_amount,-original.prior_basis,-original.prior_amount) THEN
 RAISE EXCEPTION 'Reversal must retain original tax evidence exactly' USING ERRCODE='23514'; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM finance_tax_definition d WHERE d.tenant_id=NEW.tenant_id AND d.company_id=NEW.company_id AND d.id=NEW.definition_id AND d.status='active') THEN
 RAISE EXCEPTION 'Inactive taxes cannot enter new postings' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT coalesce(sum(CASE WHEN m.treatment='recoverable' THEN a.base_amount ELSE -a.base_amount END),0),
 coalesce(sum(CASE WHEN m.treatment='recoverable' THEN a.amount ELSE -a.amount END),0)
 INTO expected_effect,actual_native FROM finance_tax_application a JOIN finance_tax_mapping_rule m
 USING(tenant_id,company_id,definition_id,revision)
 WHERE a.tenant_id=NEW.tenant_id AND a.company_id=NEW.company_id AND a.journal_id=NEW.journal_id AND m.account_id=mapped_account AND a.currency=NEW.currency;
 SELECT coalesce(sum(base_debit-base_credit),0) INTO actual_effect FROM journal_line
 WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id AND account_id=mapped_account AND currency=NEW.currency;
 IF expected_effect<>actual_effect OR actual_native<>(SELECT coalesce(sum(debit-credit),0) FROM journal_line WHERE tenant_id=NEW.tenant_id AND journal_id=NEW.journal_id AND account_id=mapped_account AND currency=NEW.currency) THEN
 RAISE EXCEPTION 'Tax application must reconcile to its mapped GL account' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_tax_posted_effect AFTER INSERT ON finance_tax_application DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_finance_tax_application();
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['finance_tax_definition','finance_tax_revision','finance_tax_mapping_rule','finance_tax_sequence','finance_tax_audit','finance_tax_idempotency','finance_tax_application'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY company_scope ON %I USING (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access c WHERE c.tenant_id=%I.tenant_id AND c.company_id=%I.company_id AND c.user_id=current_setting(''nexora.user_id'',true) AND c.revoked_at IS NULL)) WITH CHECK (tenant_id=current_setting(''nexora.tenant_id'',true) AND EXISTS(SELECT 1 FROM security_user_company_access c WHERE c.tenant_id=%I.tenant_id AND c.company_id=%I.company_id AND c.user_id=current_setting(''nexora.user_id'',true) AND c.revoked_at IS NULL))',relation,relation,relation,relation,relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['finance_tax_revision','finance_tax_mapping_rule','finance_tax_audit','finance_tax_idempotency','finance_tax_application'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_tax_evidence BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_finance_subledger_immutable()',relation);
 END LOOP;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('finance',38,'unified_tax_management');
