create table security_scope (
  id uuid primary key,
  scope_type text not null check (scope_type in ('enterprise', 'company', 'branch', 'organization_unit')),
  code text not null check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  normalized_display_name text generated always as (lower(btrim(display_name))) stored,
  parent_id uuid references security_scope(id) on delete restrict,
  enterprise_scope_id uuid not null references security_scope(id) on delete restrict,
  company_scope_id uuid references security_scope(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint security_scope_lifecycle_ck check (
    (status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null)
  ),
  constraint security_scope_shape_ck check (
    (scope_type = 'enterprise' and parent_id is null and enterprise_scope_id = id and company_scope_id is null) or
    (scope_type = 'company' and parent_id is not null and company_scope_id = id) or
    (scope_type in ('branch', 'organization_unit') and parent_id is not null and company_scope_id is not null)
  )
);

create unique index security_scope_enterprise_singleton_uq on security_scope ((scope_type))
  where scope_type = 'enterprise';
create unique index security_scope_code_boundary_uq on security_scope (
  (case when scope_type in ('enterprise', 'company') then enterprise_scope_id else company_scope_id end), code
);
create unique index security_scope_name_boundary_uq on security_scope (
  (case when scope_type in ('enterprise', 'company') then enterprise_scope_id else company_scope_id end), normalized_display_name
);
create index security_scope_parent_idx on security_scope (parent_id);
create index security_scope_company_status_idx on security_scope (company_scope_id, status);

create table security_permission (
  id uuid primary key,
  permission_key text not null check (
    permission_key = lower(btrim(permission_key)) and
    permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2}$'
  ),
  module text not null check (module = lower(btrim(module)) and module ~ '^[a-z][a-z0-9_]*$'),
  resource text not null check (resource = lower(btrim(resource)) and resource ~ '^[a-z][a-z0-9_]*$'),
  action text not null check (action = lower(btrim(action)) and action ~ '^[a-z][a-z0-9_]*$'),
  description text not null check (length(btrim(description)) between 1 and 500),
  required_assurance text not null check (required_assurance in ('password', 'mfa')),
  field_bearing boolean not null,
  state_context_required boolean not null,
  sensitivity text not null check (sensitivity in ('standard', 'sensitive', 'restricted')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  constraint security_permission_key_parts_ck check (permission_key = module || '.' || resource || '.' || action)
);

create unique index security_permission_key_uq on security_permission (permission_key);
create index security_permission_resource_idx on security_permission (module, resource, action);

create table security_permission_state (
  permission_id uuid not null references security_permission(id) on delete restrict,
  source_state text not null check (source_state = lower(btrim(source_state)) and source_state ~ '^[a-z][a-z0-9_]*$'),
  primary key (permission_id, source_state)
);

create table security_permission_field (
  permission_id uuid not null references security_permission(id) on delete restrict,
  field_path text not null check (field_path ~ '^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$'),
  primary key (permission_id, field_path)
);

create table security_role (
  id uuid primary key,
  code text not null check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  description text not null default '' check (length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint security_role_lifecycle_ck check (
    (status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null)
  )
);

create unique index security_role_code_uq on security_role (code);
create index security_role_status_idx on security_role (status);

create table security_role_permission (
  role_id uuid not null references security_role(id) on delete restrict,
  permission_id uuid not null references security_permission(id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by_user_id uuid references app_user(id) on delete restrict,
  primary key (role_id, permission_id)
);

create table security_field_grant (
  role_id uuid not null,
  permission_id uuid not null,
  field_path text not null,
  granted_at timestamptz not null default now(),
  granted_by_user_id uuid references app_user(id) on delete restrict,
  primary key (role_id, permission_id, field_path),
  foreign key (role_id, permission_id)
    references security_role_permission(role_id, permission_id) on delete restrict,
  foreign key (permission_id, field_path)
    references security_permission_field(permission_id, field_path) on delete restrict
);

create table security_role_assignment (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete restrict,
  role_id uuid not null references security_role(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  assigned_by_user_id uuid not null references app_user(id) on delete restrict,
  revoked_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_role_assignment_range_ck check (valid_until is null or valid_until > valid_from),
  constraint security_role_assignment_lifecycle_ck check (
    (status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null)
  )
);

create index security_role_assignment_user_time_idx on security_role_assignment (user_id, valid_from, valid_until);
create index security_role_assignment_role_status_idx on security_role_assignment (role_id, status);

create table security_assignment_scope (
  assignment_id uuid not null references security_role_assignment(id) on delete restrict,
  scope_id uuid not null references security_scope(id) on delete restrict,
  include_descendants boolean not null default false,
  primary key (assignment_id, scope_id)
);

create index security_assignment_scope_scope_idx on security_assignment_scope (scope_id, assignment_id);

create table security_sod_policy (
  id uuid primary key,
  code text not null check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  policy_kind text not null check (policy_kind in ('assignment_conflict', 'transaction_conflict')),
  first_role_id uuid references security_role(id) on delete restrict,
  second_role_id uuid references security_role(id) on delete restrict,
  protected_permission_id uuid references security_permission(id) on delete restrict,
  actor_relation text check (actor_relation is null or actor_relation ~ '^[a-z][a-z0-9_]*$'),
  applicable_source_states text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint security_sod_policy_shape_ck check (
    (policy_kind = 'assignment_conflict' and first_role_id is not null and second_role_id is not null and
      first_role_id <> second_role_id and protected_permission_id is null and actor_relation is null and
      cardinality(applicable_source_states) = 0) or
    (policy_kind = 'transaction_conflict' and first_role_id is null and second_role_id is null and
      protected_permission_id is not null and actor_relation is not null)
  ),
  constraint security_sod_policy_lifecycle_ck check (
    (status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null)
  )
);

create unique index security_sod_policy_code_uq on security_sod_policy (code);
create unique index security_sod_role_pair_uq on security_sod_policy (
  least(first_role_id, second_role_id), greatest(first_role_id, second_role_id)
) where policy_kind = 'assignment_conflict' and status = 'active';
create unique index security_sod_transaction_uq on security_sod_policy (protected_permission_id, actor_relation)
  where policy_kind = 'transaction_conflict' and status = 'active';

create table security_policy_event (
  id uuid primary key,
  event_type text not null check (event_type = lower(btrim(event_type)) and event_type ~ '^[a-z][a-z0-9_.]*$'),
  actor_user_id uuid not null references app_user(id) on delete restrict,
  session_id uuid references user_session(id) on delete restrict,
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  entity_id uuid not null,
  occurred_at timestamptz not null,
  before_summary jsonb,
  after_summary jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint security_policy_event_before_object_ck check (
    before_summary is null or jsonb_typeof(before_summary) = 'object'
  ),
  constraint security_policy_event_after_object_ck check (
    after_summary is null or jsonb_typeof(after_summary) = 'object'
  ),
  constraint security_policy_event_metadata_object_ck check (jsonb_typeof(metadata) = 'object')
);

create index security_policy_event_entity_time_idx on security_policy_event (entity_type, entity_id, occurred_at desc);
create index security_policy_event_actor_time_idx on security_policy_event (actor_user_id, occurred_at desc);

create table security_policy_command (
  id uuid primary key,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  operation text not null check (operation ~ '^[a-z][a-z0-9_.]*$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  event_id uuid not null unique references security_policy_event(id) on delete restrict,
  created_at timestamptz not null
);

create index security_policy_command_actor_time_idx on security_policy_command (actor_user_id, created_at desc);

create or replace function lock_security_policy_mutation() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4894133722);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function validate_security_scope() returns trigger
language plpgsql as $$
declare
  parent_scope security_scope%rowtype;
begin
  perform pg_advisory_xact_lock(4894133722);
  if new.scope_type = 'enterprise' then
    new.parent_id := null;
    new.enterprise_scope_id := new.id;
    new.company_scope_id := null;
  else
    if new.parent_id is null then raise exception 'SECURITY_SCOPE_PARENT_REQUIRED'; end if;
    select * into parent_scope from security_scope where id = new.parent_id for share;
    if not found or parent_scope.status <> 'active' then raise exception 'SECURITY_SCOPE_PARENT_INVALID'; end if;
    if new.scope_type = 'company' then
      if parent_scope.scope_type <> 'enterprise' then raise exception 'SECURITY_SCOPE_PARENT_INVALID'; end if;
      new.enterprise_scope_id := parent_scope.id;
      new.company_scope_id := new.id;
    elsif new.scope_type = 'branch' then
      if parent_scope.scope_type <> 'company' then raise exception 'SECURITY_SCOPE_PARENT_INVALID'; end if;
      new.enterprise_scope_id := parent_scope.enterprise_scope_id;
      new.company_scope_id := parent_scope.id;
    else
      if parent_scope.scope_type not in ('company', 'branch', 'organization_unit') then
        raise exception 'SECURITY_SCOPE_PARENT_INVALID';
      end if;
      new.enterprise_scope_id := parent_scope.enterprise_scope_id;
      new.company_scope_id := case when parent_scope.scope_type = 'company' then parent_scope.id else parent_scope.company_scope_id end;
    end if;
    if new.id = new.parent_id or exists (
      with recursive ancestors as (
        select id, parent_id from security_scope where id = new.parent_id
        union all
        select s.id, s.parent_id from security_scope s join ancestors a on s.id = a.parent_id
      )
      select 1 from ancestors where id = new.id
    ) then raise exception 'SECURITY_SCOPE_CYCLE'; end if;
  end if;
  if new.status = 'archived' and exists (
    select 1 from security_scope child where child.parent_id = new.id and child.status = 'active'
  ) then raise exception 'SECURITY_SCOPE_ACTIVE_CHILD'; end if;
  return new;
end;
$$;

create trigger security_scope_validate_trg before insert or update on security_scope
for each row execute function validate_security_scope();

create or replace function validate_security_assignment_overlap() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4894133722);
  if new.status = 'active' and exists (
    select 1 from security_role_assignment existing
    where existing.user_id = new.user_id and existing.role_id = new.role_id
      and existing.status = 'active' and existing.id <> new.id
      and tstzrange(existing.valid_from, coalesce(existing.valid_until, 'infinity'::timestamptz), '[)') &&
          tstzrange(new.valid_from, coalesce(new.valid_until, 'infinity'::timestamptz), '[)')
  ) then raise exception 'SECURITY_ASSIGNMENT_OVERLAP'; end if;
  return new;
end;
$$;

create trigger security_role_assignment_overlap_trg before insert or update on security_role_assignment
for each row execute function validate_security_assignment_overlap();

create or replace function security_scope_covers(
  granted_scope_id uuid,
  include_descendants boolean,
  target_scope_id uuid
) returns boolean
language sql stable as $$
  with recursive active_ancestors as (
    select id, parent_id
    from security_scope
    where id = target_scope_id and status = 'active'
    union all
    select parent.id, parent.parent_id
    from security_scope parent
    join active_ancestors child on child.parent_id = parent.id
    where parent.status = 'active'
  )
  select exists (
    select 1
    from active_ancestors
    where id = granted_scope_id
      and (granted_scope_id = target_scope_id or include_descendants)
  );
$$;

create or replace function assert_no_security_assignment_sod_conflict() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4894133722);
  if exists (
    select 1
    from security_sod_policy policy
    join security_role_assignment first_assignment
      on first_assignment.role_id in (policy.first_role_id, policy.second_role_id)
    join security_role_assignment second_assignment
      on second_assignment.user_id = first_assignment.user_id
     and second_assignment.id > first_assignment.id
     and second_assignment.role_id in (policy.first_role_id, policy.second_role_id)
     and second_assignment.role_id <> first_assignment.role_id
    join security_assignment_scope first_scope on first_scope.assignment_id = first_assignment.id
    join security_assignment_scope second_scope on second_scope.assignment_id = second_assignment.id
    where policy.policy_kind = 'assignment_conflict'
      and policy.status = 'active'
      and first_assignment.status = 'active'
      and second_assignment.status = 'active'
      and tstzrange(
        first_assignment.valid_from,
        coalesce(first_assignment.valid_until, 'infinity'::timestamptz),
        '[)'
      ) && tstzrange(
        second_assignment.valid_from,
        coalesce(second_assignment.valid_until, 'infinity'::timestamptz),
        '[)'
      )
      and (
        security_scope_covers(
          first_scope.scope_id,
          first_scope.include_descendants,
          second_scope.scope_id
        ) or security_scope_covers(
          second_scope.scope_id,
          second_scope.include_descendants,
          first_scope.scope_id
        )
      )
  ) then
    raise exception 'SECURITY_ASSIGNMENT_SOD_CONFLICT';
  end if;
  return null;
end;
$$;

create or replace function reject_security_evidence_change() returns trigger
language plpgsql as $$
begin
  raise exception 'SECURITY_EVIDENCE_IMMUTABLE';
end;
$$;

create trigger security_policy_event_immutable_trg before update or delete on security_policy_event
for each row execute function reject_security_evidence_change();
create trigger security_policy_command_immutable_trg before update or delete on security_policy_command
for each row execute function reject_security_evidence_change();

create trigger security_permission_lock_trg before insert or update or delete on security_permission
for each row execute function lock_security_policy_mutation();
create trigger security_permission_state_lock_trg before insert or update or delete on security_permission_state
for each row execute function lock_security_policy_mutation();
create trigger security_permission_field_lock_trg before insert or update or delete on security_permission_field
for each row execute function lock_security_policy_mutation();
create trigger security_role_lock_trg before insert or update or delete on security_role
for each row execute function lock_security_policy_mutation();
create trigger security_role_permission_lock_trg before insert or update or delete on security_role_permission
for each row execute function lock_security_policy_mutation();
create trigger security_field_grant_lock_trg before insert or update or delete on security_field_grant
for each row execute function lock_security_policy_mutation();
create trigger security_assignment_scope_lock_trg before insert or update or delete on security_assignment_scope
for each row execute function lock_security_policy_mutation();
create trigger security_sod_policy_lock_trg before insert or update or delete on security_sod_policy
for each row execute function lock_security_policy_mutation();
create trigger app_user_policy_lock_trg before update of status on app_user
for each row execute function lock_security_policy_mutation();

insert into security_scope
  (id, scope_type, code, display_name, parent_id, enterprise_scope_id, company_scope_id, status)
values
  ('50000000-0000-4000-8000-000000000001', 'enterprise', 'enterprise', 'Enterprise', null,
   '50000000-0000-4000-8000-000000000001', null, 'active');

insert into security_permission
  (id, permission_key, module, resource, action, description, required_assurance,
   field_bearing, state_context_required, sensitivity)
values
  ('51000000-0000-4000-8000-000000000001', 'security.access.administer', 'security', 'access', 'administer', 'Preserve recoverable security administration', 'mfa', false, false, 'restricted'),
  ('51000000-0000-4000-8000-000000000002', 'security.scope.read', 'security', 'scope', 'read', 'Read authorization scopes', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000003', 'security.scope.create', 'security', 'scope', 'create', 'Create authorization scopes', 'mfa', true, false, 'restricted'),
  ('51000000-0000-4000-8000-000000000004', 'security.scope.edit', 'security', 'scope', 'edit', 'Edit active authorization scopes', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000005', 'security.scope.archive', 'security', 'scope', 'archive', 'Archive authorization scopes', 'mfa', false, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000006', 'security.role.read', 'security', 'role', 'read', 'Read dynamic roles', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000007', 'security.role.create', 'security', 'role', 'create', 'Create dynamic roles', 'mfa', true, false, 'restricted'),
  ('51000000-0000-4000-8000-000000000008', 'security.role.edit', 'security', 'role', 'edit', 'Edit active dynamic roles', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000009', 'security.role.archive', 'security', 'role', 'archive', 'Archive dynamic roles', 'mfa', false, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000010', 'security.permission.read', 'security', 'permission', 'read', 'Read the permission catalogue', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000011', 'security.role_permission.read', 'security', 'role_permission', 'read', 'Read role permission grants', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000012', 'security.role_permission.edit', 'security', 'role_permission', 'edit', 'Change role permission grants', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000013', 'security.field_grant.read', 'security', 'field_grant', 'read', 'Read field grants', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000014', 'security.field_grant.edit', 'security', 'field_grant', 'edit', 'Change field grants', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000015', 'security.role_assignment.read', 'security', 'role_assignment', 'read', 'Read role assignments', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000016', 'security.role_assignment.create', 'security', 'role_assignment', 'create', 'Create role assignments', 'mfa', true, false, 'restricted'),
  ('51000000-0000-4000-8000-000000000017', 'security.role_assignment.edit', 'security', 'role_assignment', 'edit', 'Edit active role assignments', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000018', 'security.role_assignment.archive', 'security', 'role_assignment', 'archive', 'Revoke role assignments', 'mfa', false, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000019', 'security.sod_policy.read', 'security', 'sod_policy', 'read', 'Read segregation-of-duty policies', 'mfa', true, false, 'sensitive'),
  ('51000000-0000-4000-8000-000000000020', 'security.sod_policy.create', 'security', 'sod_policy', 'create', 'Create segregation-of-duty policies', 'mfa', true, false, 'restricted'),
  ('51000000-0000-4000-8000-000000000021', 'security.sod_policy.edit', 'security', 'sod_policy', 'edit', 'Edit segregation-of-duty policies', 'mfa', true, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000022', 'security.sod_policy.archive', 'security', 'sod_policy', 'archive', 'Archive segregation-of-duty policies', 'mfa', false, true, 'restricted'),
  ('51000000-0000-4000-8000-000000000023', 'security.policy_event.read', 'security', 'policy_event', 'read', 'Read policy evidence', 'mfa', true, false, 'restricted');

insert into security_permission_state (permission_id, source_state)
select id, 'active' from security_permission where state_context_required = true;

insert into security_permission_field (permission_id, field_path)
select p.id, fields.field_path
from security_permission p
join lateral (
  select unnest(case p.resource
    when 'scope' then array['code', 'displayName', 'type', 'parentScopeId', 'status', 'version']
    when 'role' then array['code', 'displayName', 'description', 'status', 'version']
    when 'permission' then array['key', 'module', 'resource', 'action', 'description', 'requiredAssurance', 'fieldBearing', 'stateContextRequired', 'sensitivity']
    when 'role_permission' then array['roleId', 'permissionKey']
    when 'field_grant' then array['roleId', 'permissionKey', 'fieldPath']
    when 'role_assignment' then array['userId', 'roleId', 'validFrom', 'validUntil', 'status', 'scopes', 'version']
    when 'sod_policy' then array['kind', 'firstRoleId', 'secondRoleId', 'protectedPermissionKey', 'actorRelation', 'status', 'version']
    when 'policy_event' then array['eventType', 'actorUserId', 'entityType', 'entityId', 'occurredAt', 'metadata']
    else array[]::text[]
  end) as field_path
) fields on true
where p.field_bearing = true;

insert into security_role (id, code, display_name, description, status, created_at, updated_at)
select '52000000-0000-4000-8000-000000000001', 'initial_administrator', 'Initial Administrator',
       'Dynamic role created while backfilling the bootstrap administrator.', 'active', b.completed_at, b.completed_at
from security_bootstrap_state b
where exists (select 1 from app_user u where u.id = b.administrator_user_id);

insert into security_role_permission (role_id, permission_id, granted_at, granted_by_user_id)
select '52000000-0000-4000-8000-000000000001', p.id, b.completed_at, b.administrator_user_id
from security_permission p cross join security_bootstrap_state b;

insert into security_field_grant (role_id, permission_id, field_path, granted_at, granted_by_user_id)
select '52000000-0000-4000-8000-000000000001', f.permission_id, f.field_path,
       b.completed_at, b.administrator_user_id
from security_permission_field f cross join security_bootstrap_state b;

insert into security_role_assignment
  (id, user_id, role_id, status, valid_from, assigned_by_user_id, created_at, updated_at)
select '52000000-0000-4000-8000-000000000002', b.administrator_user_id,
       '52000000-0000-4000-8000-000000000001', 'active', b.completed_at,
       b.administrator_user_id, b.completed_at, b.completed_at
from security_bootstrap_state b;

insert into security_assignment_scope (assignment_id, scope_id, include_descendants)
select '52000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', true
from security_bootstrap_state;

insert into security_policy_event
  (id, event_type, actor_user_id, entity_type, entity_id, occurred_at, after_summary, metadata)
select '52000000-0000-4000-8000-000000000003', 'security.bootstrap_policy.backfilled',
       b.administrator_user_id, 'role', '52000000-0000-4000-8000-000000000001', b.completed_at,
       jsonb_build_object('roleCode', 'initial_administrator'), jsonb_build_object('source', '0005_authorization_policy')
from security_bootstrap_state b;

create constraint trigger security_assignment_sod_assignment_trg
after insert or update or delete on security_role_assignment
deferrable initially deferred for each row
execute function assert_no_security_assignment_sod_conflict();
create constraint trigger security_assignment_sod_scope_trg
after insert or update or delete on security_assignment_scope
deferrable initially deferred for each row
execute function assert_no_security_assignment_sod_conflict();
create constraint trigger security_assignment_sod_policy_trg
after insert or update or delete on security_sod_policy
deferrable initially deferred for each row
execute function assert_no_security_assignment_sod_conflict();

create or replace function assert_security_administrator_remains() returns trigger
language plpgsql as $$
declare
  recovery_keys constant text[] := array[
    'security.access.administer', 'security.scope.read', 'security.role.read', 'security.role.create',
    'security.role.edit', 'security.permission.read', 'security.role_permission.read',
    'security.role_permission.edit', 'security.field_grant.read', 'security.field_grant.edit',
    'security.role_assignment.read', 'security.role_assignment.create',
    'security.role_assignment.edit', 'security.role_assignment.archive'
  ];
begin
  perform pg_advisory_xact_lock(4894133722);
  if exists (select 1 from security_bootstrap_state) and not exists (
    select 1
    from app_user u
    join security_role_assignment a on a.user_id = u.id
    join security_role r on r.id = a.role_id
    join security_assignment_scope assignment_scope on assignment_scope.assignment_id = a.id
    join security_scope root_scope on root_scope.id = assignment_scope.scope_id
    where u.status = 'active' and r.status = 'active' and a.status = 'active'
      and a.valid_from <= statement_timestamp()
      and (a.valid_until is null or a.valid_until > statement_timestamp())
      and root_scope.scope_type = 'enterprise' and root_scope.status = 'active'
      and assignment_scope.include_descendants = true
      and not exists (
        select 1 from unnest(recovery_keys) required_key
        where not exists (
          select 1 from security_role_permission rp
          join security_permission p on p.id = rp.permission_id and p.status = 'active'
          where rp.role_id = r.id and p.permission_key = required_key
        )
      )
      and not exists (
        select 1
        from security_permission p
        join security_permission_field pf on pf.permission_id = p.id
        where p.permission_key = any(recovery_keys) and p.field_bearing = true
          and not exists (
            select 1 from security_field_grant fg
            where fg.role_id = r.id and fg.permission_id = p.id and fg.field_path = pf.field_path
          )
      )
  ) then raise exception 'SECURITY_LAST_ADMINISTRATOR_REQUIRED'; end if;
  return null;
end;
$$;

create constraint trigger security_role_last_admin_trg after insert or update or delete on security_role
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_role_permission_last_admin_trg after insert or update or delete on security_role_permission
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_field_grant_last_admin_trg after insert or update or delete on security_field_grant
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_assignment_last_admin_trg after insert or update or delete on security_role_assignment
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_assignment_scope_last_admin_trg after insert or update or delete on security_assignment_scope
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger app_user_last_admin_trg after update of status on app_user
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_permission_last_admin_trg after update or delete on security_permission
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_permission_field_last_admin_trg after update or delete on security_permission_field
deferrable initially deferred for each row execute function assert_security_administrator_remains();
create constraint trigger security_scope_last_admin_trg after update or delete on security_scope
deferrable initially deferred for each row execute function assert_security_administrator_remains();
