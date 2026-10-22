CREATE FUNCTION validate_performance_review_contributions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected jsonb;
BEGIN
 IF NEW.kind='review' AND NEW.state IN('submitted','published') THEN
  SELECT jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'kind',p.kind,'contributor_employee_id',p.contributor_employee_id,'summary',p.summary,'goals_hash',p.goals_hash,'ratings',p.ratings) ORDER BY p.id COLLATE "C") INTO expected FROM hr_performance_contribution p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.cycle_id=NEW.parent_id AND p.employee_id=NEW.employee_id AND p.state='submitted';
  IF expected IS NOT NULL AND NEW.evidence->'contributions' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Resave the manager review against submitted employee and peer evidence';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_review_contribution_seal BEFORE INSERT OR UPDATE ON hr_performance_record FOR EACH ROW EXECUTE FUNCTION validate_performance_review_contributions();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',83,'performance_review_contribution_seal');
