INSERT INTO security_permission_definition(permission_key,module,resource,action,description,required_assurance,sensitivity)
 SELECT 'hr.'||key,'hr',split_part(key,'.',1),split_part(key,'.',2),'Governed HR reporting: '||key,'password','sensitive' FROM unnest(ARRAY['report_export.read','report_export.create','report_export.download','report_audit.read','report_export_policy.manage','report_export_policy.approve']) key ON CONFLICT DO NOTHING;
INSERT INTO security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
 SELECT p.tenant_id,p.id,d.permission_key,'all' FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d WHERE r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active' AND d.permission_key LIKE 'hr.report_%' ON CONFLICT DO NOTHING;
INSERT INTO security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
 SELECT p.tenant_id,p.id,d.permission_key,'tenant',p.tenant_id FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d WHERE r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active' AND d.permission_key LIKE 'hr.report_%' ON CONFLICT DO NOTHING;
UPDATE security_role_policy p SET permissions=coalesce((SELECT jsonb_agg(g.permission_key ORDER BY g.permission_key) FROM security_role_permission_grant g JOIN security_permission_definition d ON d.permission_key=g.permission_key AND d.status='active' WHERE g.tenant_id=p.tenant_id AND g.role_policy_id=p.id),'[]'::jsonb),row_version=p.row_version+1 FROM security_tenant_role r WHERE r.tenant_id=p.tenant_id AND r.role_id=p.role_id AND r.role_code='super_administrator' AND p.status='active' AND p.lifecycle_state='active';
CREATE TABLE hr_report_export_policy(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),state text NOT NULL DEFAULT 'submitted' CHECK(state IN('submitted','approved','rejected')),
 terms jsonb NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 1000),decided_by text,decided_at timestamptz,decision_reason text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),FOREIGN KEY(tenant_id,decided_by) REFERENCES security_user_account(tenant_id,id),
 CHECK((terms->>'max_rows')::int BETWEEN 1 AND 5000 AND(terms->>'expires_after_hours')::int BETWEEN 1 AND 168 AND jsonb_typeof(terms->'reports')='array')
);
CREATE UNIQUE INDEX hr_report_one_pending_policy ON hr_report_export_policy(tenant_id,company_id) WHERE state='submitted';
CREATE INDEX hr_report_current_policy ON hr_report_export_policy(tenant_id,company_id,state,decided_at DESC);
CREATE TABLE hr_report_export(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,report text NOT NULL CHECK(report IN('employee_directory','payroll_results')),from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date AND to_date-from_date<=366),policy_id text NOT NULL,
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 5000),source_hash text NOT NULL CHECK(source_hash~'^[0-9a-f]{64}$'),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 1000),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id,policy_id) REFERENCES hr_report_export_policy(tenant_id,company_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES security_user_account(tenant_id,id),CHECK(expires_at>created_at)
);
CREATE INDEX hr_report_exports_actor ON hr_report_export(tenant_id,company_id,created_by,created_at DESC,id);
CREATE TABLE hr_report_access_event(
 tenant_id text NOT NULL,company_id text NOT NULL,id text NOT NULL,kind text NOT NULL CHECK(kind IN('policy.created','policy.approved','policy.rejected','export.created','export.downloaded')),record_id text NOT NULL,actor_id text NOT NULL,reason text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization_unit(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id)
);
CREATE INDEX hr_report_audit_company ON hr_report_access_event(tenant_id,company_id,occurred_at DESC,id);
CREATE FUNCTION guard_hr_report_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Report policy history is immutable';END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'submitted' OR NEW.version<>1 OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL OR NEW.decision_reason<>'' THEN RAISE EXCEPTION 'Report policy starts with independent review pending';END IF;
 ELSE IF OLD.state<>'submitted' OR NEW.state NOT IN('approved','rejected') OR NEW.version<>OLD.version+1 OR NEW.decided_by IS NULL OR NEW.decided_by=NEW.created_by OR NEW.decided_at IS NULL OR length(btrim(NEW.decision_reason))<12 OR (to_jsonb(NEW)-ARRAY['version','state','decided_by','decided_at','decision_reason']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['version','state','decided_by','decided_at','decision_reason']) THEN RAISE EXCEPTION 'Report policy requires an independent versioned immutable review';END IF;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_report_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_report_export_policy FOR EACH ROW EXECUTE FUNCTION guard_hr_report_policy();
CREATE FUNCTION guard_hr_report_export() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p hr_report_export_policy%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Export receipts and audit history are immutable';END IF;
 IF TG_TABLE_NAME='hr_report_export' THEN
  SELECT * INTO p FROM hr_report_export_policy WHERE tenant_id=NEW.tenant_id AND company_id=NEW.company_id AND state='approved' ORDER BY decided_at DESC,id DESC LIMIT 1;
  IF p.id IS DISTINCT FROM NEW.policy_id OR NOT p.terms->'reports' ? NEW.report OR NEW.row_count>(p.terms->>'max_rows')::int OR NEW.expires_at>NEW.created_at+((p.terms->>'expires_after_hours')||' hours')::interval THEN RAISE EXCEPTION 'Export receipt must follow the current approved disclosure policy';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hr_report_export_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_report_export FOR EACH ROW EXECUTE FUNCTION guard_hr_report_export();
CREATE TRIGGER hr_report_event_guard BEFORE UPDATE OR DELETE ON hr_report_access_event FOR EACH ROW EXECUTE FUNCTION guard_hr_report_export();
ALTER TABLE hr_report_export_policy ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_report_export_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_report_policy_tenant ON hr_report_export_policy USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_report_export ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_report_export FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_report_export_tenant ON hr_report_export USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
ALTER TABLE hr_report_access_event ENABLE ROW LEVEL SECURITY;ALTER TABLE hr_report_access_event FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_report_event_tenant ON hr_report_access_event USING(tenant_id=current_setting('nexora.tenant_id',true)) WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',118,'governed_hr_reports');
