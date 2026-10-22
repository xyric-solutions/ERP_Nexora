CREATE FUNCTION validate_performance_contribution_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_goals jsonb;goal_count integer;rating_count integer;total_weight integer;
BEGIN
 IF NEW.state<>'submitted' THEN RETURN NEW;END IF;
 SELECT jsonb_agg(jsonb_build_object('id',g.id,'title',g.terms->>'title','weight_bps',(g.terms->>'weight_bps')::integer) ORDER BY g.id COLLATE "C"),count(*),sum((g.terms->>'weight_bps')::integer) INTO expected_goals,goal_count,total_weight FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.company_id=NEW.company_id AND g.parent_id=NEW.cycle_id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state='approved';
 SELECT count(DISTINCT r->>'goal_id') INTO rating_count FROM jsonb_array_elements(NEW.ratings) r;
 IF goal_count NOT BETWEEN 1 AND 50 OR total_weight IS DISTINCT FROM 10000 OR NEW.goals IS DISTINCT FROM expected_goals OR jsonb_array_length(NEW.ratings)<>goal_count OR rating_count<>goal_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.ratings) r WHERE jsonb_typeof(r->'rating') IS DISTINCT FROM 'number' OR (r->>'rating')::numeric NOT BETWEEN 1 AND 5 OR (r->>'rating')::numeric<>trunc((r->>'rating')::numeric) OR length(btrim(r->>'evidence')) NOT BETWEEN 5 AND 1000 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected_goals) g WHERE g->>'id'=r->>'goal_id')) OR EXISTS(SELECT 1 FROM hr_performance_record g WHERE g.tenant_id=NEW.tenant_id AND g.company_id=NEW.company_id AND g.parent_id=NEW.cycle_id AND g.employee_id=NEW.employee_id AND g.kind='goal' AND g.state NOT IN('approved','cancelled')) THEN RAISE EXCEPTION 'Appraisal evidence must match every approved weighted goal';END IF;
 IF NOT EXISTS(SELECT 1 FROM employee_user_binding b WHERE b.tenant_id=NEW.tenant_id AND b.employee_id=NEW.contributor_employee_id AND b.user_id=NEW.updated_by AND b.ended_at IS NULL AND b.effective_from<=current_date AND(b.effective_to IS NULL OR b.effective_to>=current_date)) THEN RAISE EXCEPTION 'The contributor binding is not effective today';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_contribution_source BEFORE INSERT OR UPDATE ON hr_performance_contribution FOR EACH ROW EXECUTE FUNCTION validate_performance_contribution_source();
CREATE FUNCTION guard_performance_cycle_participants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='cycle' AND NEW.state='closed' AND EXISTS(SELECT 1 FROM hr_performance_contribution p WHERE p.tenant_id=NEW.tenant_id AND p.company_id=NEW.company_id AND p.cycle_id=NEW.id AND p.state='invited') THEN RAISE EXCEPTION 'Outstanding appraisal invitations must be submitted or withdrawn before cycle close';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER performance_cycle_participants BEFORE INSERT OR UPDATE ON hr_performance_record FOR EACH ROW EXECUTE FUNCTION guard_performance_cycle_participants();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',82,'performance_participation_integrity');
