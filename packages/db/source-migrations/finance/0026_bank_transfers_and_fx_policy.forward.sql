-- Governed same-company Bank Transfers, Transfer/FX policy and immutable workflow evidence.

CREATE TABLE bank_transfer_fx_policy (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 fx_gain_nominal_id text NOT NULL, fx_loss_nominal_id text NOT NULL,
 rounding_nominal_id text NOT NULL, bank_charge_nominal_id text NOT NULL,
 rounding_tolerance numeric(38,8) NOT NULL CHECK(rounding_tolerance>=0),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id), UNIQUE(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,fx_gain_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,fx_loss_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,rounding_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,bank_charge_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,updated_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_transfer_fx_policy_event (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 policy_id text NOT NULL, actor_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('created','updated')),
 record_version bigint NOT NULL CHECK(record_version>0),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 correlation_id text NOT NULL CHECK(length(correlation_id) BETWEEN 1 AND 128),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,policy_id,record_version),
 FOREIGN KEY(tenant_id,id) REFERENCES platform_admin_audit_event(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,policy_id) REFERENCES bank_transfer_fx_policy(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);

CREATE FUNCTION guard_bank_transfer_fx_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal_id text; nominal account%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer FX policy cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM
     (OLD.tenant_id,OLD.company_id,OLD.id,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'Transfer FX policy identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN
   RAISE EXCEPTION 'Transfer FX policy version and update time must advance' USING ERRCODE='23514'; END IF;
 ELSIF NEW.row_version<>1 THEN
  RAISE EXCEPTION 'New Transfer FX policy version must be one' USING ERRCODE='23514';
 END IF;
 FOREACH nominal_id IN ARRAY ARRAY[NEW.fx_gain_nominal_id,NEW.fx_loss_nominal_id,NEW.rounding_nominal_id,NEW.bank_charge_nominal_id] LOOP
  SELECT * INTO nominal FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=nominal_id FOR SHARE;
  IF nominal.id IS NULL OR nominal.status<>'active' OR nominal.is_header OR NOT nominal.manual_posting_allowed OR nominal.managed_bank_nominal THEN
   RAISE EXCEPTION 'Transfer FX policy requires active non-Bank postable company nominals' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_fx_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_transfer_fx_policy
FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_fx_policy();

CREATE TABLE bank_transfer_sequence (
 tenant_id text NOT NULL, company_id text NOT NULL,
 fiscal_year integer NOT NULL CHECK(fiscal_year BETWEEN 1900 AND 2999),
 next_value bigint NOT NULL CHECK(next_value>0),
 PRIMARY KEY(tenant_id,company_id,fiscal_year),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE bank_transfer (
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 128), tenant_id text NOT NULL, company_id text NOT NULL,
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 64),
 posting_date date NOT NULL, value_date date,
 base_currency text NOT NULL CHECK(base_currency ~ '^[A-Z]{3}$'),
 fx_policy_id text NOT NULL, fx_policy_version bigint NOT NULL CHECK(fx_policy_version>0),
 fx_gain_nominal_id text NOT NULL, fx_loss_nominal_id text NOT NULL,
 rounding_nominal_id text NOT NULL, bank_charge_nominal_id text NOT NULL,
 rounding_tolerance numeric(38,8) NOT NULL CHECK(rounding_tolerance>=0),
 total_base_amount numeric(38,8) NOT NULL DEFAULT 0 CHECK(total_base_amount>=0),
 project_id text, location_id text, approver_user_id text,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected','posted','reversed')),
 row_version bigint NOT NULL DEFAULT 1 CHECK(row_version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 submitted_by text, submitted_at timestamptz, approved_by text, approved_at timestamptz,
 rejected_by text, rejected_at timestamptz, decision_reason text CHECK(decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500),
 approval_override_event_id text, delegated_decision_id text, approver_reassignment_id text,
 posted_by text, posted_at timestamptz, original_period_id text, original_accounting_event_id text, original_journal_entry_id text,
 reversed_by text, reversed_at timestamptz, reversal_reason text CHECK(reversal_reason IS NULL OR length(btrim(reversal_reason)) BETWEEN 3 AND 500),
 reversal_period_id text, reversal_accounting_event_id text, reversal_journal_entry_id text,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,id), UNIQUE(tenant_id,company_id,reference),
 UNIQUE(tenant_id,original_accounting_event_id), UNIQUE(tenant_id,original_journal_entry_id),
 UNIQUE(tenant_id,reversal_accounting_event_id), UNIQUE(tenant_id,reversal_journal_entry_id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,base_currency) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,fx_policy_id) REFERENCES bank_transfer_fx_policy(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,fx_gain_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,fx_loss_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,rounding_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,bank_charge_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,project_id) REFERENCES erp_project(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,location_id) REFERENCES erp_location(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approver_user_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approved_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,rejected_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,posted_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,reversed_by) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,approval_override_event_id) REFERENCES approval_override_event(tenant_id,event_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,original_period_id) REFERENCES financial_period(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,reversal_period_id) REFERENCES financial_period(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,original_accounting_event_id) REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,reversal_accounting_event_id) REFERENCES accounting_event(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,original_journal_entry_id) REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,reversal_journal_entry_id) REFERENCES journal_entry(tenant_id,company_id,id) ON DELETE RESTRICT,
 CONSTRAINT bank_transfer_lifecycle_evidence CHECK(
  (state='draft' AND submitted_by IS NULL AND approved_by IS NULL AND rejected_by IS NULL AND posted_by IS NULL AND reversed_by IS NULL)
  OR (state='submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NULL AND rejected_by IS NULL AND posted_by IS NULL AND reversed_by IS NULL)
  OR (state='approved' AND submitted_by IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND rejected_by IS NULL AND posted_by IS NULL AND reversed_by IS NULL)
  OR (state='rejected' AND submitted_by IS NOT NULL AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND decision_reason IS NOT NULL AND approved_by IS NULL AND posted_by IS NULL AND reversed_by IS NULL)
  OR (state='posted' AND submitted_by IS NOT NULL AND approved_by IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL
      AND original_period_id IS NOT NULL AND original_accounting_event_id IS NOT NULL AND original_journal_entry_id IS NOT NULL AND reversed_by IS NULL)
  OR (state='reversed' AND submitted_by IS NOT NULL AND approved_by IS NOT NULL AND posted_by IS NOT NULL
      AND original_period_id IS NOT NULL AND original_accounting_event_id IS NOT NULL AND original_journal_entry_id IS NOT NULL
      AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL
      AND reversal_period_id IS NOT NULL AND reversal_accounting_event_id IS NOT NULL AND reversal_journal_entry_id IS NOT NULL)
 ),
 CONSTRAINT bank_transfer_decision_separation CHECK(
  state IN ('draft','submitted') OR
  (state IN ('approved','posted','reversed','rejected') AND (
   ((CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)<>created_by
     AND (CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)<>submitted_by
     AND approval_override_event_id IS NULL AND delegated_decision_id IS NULL)
   OR (((CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)=created_by
      OR (CASE WHEN state='rejected' THEN rejected_by ELSE approved_by END)=submitted_by)
      AND num_nonnulls(approval_override_event_id,delegated_decision_id)=1))
  ))
);

CREATE TABLE bank_transfer_line (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, transfer_id text NOT NULL,
 line_order integer NOT NULL CHECK(line_order BETWEEN 1 AND 200), document_date date NOT NULL,
 from_bank_account_id text NOT NULL, to_bank_account_id text NOT NULL,
 external_reference text CHECK(external_reference IS NULL OR length(btrim(external_reference)) BETWEEN 1 AND 100),
 mode text NOT NULL CHECK(mode IN ('internal','local_bank','wire_swift','standing_order')),
 details text CHECK(details IS NULL OR length(btrim(details)) BETWEEN 1 AND 500),
 source_currency text NOT NULL CHECK(source_currency ~ '^[A-Z]{3}$'), destination_currency text NOT NULL CHECK(destination_currency ~ '^[A-Z]{3}$'),
 source_amount numeric(38,8) NOT NULL CHECK(source_amount>0), destination_amount numeric(38,8) NOT NULL CHECK(destination_amount>0),
 source_rate_id text, source_rate_value numeric(38,18) NOT NULL CHECK(source_rate_value>0), source_rate_effective_date date,
 destination_rate_id text, destination_rate_value numeric(38,18) NOT NULL CHECK(destination_rate_value>0), destination_rate_effective_date date,
 source_base_amount numeric(38,8) NOT NULL CHECK(source_base_amount>0), destination_base_amount numeric(38,8) NOT NULL CHECK(destination_base_amount>0),
 bank_charge_amount numeric(38,8) NOT NULL DEFAULT 0 CHECK(bank_charge_amount>=0), bank_charge_base_amount numeric(38,8) NOT NULL DEFAULT 0 CHECK(bank_charge_base_amount>=0),
 fx_difference numeric(38,8) NOT NULL,
 source_control_nominal_id text NOT NULL, destination_control_nominal_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,transfer_id,line_order),
 CHECK(from_bank_account_id<>to_bank_account_id),
 CHECK((bank_charge_amount=0 AND bank_charge_base_amount=0) OR (bank_charge_amount>0 AND bank_charge_base_amount>0)),
 CHECK((source_rate_id IS NULL AND source_rate_value=1 AND source_rate_effective_date IS NULL) OR
       (source_rate_id IS NOT NULL AND source_rate_effective_date IS NOT NULL)),
 CHECK((destination_rate_id IS NULL AND destination_rate_value=1 AND destination_rate_effective_date IS NULL) OR
       (destination_rate_id IS NOT NULL AND destination_rate_effective_date IS NOT NULL)),
 FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES bank_transfer(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,from_bank_account_id) REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,to_bank_account_id) REFERENCES bank_account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,source_currency) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,destination_currency) REFERENCES currency(tenant_id,code) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,source_rate_id) REFERENCES currency_rate(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,destination_rate_id) REFERENCES currency_rate(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,source_control_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,destination_control_nominal_id) REFERENCES account(tenant_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX bank_transfer_directory ON bank_transfer(tenant_id,company_id,state,posting_date DESC,id DESC);
CREATE INDEX bank_transfer_assigned_queue ON bank_transfer(tenant_id,company_id,approver_user_id,state,id);
CREATE INDEX bank_transfer_line_source ON bank_transfer_line(tenant_id,company_id,from_bank_account_id,document_date);
CREATE INDEX bank_transfer_line_destination ON bank_transfer_line(tenant_id,company_id,to_bank_account_id,document_date);

CREATE TABLE bank_transfer_event (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL, transfer_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('draft_created','draft_updated','submitted','approved','rejected','approver_reassigned','posted','reversed')),
 actor_id text NOT NULL, record_version bigint NOT NULL CHECK(record_version>0),
 reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500),
 correlation_id text NOT NULL CHECK(length(correlation_id) BETWEEN 1 AND 128),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,transfer_id,record_version,event_type),
 FOREIGN KEY(tenant_id,id) REFERENCES platform_admin_audit_event(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES bank_transfer(tenant_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX bank_transfer_event_history ON bank_transfer_event(tenant_id,company_id,transfer_id,occurred_at,id);

CREATE FUNCTION guard_bank_transfer_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header bank_transfer%ROWTYPE; source_bank bank_account%ROWTYPE; destination_bank bank_account%ROWTYPE; rate_row currency_rate%ROWTYPE;
BEGIN
 SELECT * INTO header FROM bank_transfer WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND id=COALESCE(NEW.transfer_id,OLD.transfer_id) FOR SHARE;
 IF header.id IS NULL OR header.state<>'draft' THEN RAISE EXCEPTION 'Only draft Transfer lines may change' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.company_id<>header.company_id THEN RAISE EXCEPTION 'Transfer line company mismatch' USING ERRCODE='23514'; END IF;
 SELECT * INTO source_bank FROM bank_account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.from_bank_account_id FOR SHARE;
 SELECT * INTO destination_bank FROM bank_account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.to_bank_account_id FOR SHARE;
 IF source_bank.id IS NULL OR destination_bank.id IS NULL OR source_bank.status<>'active' OR destination_bank.status<>'active'
    OR source_bank.account_id<>NEW.source_control_nominal_id OR destination_bank.account_id<>NEW.destination_control_nominal_id
    OR source_bank.currency<>NEW.source_currency OR destination_bank.currency<>NEW.destination_currency THEN
  RAISE EXCEPTION 'Transfer requires distinct active same-company Banks with matching control and currency evidence' USING ERRCODE='23514';
 END IF;
 IF NEW.source_currency=header.base_currency THEN
  IF NEW.source_rate_id IS NOT NULL OR NEW.source_rate_value<>1 OR NEW.source_rate_effective_date IS NOT NULL THEN RAISE EXCEPTION 'Invalid source base-currency evidence' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO rate_row FROM currency_rate WHERE tenant_id=NEW.tenant_id AND id=NEW.source_rate_id FOR SHARE;
  IF rate_row.id IS NULL OR rate_row.status<>'active' OR rate_row.source_currency<>NEW.source_currency OR rate_row.target_currency<>header.base_currency
     OR rate_row.rate<>NEW.source_rate_value OR rate_row.effective_date<>NEW.source_rate_effective_date OR rate_row.effective_date>NEW.document_date THEN
   RAISE EXCEPTION 'Invalid source rate snapshot' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.destination_currency=header.base_currency THEN
  IF NEW.destination_rate_id IS NOT NULL OR NEW.destination_rate_value<>1 OR NEW.destination_rate_effective_date IS NOT NULL THEN RAISE EXCEPTION 'Invalid destination base-currency evidence' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO rate_row FROM currency_rate WHERE tenant_id=NEW.tenant_id AND id=NEW.destination_rate_id FOR SHARE;
  IF rate_row.id IS NULL OR rate_row.status<>'active' OR rate_row.source_currency<>NEW.destination_currency OR rate_row.target_currency<>header.base_currency
     OR rate_row.rate<>NEW.destination_rate_value OR rate_row.effective_date<>NEW.destination_rate_effective_date OR rate_row.effective_date>NEW.document_date THEN
   RAISE EXCEPTION 'Invalid destination rate snapshot' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_line_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_transfer_line
FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_line();

CREATE FUNCTION guard_bank_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy bank_transfer_fx_policy%ROWTYPE; line_count integer; persisted_total numeric(38,8);
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bank Transfers cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.row_version<>1 THEN RAISE EXCEPTION 'New Bank Transfers must be version-one drafts' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW.tenant_id,NEW.company_id,NEW.id,NEW.reference,NEW.created_by,NEW.created_at) IS DISTINCT FROM
     (OLD.tenant_id,OLD.company_id,OLD.id,OLD.reference,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Transfer identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.row_version<>OLD.row_version+1 OR NEW.updated_at<=OLD.updated_at THEN RAISE EXCEPTION 'Transfer version and update time must advance' USING ERRCODE='23514'; END IF;
  IF NEW.state=OLD.state AND OLD.state<>'draft' AND NOT (
    OLD.state='submitted' AND NEW.approver_user_id IS DISTINCT FROM OLD.approver_user_id
    AND NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id
    AND (to_jsonb(NEW)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id'])=
        (to_jsonb(OLD)-ARRAY['row_version','updated_at','approver_user_id','approver_reassignment_id'])
  ) THEN RAISE EXCEPTION 'Only draft Bank Transfers may be edited' USING ERRCODE='23514'; END IF;
  IF NEW.state<>OLD.state AND NOT ((OLD.state='draft' AND NEW.state='submitted') OR (OLD.state='submitted' AND NEW.state IN ('approved','rejected'))
    OR (OLD.state='approved' AND NEW.state='posted') OR (OLD.state='posted' AND NEW.state='reversed')) THEN
   RAISE EXCEPTION 'Invalid Bank Transfer lifecycle transition' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'draft' AND (to_jsonb(NEW)-ARRAY['state','row_version','updated_at','approver_user_id','approver_reassignment_id','submitted_by','submitted_at',
    'approved_by','approved_at','rejected_by','rejected_at','decision_reason','approval_override_event_id','delegated_decision_id','posted_by','posted_at',
    'original_period_id','original_accounting_event_id','original_journal_entry_id','reversed_by','reversed_at','reversal_reason','reversal_period_id',
    'reversal_accounting_event_id','reversal_journal_entry_id']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','row_version','updated_at','approver_user_id','approver_reassignment_id','submitted_by','submitted_at',
    'approved_by','approved_at','rejected_by','rejected_at','decision_reason','approval_override_event_id','delegated_decision_id','posted_by','posted_at',
    'original_period_id','original_accounting_event_id','original_journal_entry_id','reversed_by','reversed_at','reversal_reason','reversal_period_id',
    'reversal_accounting_event_id','reversal_journal_entry_id']) THEN RAISE EXCEPTION 'Submitted Transfer facts are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO policy FROM bank_transfer_fx_policy WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id FOR SHARE;
 IF policy.id IS NULL OR (NEW.state IN ('draft','submitted') AND (NEW.fx_policy_id,NEW.fx_policy_version,NEW.fx_gain_nominal_id,NEW.fx_loss_nominal_id,
    NEW.rounding_nominal_id,NEW.bank_charge_nominal_id,NEW.rounding_tolerance) IS DISTINCT FROM
    (policy.id,policy.row_version,policy.fx_gain_nominal_id,policy.fx_loss_nominal_id,policy.rounding_nominal_id,policy.bank_charge_nominal_id,policy.rounding_tolerance)) THEN
  RAISE EXCEPTION 'Current company Transfer FX policy is required' USING ERRCODE='23514';
 END IF;
 IF NEW.approver_user_id IS NOT NULL AND NEW.state IN ('draft','submitted','approved','rejected') AND
    NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.approver_user_id,'banking.transfer.approve') THEN
  RAISE EXCEPTION 'Assigned Transfer approver is not eligible' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.state='draft' AND NEW.state='submitted' THEN
  IF NEW.approver_user_id IS NULL THEN RAISE EXCEPTION 'Select an eligible Transfer approver' USING ERRCODE='23514'; END IF;
  SELECT count(*)::integer,coalesce(sum(destination_base_amount),0) INTO line_count,persisted_total
    FROM bank_transfer_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND transfer_id=NEW.id;
  IF line_count NOT BETWEEN 1 AND 200 OR persisted_total<=0 OR persisted_total<>NEW.total_base_amount THEN
   RAISE EXCEPTION 'Submitted Transfer lines must match the positive persisted base total' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_transfer
FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer();

-- Extend the existing shared Bank governance evidence without granting anyone authority.
ALTER TABLE bank_self_approval_grant_version
 DROP CONSTRAINT bank_self_approval_grant_version_transaction_kind_check,
 ADD CONSTRAINT bank_self_approval_grant_version_transaction_kind_check CHECK(transaction_kind IN ('payment','receipt','transfer'));

CREATE OR REPLACE FUNCTION bank_can_self_approve(t text,c text,u text,k text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT k IN ('payment','receipt','transfer') AND bank_has_live_permission(t,c,u,'banking.'||k||'.approve')
 AND EXISTS(SELECT 1 FROM bank_self_approval_grant_version g WHERE g.tenant_id=t AND g.company_id=c
  AND g.transaction_kind=k AND g.user_id=u AND g.state='active' AND g.version=(
   SELECT max(v.version) FROM bank_self_approval_grant_version v WHERE v.tenant_id=t AND v.company_id=c AND v.transaction_kind=k AND v.user_id=u))
$$;

ALTER TABLE bank_delegated_decision
 ADD COLUMN transfer_id text,
 DROP CONSTRAINT bank_delegated_decision_transaction_kind_check,
 DROP CONSTRAINT bank_delegated_decision_check,
 ADD CONSTRAINT bank_delegated_decision_transaction_kind_check CHECK(transaction_kind IN ('payment','receipt','transfer')),
 ADD CONSTRAINT bank_delegated_decision_target_check CHECK(
  (transaction_kind='payment' AND payment_id IS NOT NULL AND receipt_id IS NULL AND transfer_id IS NULL) OR
  (transaction_kind='receipt' AND receipt_id IS NOT NULL AND payment_id IS NULL AND transfer_id IS NULL) OR
  (transaction_kind='transfer' AND transfer_id IS NOT NULL AND payment_id IS NULL AND receipt_id IS NULL)),
 ADD CONSTRAINT bank_delegated_decision_transfer_fk FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES bank_transfer(tenant_id,company_id,id);
CREATE UNIQUE INDEX bank_delegated_decision_transfer_unique ON bank_delegated_decision(tenant_id,transfer_id) WHERE transfer_id IS NOT NULL;

ALTER TABLE bank_approver_reassignment
 ADD COLUMN transfer_id text,
 DROP CONSTRAINT bank_approver_reassignment_transaction_kind_check,
 DROP CONSTRAINT bank_approver_reassignment_check1,
 ADD CONSTRAINT bank_approver_reassignment_transaction_kind_check CHECK(transaction_kind IN ('payment','receipt','transfer')),
 ADD CONSTRAINT bank_approver_reassignment_target_check CHECK(
  (transaction_kind='payment' AND payment_id IS NOT NULL AND receipt_id IS NULL AND transfer_id IS NULL) OR
  (transaction_kind='receipt' AND receipt_id IS NOT NULL AND payment_id IS NULL AND transfer_id IS NULL) OR
  (transaction_kind='transfer' AND transfer_id IS NOT NULL AND payment_id IS NULL AND receipt_id IS NULL)),
 ADD CONSTRAINT bank_approver_reassignment_transfer_fk FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES bank_transfer(tenant_id,company_id,id);
CREATE UNIQUE INDEX bank_approver_reassignment_transfer_version ON bank_approver_reassignment(tenant_id,transfer_id,record_version) WHERE transfer_id IS NOT NULL;

ALTER TABLE bank_transfer
 ADD CONSTRAINT bank_transfer_delegated_decision_fk FOREIGN KEY(tenant_id,delegated_decision_id) REFERENCES bank_delegated_decision(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT bank_transfer_approver_reassignment_fk FOREIGN KEY(tenant_id,approver_reassignment_id) REFERENCES bank_approver_reassignment(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE bank_assignment_intervention
 ADD COLUMN transfer_id text,
 DROP CONSTRAINT bank_assignment_intervention_check,
 ADD CONSTRAINT bank_assignment_intervention_target_check CHECK(num_nonnulls(payment_id,receipt_id,transfer_id)=1),
 ADD CONSTRAINT bank_assignment_intervention_transfer_fk FOREIGN KEY(tenant_id,company_id,transfer_id) REFERENCES bank_transfer(tenant_id,company_id,id);

CREATE OR REPLACE FUNCTION bind_bank_governance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target record; k text:=NEW.transaction_kind; target_id text:=coalesce(NEW.payment_id,NEW.receipt_id,NEW.transfer_id); is_decision boolean:=TG_TABLE_NAME='bank_delegated_decision'; deciding text;
BEGIN
 EXECUTE format('SELECT * FROM bank_%I WHERE tenant_id=$1 AND company_id=$2 AND id=$3',k) INTO target USING NEW.tenant_id,NEW.company_id,target_id;
 IF target.id IS NULL OR target.row_version<>NEW.record_version THEN RAISE EXCEPTION 'Governance evidence version mismatch' USING ERRCODE='23514'; END IF;
 IF is_decision THEN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('nexora:security:admin:'||NEW.tenant_id,0));
  deciding:=CASE target.state WHEN 'approved' THEN target.approved_by WHEN 'rejected' THEN target.rejected_by ELSE NULL END;
  IF target.delegated_decision_id IS DISTINCT FROM NEW.id OR target.approval_override_event_id IS NOT NULL
   OR deciding IS DISTINCT FROM NEW.user_id OR target.approver_user_id IS DISTINCT FROM NEW.user_id
   OR NEW.created_by<>target.created_by OR NEW.submitted_by<>target.submitted_by
   OR (NEW.user_id<>target.created_by AND NEW.user_id<>target.submitted_by)
   OR NEW.decision_action<>(CASE target.state WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' ELSE '' END)
   OR NOT bank_can_self_approve(NEW.tenant_id,NEW.company_id,NEW.user_id,k)
   OR NEW.grant_version<>(SELECT max(version) FROM bank_self_approval_grant_version WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND transaction_kind=k AND user_id=NEW.user_id)
   OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id AND a.actor_id=NEW.user_id
    AND a.entity_type='bank_'||k AND a.entity_id=target_id AND a.action='banking.'||k||'.'||NEW.decision_action AND a.approval_reference IS NULL)
  THEN RAISE EXCEPTION 'Delegated Bank decision requires exact live grant and audit evidence' USING ERRCODE='23514'; END IF;
 ELSE
  IF target.state<>'submitted' OR target.approver_reassignment_id IS DISTINCT FROM NEW.id OR target.approver_user_id<>NEW.assigned_user_id
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'platform.approval.override',true)
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.actor_id,'banking.'||k||'.approve')
   OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,'banking.'||k||'.approve')
   OR (NEW.assigned_user_id IN (target.created_by,target.submitted_by) AND NOT (
    bank_can_self_approve(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,k)
    OR bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.assigned_user_id,'platform.approval.override',true)))
   OR NOT EXISTS(SELECT 1 FROM platform_admin_audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_event_id AND a.actor_id=NEW.actor_id
    AND a.entity_type='bank_'||k AND a.entity_id=target_id AND a.action='banking.'||k||'.reassign')
  THEN RAISE EXCEPTION 'Bank reassignment requires global authority, eligible checker and exact audit' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION require_bank_governance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_kind text:=CASE TG_TABLE_NAME WHEN 'bank_payment' THEN 'payment' WHEN 'bank_receipt' THEN 'receipt' ELSE 'transfer' END;
BEGIN
 IF NEW.delegated_decision_id IS DISTINCT FROM OLD.delegated_decision_id AND NOT EXISTS(
  SELECT 1 FROM bank_delegated_decision e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.id=NEW.delegated_decision_id
   AND coalesce(e.payment_id,e.receipt_id,e.transfer_id)=NEW.id AND e.transaction_kind=expected_kind AND e.record_version=NEW.row_version)
 THEN RAISE EXCEPTION 'Matching immutable delegated decision evidence required' USING ERRCODE='23514'; END IF;
 IF NEW.approver_reassignment_id IS DISTINCT FROM OLD.approver_reassignment_id AND NOT EXISTS(
  SELECT 1 FROM bank_approver_reassignment e WHERE e.tenant_id=NEW.tenant_id AND e.company_id=NEW.company_id AND e.id=NEW.approver_reassignment_id
   AND coalesce(e.payment_id,e.receipt_id,e.transfer_id)=NEW.id AND e.transaction_kind=expected_kind AND e.record_version=NEW.row_version
   AND e.previous_user_id IS NOT DISTINCT FROM OLD.approver_user_id AND e.assigned_user_id=NEW.approver_user_id)
 THEN RAISE EXCEPTION 'Matching immutable reassignment history required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bank_transfer_governance_evidence AFTER UPDATE ON bank_transfer
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_bank_governance_evidence();

CREATE FUNCTION validate_bank_transfer_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target bank_transfer%ROWTYPE; expected_state text;
BEGIN
 SELECT * INTO target FROM bank_transfer WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.transfer_id FOR SHARE;
 expected_state:=CASE NEW.event_type WHEN 'draft_created' THEN 'draft' WHEN 'draft_updated' THEN 'draft' WHEN 'submitted' THEN 'submitted'
  WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' WHEN 'approver_reassigned' THEN 'submitted'
  WHEN 'posted' THEN 'posted' WHEN 'reversed' THEN 'reversed' END;
 IF target.id IS NULL OR target.state<>expected_state OR target.row_version<>NEW.record_version OR NOT EXISTS(
  SELECT 1 FROM platform_admin_audit_event audit WHERE audit.tenant_id=NEW.tenant_id AND audit.id=NEW.id
   AND audit.actor_id=NEW.actor_id AND audit.entity_type='bank_transfer' AND audit.entity_id=NEW.transfer_id
   AND audit.action='banking.transfer.'||CASE NEW.event_type WHEN 'draft_created' THEN 'create' WHEN 'draft_updated' THEN 'update'
    WHEN 'submitted' THEN 'submit' WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject'
    WHEN 'approver_reassigned' THEN 'reassign' WHEN 'posted' THEN 'post' WHEN 'reversed' THEN 'reverse' END) THEN
  RAISE EXCEPTION 'Transfer event requires matching state, version and audit evidence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_event_guard BEFORE INSERT ON bank_transfer_event FOR EACH ROW EXECUTE FUNCTION validate_bank_transfer_event();

DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['bank_transfer_fx_policy','bank_transfer_fx_policy_event','bank_transfer_sequence','bank_transfer','bank_transfer_line','bank_transfer_event'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=current_setting(''nexora.tenant_id'',true)) WITH CHECK(tenant_id=current_setting(''nexora.tenant_id'',true))',relation);
 END LOOP;
END $$;
CREATE TRIGGER bank_transfer_fx_policy_event_immutable BEFORE UPDATE OR DELETE ON bank_transfer_fx_policy_event
FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();
CREATE TRIGGER bank_transfer_event_immutable BEFORE UPDATE OR DELETE ON bank_transfer_event
FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_mutation();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',26,'bank_transfers_and_fx_policy');
