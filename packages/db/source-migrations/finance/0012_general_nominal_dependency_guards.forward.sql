-- Preserve the header/currency authority of existing ordinary nominals.
CREATE FUNCTION guard_general_nominal_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='currency' THEN
  IF NEW.status<>'active' AND EXISTS(SELECT 1 FROM finance_general_nominal g
    WHERE g.tenant_id=OLD.tenant_id AND g.currency=OLD.code AND g.state IN ('draft','pending_approval','active')) THEN
   RAISE EXCEPTION 'Currency is required by governed ordinary nominals' USING ERRCODE='23514';
  END IF;
 ELSE
  IF OLD.is_header AND (NEW.status,NEW.parent_id,NEW.type,NEW.is_header)
    IS DISTINCT FROM (OLD.status,OLD.parent_id,OLD.type,OLD.is_header)
    AND EXISTS(SELECT 1 FROM account leaf JOIN account section
      ON section.tenant_id=leaf.tenant_id AND section.company_id=leaf.company_id AND section.id=leaf.parent_id
      WHERE leaf.tenant_id=OLD.tenant_id AND leaf.company_id=OLD.company_id AND leaf.managed_general_nominal
      AND (section.id=OLD.id OR section.parent_id=OLD.id)) THEN
   RAISE EXCEPTION 'Header authority is required by governed ordinary nominals' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER general_nominal_currency_dependency BEFORE UPDATE OF status ON currency
 FOR EACH ROW EXECUTE FUNCTION guard_general_nominal_dependencies();
CREATE TRIGGER general_nominal_header_dependency BEFORE UPDATE ON account
 FOR EACH ROW EXECUTE FUNCTION guard_general_nominal_dependencies();

CREATE FUNCTION guard_exclusive_nominal_section_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM finance_general_nominal_policy p WHERE p.tenant_id=NEW.tenant_id
   AND p.company_id=NEW.company_id AND p.section_id=NEW.section_id) THEN
  RAISE EXCEPTION 'An ordinary nominal Section cannot become a Bank Section' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_section_general_nominal_exclusion BEFORE INSERT ON finance_nominal_section_policy
 FOR EACH ROW EXECUTE FUNCTION guard_exclusive_nominal_section_role();

INSERT INTO nexora_schema_migration(module_name,version,name)
VALUES('finance',12,'general_nominal_dependency_guards');
