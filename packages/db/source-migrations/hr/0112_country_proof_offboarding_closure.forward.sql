CREATE FUNCTION normalized_hr_country_closure(t text,c text,r text,d date,proof jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF proof IS NULL OR NOT EXISTS(SELECT 1 FROM hr_lifecycle_case x JOIN hr_employment_relationship er ON er.tenant_id=x.tenant_id AND er.id=x.relationship_id JOIN hr_employment_event e ON e.tenant_id=x.tenant_id AND e.relationship_id=x.relationship_id AND e.source_reference='hr:lifecycle-case:'||x.id AND e.effective_on=d WHERE x.tenant_id=t AND x.company_id=c AND x.relationship_id=r AND x.kind IN('resignation','termination') AND x.state='closed' AND(x.terms->>'last_working_date')::date=d AND er.status='ended' AND er.effective_to=d) THEN RETURN proof;END IF;
 -- The resolver already requires the same placement to cover the historical exit date.
 -- Only the administrative end/status fields may differ after the authoritative exit event.
 RETURN (proof-'assignments')||jsonb_build_object('assignments',(SELECT coalesce(jsonb_agg(value-ARRAY['assignment_status','effective_to'] ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(proof->'assignments')));
END $$;
CREATE OR REPLACE FUNCTION check_hr_settlement_country_source(p_tenant text,p_company text,p_employee text,p_relationship text,p_date date,p_family text,p_rule text,p_snapshot jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE current_context jsonb;
BEGIN
 current_context:=read_hr_settlement_country_context(p_tenant,p_company,p_employee,p_relationship,p_date,p_family,p_rule);
 IF normalized_hr_country_closure(p_tenant,p_company,p_relationship,p_date,current_context) IS DISTINCT FROM normalized_hr_country_closure(p_tenant,p_company,p_relationship,p_date,p_snapshot->'country_scope') OR coalesce(jsonb_array_length(current_context->'blockers'),0)>0 THEN RAISE EXCEPTION 'Country applicability changed or does not match the approved historical source';END IF;
END $$;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',112,'country_proof_offboarding_closure');
