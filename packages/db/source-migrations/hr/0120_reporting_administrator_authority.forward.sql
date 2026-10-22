-- Migration-owner discovery only. The migration transaction's DDL lock prevents
-- concurrent access while FORCE is temporarily relaxed on the tenant registry.
-- All authorization writes still run through their forced tenant policies.
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE t text; previous_scope text:=current_setting('nexora.tenant_id',true);
BEGIN
 FOR t IN SELECT id FROM tenant ORDER BY id LOOP
  PERFORM set_config('nexora.tenant_id',t,true);
  INSERT INTO security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
   SELECT p.tenant_id,p.id,d.permission_key,'all' FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d
   WHERE p.tenant_id=t AND r.role_code='super_administrator' AND r.lifecycle_state='active' AND p.status='active' AND p.lifecycle_state='active' AND d.status='active' AND d.permission_key=ANY(ARRAY['hr.report_export.read','hr.report_export.create','hr.report_export.download','hr.report_audit.read','hr.report_export_policy.manage','hr.report_export_policy.approve']) ON CONFLICT DO NOTHING;
  INSERT INTO security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
   SELECT p.tenant_id,p.id,d.permission_key,'tenant',p.tenant_id FROM security_role_policy p JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id CROSS JOIN security_permission_definition d
   WHERE p.tenant_id=t AND r.role_code='super_administrator' AND r.lifecycle_state='active' AND p.status='active' AND p.lifecycle_state='active' AND d.status='active' AND d.permission_key=ANY(ARRAY['hr.report_export.read','hr.report_export.create','hr.report_export.download','hr.report_audit.read','hr.report_export_policy.manage','hr.report_export_policy.approve']) ON CONFLICT DO NOTHING;
  UPDATE security_role_policy p SET permissions=coalesce((SELECT jsonb_agg(g.permission_key ORDER BY g.permission_key) FROM security_role_permission_grant g JOIN security_permission_definition d ON d.permission_key=g.permission_key AND d.status='active' WHERE g.tenant_id=p.tenant_id AND g.role_policy_id=p.id),'[]'::jsonb),row_version=p.row_version+1
   FROM security_tenant_role r WHERE p.tenant_id=t AND r.tenant_id=p.tenant_id AND r.role_id=p.role_id AND r.role_code='super_administrator' AND r.lifecycle_state='active' AND p.status='active' AND p.lifecycle_state='active';
 END LOOP;
 PERFORM set_config('nexora.tenant_id',coalesce(previous_scope,''),true);
END $$;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('hr',120,'reporting_administrator_authority');
