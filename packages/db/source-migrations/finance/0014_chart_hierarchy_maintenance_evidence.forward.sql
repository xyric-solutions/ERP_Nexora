-- Evidence only. No company data is migrated by schema installation.
CREATE TABLE finance_chart_hierarchy_maintenance (
 tenant_id text NOT NULL, company_id text NOT NULL, id text NOT NULL,
 template_id text NOT NULL, section_id text NOT NULL, actor_id text NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 before_state jsonb NOT NULL, after_state jsonb NOT NULL,
 dependency_sha256 text NOT NULL CHECK(dependency_sha256 ~ '^[a-f0-9]{64}$'),
 database_operator text NOT NULL DEFAULT session_user,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,template_id,section_id),
 FOREIGN KEY(tenant_id,company_id,section_id) REFERENCES account(tenant_id,company_id,id),
 FOREIGN KEY(tenant_id,template_id) REFERENCES finance_chart_template(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES security_user_account(tenant_id,id),
 CHECK(jsonb_typeof(before_state)='object' AND jsonb_typeof(after_state)='object')
);
ALTER TABLE finance_chart_hierarchy_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_chart_hierarchy_maintenance FORCE ROW LEVEL SECURITY;
CREATE POLICY chart_hierarchy_maintenance_tenant ON finance_chart_hierarchy_maintenance
 USING(tenant_id=current_setting('nexora.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('nexora.tenant_id',true));
REVOKE ALL ON finance_chart_hierarchy_maintenance FROM PUBLIC;
CREATE TRIGGER chart_hierarchy_maintenance_immutable
 BEFORE UPDATE OR DELETE ON finance_chart_hierarchy_maintenance
 FOR EACH ROW EXECUTE FUNCTION protect_bank_account_event();
INSERT INTO nexora_schema_migration(module_name,version,name)
 VALUES('finance',14,'chart_hierarchy_maintenance_evidence');
