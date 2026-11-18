-- Current grants, actor identity and company ownership apply below the API too.
CREATE FUNCTION require_budget_document_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('nexora.user_id',true); permission text; alternate text;
BEGIN
 IF actor IS NULL OR NEW.updated_by IS DISTINCT FROM actor OR (TG_OP='INSERT' AND (NEW.created_by IS DISTINCT FROM actor OR NEW.version<>1)) THEN
  RAISE EXCEPTION 'Budget writes require their authenticated actor and initial version' USING ERRCODE='23514'; END IF;
 CASE TG_TABLE_NAME
 WHEN 'budget_plan' THEN
  permission:=CASE WHEN TG_OP='INSERT' THEN 'budget.plan.create' ELSE 'budget.plan.update' END;
  IF NOT EXISTS(SELECT 1 FROM fiscal_calendar WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.fiscal_calendar_id) THEN RAISE EXCEPTION 'Budget fiscal calendar must belong to its company' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.code,NEW.currency,NEW.fiscal_calendar_id,NEW.owner_id) IS DISTINCT FROM (OLD.code,OLD.currency,OLD.fiscal_calendar_id,OLD.owner_id) THEN RAISE EXCEPTION 'Budget plan identity is immutable' USING ERRCODE='23514'; END IF;
 WHEN 'budget_model' THEN permission:='budget.model.manage';
 WHEN 'budget_import' THEN permission:='budget.data.create';
 WHEN 'budget_version' THEN
  IF TG_OP='UPDATE' AND (NEW.plan_id,NEW.number,NEW.kind,NEW.parent_id) IS DISTINCT FROM (OLD.plan_id,OLD.number,OLD.kind,OLD.parent_id) THEN RAISE EXCEPTION 'Budget version lineage is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM budget_version WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND id=NEW.parent_id AND plan_id=NEW.plan_id) THEN RAISE EXCEPTION 'Budget parent must belong to the same plan' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   permission:='budget.plan.create';IF NEW.kind IN ('scenario','forecast') THEN alternate:='budget.forecast.create'; END IF;
  ELSIF OLD.state='submitted' THEN permission:='budget.plan.approve';
  ELSIF NEW.state='submitted' THEN permission:='budget.plan.submit';
  ELSE permission:='budget.plan.update';alternate:='budget.data.create'; END IF;
 WHEN 'budget_request' THEN
  IF TG_OP='INSERT' THEN permission:=CASE WHEN NEW.kind='transfer' THEN 'budget.transfer.create' ELSE 'budget.plan.submit' END;
  ELSE permission:=CASE NEW.kind WHEN 'transfer' THEN 'budget.transfer.approve' WHEN 'exception' THEN 'budget.exception.approve' ELSE 'budget.commitment.close' END; END IF;
 ELSE RAISE EXCEPTION 'Unsupported budget document';
 END CASE;
 IF NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,actor,permission) AND (alternate IS NULL OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,actor,alternate)) THEN
  RAISE EXCEPTION 'Current scoped Budget write authority is required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['budget_plan','budget_version','budget_model','budget_import','budget_request'] LOOP
  EXECUTE format('CREATE TRIGGER current_authority BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION require_budget_document_authority()',relation);
 END LOOP;
END $$;
CREATE FUNCTION require_budget_policy_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.created_by IS DISTINCT FROM current_setting('nexora.user_id',true)
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.created_by,'budget.policy.configure')
  OR NOT bank_has_live_permission(NEW.tenant_id,NEW.company_id,NEW.created_by,'budget.plan.activate')
  OR NOT EXISTS(SELECT 1 FROM budget_version v JOIN budget_plan p ON p.tenant_id=v.tenant_id AND p.company_id=v.company_id AND p.id=v.plan_id WHERE v.tenant_id=NEW.tenant_id AND v.company_id=NEW.company_id AND v.id=NEW.control_version_id AND v.state='approved' AND v.kind IN ('baseline','revision') AND p.fiscal_calendar_id=NEW.fiscal_calendar_id) THEN
  RAISE EXCEPTION 'Policy requires current activation authority and an approved company baseline' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_policy_authority BEFORE INSERT ON budget_policy FOR EACH ROW EXECUTE FUNCTION require_budget_policy_authority();
CREATE FUNCTION require_approved_budget_commitment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM procurement_document d WHERE d.tenant_id=NEW.tenant_id AND d.company_id=NEW.company_id AND d.id=NEW.source_document_id AND d.state='approved' AND d.row_version=NEW.source_version AND d.kind IN ('order','bill')
  AND (EXISTS(SELECT 1 FROM jsonb_array_elements(d.lines) l WHERE l->>'id'=NEW.source_line_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.additional_charges) l WHERE l->>'id'=NEW.source_line_id))) THEN
  RAISE EXCEPTION 'Commitments require an approved source version and stable line identity' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_commitment_source_authority AFTER INSERT ON budget_commitment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_approved_budget_commitment();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('budget',3,'budget_authority');
