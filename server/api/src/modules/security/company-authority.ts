// Current company access plus the latest active, scoped role-policy assignment.
export const companyAuthoritySql = `select distinct company.id,company.code,company.name
 from security_user_account u
 join security_user_company_access c on c.tenant_id=u.tenant_id and c.user_id=u.id and c.revoked_at is null
 join organization_unit company on company.tenant_id=c.tenant_id and company.id=c.company_id and company.type='company' and company.status='active'
 join security_user_role_assignment_version a on a.tenant_id=u.tenant_id and a.user_id=u.id
 join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active'
 join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active'
 join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$4
 join security_permission_definition d on d.permission_key=g.permission_key and d.status='active'
 join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
 where u.tenant_id=$1 and u.id=$2 and u.status='active' and u.archived_at is null and ($3::text is null or company.id=$3)
 and a.lifecycle_state='active' and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())
 and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
 and ((s.scope_kind='tenant' and s.scope_value=$1) or (s.scope_kind='company' and s.scope_value=company.id))`;
