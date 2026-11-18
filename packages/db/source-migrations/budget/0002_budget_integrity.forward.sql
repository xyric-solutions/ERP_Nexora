-- Fail closed under direct SQL as well as the API. Legacy unmanaged rows remain intact.
CREATE POLICY managed_budget_company_scope ON budget AS RESTRICTIVE
 USING(managed_line_id IS NULL OR EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=budget.tenant_id AND a.company_id=budget.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL))
 WITH CHECK(managed_line_id IS NULL OR EXISTS(SELECT 1 FROM security_user_company_access a WHERE a.tenant_id=budget.tenant_id AND a.company_id=budget.company_id AND a.user_id=current_setting('nexora.user_id',true) AND a.revoked_at IS NULL));

CREATE OR REPLACE FUNCTION guard_budget_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text; scope_tenant text; scope_company text; scope_version text;
BEGIN
 IF TG_OP='INSERT' THEN scope_tenant:=NEW.tenant_id;scope_company:=NEW.company_id;scope_version:=NEW.version_id;
 ELSE scope_tenant:=OLD.tenant_id;scope_company:=OLD.company_id;scope_version:=OLD.version_id; END IF;
 SELECT v.state INTO parent_state FROM budget_version v WHERE v.tenant_id=scope_tenant AND v.company_id=scope_company AND v.id=scope_version;
 IF parent_state IS NULL OR parent_state NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Only draft budget lines can change' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.company_id,NEW.id,NEW.version_id) IS DISTINCT FROM (OLD.tenant_id,OLD.company_id,OLD.id,OLD.version_id) THEN
  RAISE EXCEPTION 'Budget line ownership is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM account WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.account_id AND status='active' AND NOT is_header AND NOT reconciliation_required) THEN
  RAISE EXCEPTION 'Budget requires active company posting accounts' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER budget_line_immutable ON budget_line;
CREATE TRIGGER budget_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON budget_line FOR EACH ROW EXECUTE FUNCTION guard_budget_line();

CREATE FUNCTION require_budget_content_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant_scope text;company_scope text;version_scope text;line_scope text;
BEGIN
 IF TG_TABLE_NAME='budget_line' THEN
  IF TG_OP='DELETE' THEN tenant_scope:=OLD.tenant_id;company_scope:=OLD.company_id;version_scope:=OLD.version_id;
  ELSE tenant_scope:=NEW.tenant_id;company_scope:=NEW.company_id;version_scope:=NEW.version_id; END IF;
 ELSE
  IF TG_OP='DELETE' THEN tenant_scope:=OLD.tenant_id;company_scope:=OLD.company_id;line_scope:=OLD.managed_line_id;
  ELSE tenant_scope:=NEW.tenant_id;company_scope:=NEW.company_id;line_scope:=NEW.managed_line_id; END IF;
  IF line_scope IS NULL THEN RETURN NULL; END IF;
  SELECT version_id INTO version_scope FROM budget_line WHERE tenant_id=tenant_scope AND company_id=company_scope AND id=line_scope;
  -- Deleted allocations may belong to a deleted draft line. Its line trigger checks the owning version.
  IF version_scope IS NULL AND TG_OP='DELETE' THEN RETURN NULL; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM budget_version v JOIN budget_audit a ON a.tenant_id=v.tenant_id AND a.company_id=v.company_id AND a.entity='budget_version' AND a.entity_id=v.id AND a.record_version=v.version
  WHERE v.tenant_id=tenant_scope AND v.company_id=company_scope AND v.id=version_scope AND a.occurred_at>=transaction_timestamp()) THEN
  RAISE EXCEPTION 'Budget content requires a versioned audit in the same transaction' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_line_content_evidence AFTER INSERT OR UPDATE OR DELETE ON budget_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_budget_content_evidence();
CREATE CONSTRAINT TRIGGER budget_allocation_content_evidence AFTER INSERT OR UPDATE OR DELETE ON budget DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_budget_content_evidence();

CREATE FUNCTION check_budget_transfer_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request budget_request;amount_total numeric;row_count integer;line_version text;
BEGIN
 SELECT * INTO request FROM budget_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.request_id;
 SELECT sum(amount),count(*) INTO amount_total,row_count FROM budget_transfer_effect WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND request_id=NEW.request_id;
 SELECT version_id INTO line_version FROM budget_line WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.line_id;
 IF request.state<>'approved' OR request.kind<>'transfer' OR row_count<>2 OR amount_total<>0 OR line_version IS DISTINCT FROM request.payload->>'version_id'
  OR NOT ((NEW.line_id=request.payload->>'from_line_id' AND NEW.period_id=request.payload->>'from_period_id' AND NEW.amount=-(request.payload->>'amount')::numeric)
   OR (NEW.line_id=request.payload->>'to_line_id' AND NEW.period_id=request.payload->>'to_period_id' AND NEW.amount=(request.payload->>'amount')::numeric)) THEN
  RAISE EXCEPTION 'Budget transfers require an approved, balanced pair of effects' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_transfer_balance AFTER INSERT ON budget_transfer_effect DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_budget_transfer_balance();

CREATE FUNCTION check_budget_commitment_effect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_total numeric;native_total numeric;reservation budget_commitment;
BEGIN
 SELECT * INTO reservation FROM budget_commitment WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.commitment_id;
 SELECT coalesce(sum(base_delta),0),coalesce(sum(native_delta),0) INTO base_total,native_total FROM budget_commitment_event WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND commitment_id=NEW.commitment_id;
 IF base_total<0 OR base_total>reservation.reserved_base OR native_total<0 OR native_total>reservation.reserved_native THEN
  RAISE EXCEPTION 'Commitment consumption exceeds its reserved balance' USING ERRCODE='23514'; END IF;
 IF NEW.journal_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM journal_entry WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.journal_id AND status IN ('posted','reversed') AND posting_date=NEW.event_date) THEN
  RAISE EXCEPTION 'Commitment recognition requires its atomic posted journal' USING ERRCODE='23514'; END IF;
 IF NEW.kind='close' AND NOT EXISTS(SELECT 1 FROM budget_request WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.request_id AND state='approved' AND kind='closure' AND payload->>'commitment_id'=NEW.commitment_id) THEN
  RAISE EXCEPTION 'Commitment closure requires independent approval' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_commitment_effect_guard AFTER INSERT ON budget_commitment_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_budget_commitment_effect();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('budget',2,'budget_integrity');
