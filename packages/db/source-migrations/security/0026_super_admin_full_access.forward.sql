-- Super Admin always holds every active permission (decision 16 Nov 2026).
-- Until now each module migration had to grant its own new keys to the super_administrator role
-- (see HR0078/0118/0120/0121); modules that did not (finance subledger and tax, manufacturing,
-- fleet) left Super Admins locked out. This keeps every active super_administrator role policy in
-- step with the permission catalogue automatically: grants, tenant-wide scope and the policy's own
-- `permissions` list (which sign-in reads), for existing keys now and for every key added later.
CREATE FUNCTION sync_super_administrator_permissions() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 t text;
 previous_scope text:=current_setting('nexora.tenant_id',true);
 tenant_forced boolean;
BEGIN
 -- Tenant discovery needs to see every tenant. Relax FORCE only if it is on, and put it back as found,
 -- so a calling migration that relaxed it itself is not disturbed. All writes below still run under
 -- their forced tenant policies, one tenant at a time.
 SELECT c.relforcerowsecurity INTO tenant_forced FROM pg_class c WHERE c.oid='public.tenant'::regclass;
 IF tenant_forced THEN EXECUTE 'ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY'; END IF;
 FOR t IN SELECT id FROM tenant ORDER BY id LOOP
  PERFORM set_config('nexora.tenant_id',t,true);
  INSERT INTO security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
   SELECT p.tenant_id,p.id,d.permission_key,'all'
     FROM security_role_policy p
     JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id
     CROSS JOIN security_permission_definition d
    WHERE p.tenant_id=t AND r.role_code='super_administrator' AND r.lifecycle_state='active'
      AND p.status='active' AND p.lifecycle_state='active' AND d.status='active'
   ON CONFLICT DO NOTHING;
  INSERT INTO security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
   SELECT p.tenant_id,p.id,d.permission_key,'tenant',p.tenant_id
     FROM security_role_policy p
     JOIN security_tenant_role r ON r.tenant_id=p.tenant_id AND r.role_id=p.role_id
     CROSS JOIN security_permission_definition d
    WHERE p.tenant_id=t AND r.role_code='super_administrator' AND r.lifecycle_state='active'
      AND p.status='active' AND p.lifecycle_state='active' AND d.status='active'
   ON CONFLICT DO NOTHING;
  -- Rebuild the policy's own list from its grants, only where it actually changed.
  UPDATE security_role_policy p
     SET permissions=x.keys,row_version=p.row_version+1
    FROM (SELECT sp.tenant_id,sp.id,
                 coalesce((SELECT jsonb_agg(g.permission_key ORDER BY g.permission_key)
                             FROM security_role_permission_grant g
                             JOIN security_permission_definition d ON d.permission_key=g.permission_key AND d.status='active'
                            WHERE g.tenant_id=sp.tenant_id AND g.role_policy_id=sp.id),'[]'::jsonb) AS keys
            FROM security_role_policy sp
            JOIN security_tenant_role r ON r.tenant_id=sp.tenant_id AND r.role_id=sp.role_id
           WHERE sp.tenant_id=t AND r.role_code='super_administrator' AND r.lifecycle_state='active'
             AND sp.status='active' AND sp.lifecycle_state='active') x
   WHERE p.tenant_id=x.tenant_id AND p.id=x.id AND p.permissions IS DISTINCT FROM x.keys;
 END LOOP;
 PERFORM set_config('nexora.tenant_id',coalesce(previous_scope,''),true);
 IF tenant_forced THEN EXECUTE 'ALTER TABLE tenant FORCE ROW LEVEL SECURITY'; END IF;
END $$;

-- Any later migration that adds or reactivates a permission grants it to every Super Admin in the same transaction.
CREATE FUNCTION sync_super_administrator_permissions_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM sync_super_administrator_permissions();
 RETURN NULL;
END $$;
CREATE TRIGGER super_administrator_full_access
 AFTER INSERT OR UPDATE OF status ON security_permission_definition
 FOR EACH STATEMENT EXECUTE FUNCTION sync_super_administrator_permissions_trigger();

-- Backfill the keys Super Admins are missing today.
SELECT sync_super_administrator_permissions();
INSERT INTO nexora_schema_migration(module_name,version,name) VALUES('security',26,'super_admin_full_access');
