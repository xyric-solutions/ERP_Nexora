create table mfa_credential (
  user_id uuid primary key references app_user(id) on delete restrict,
  status text not null check (status in ('pending', 'active', 'reset')),
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_auth_tag text not null,
  key_version integer not null default 1 check (key_version > 0),
  algorithm text not null default 'sha1' check (algorithm = 'sha1'),
  digits integer not null default 6 check (digits = 6),
  period_seconds integer not null default 30 check (period_seconds = 30),
  last_used_step bigint,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz,
  enrollment_started_at timestamptz not null,
  activated_at timestamptz,
  reset_at timestamptz,
  version bigint not null default 1 check (version > 0),
  constraint mfa_credential_lifecycle_ck check (
    (status = 'pending' and activated_at is null and reset_at is null) or
    (status = 'active' and activated_at is not null and reset_at is null) or
    (status = 'reset' and activated_at is not null and reset_at is not null)
  )
);

create index mfa_credential_status_idx on mfa_credential (status);
create index mfa_credential_blocked_idx on mfa_credential (blocked_until) where blocked_until is not null;

create table mfa_recovery_code (
  id uuid primary key,
  user_id uuid not null references mfa_credential(user_id) on delete restrict,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'used', 'invalidated')),
  created_at timestamptz not null,
  used_at timestamptz,
  constraint mfa_recovery_code_usage_ck check (
    (status = 'active' and used_at is null) or (status in ('used', 'invalidated') and used_at is not null)
  )
);

create unique index mfa_recovery_code_hash_uq on mfa_recovery_code (user_id, code_hash);
create index mfa_recovery_code_active_idx on mfa_recovery_code (user_id) where status = 'active';

create table mfa_reset_request (
  id uuid primary key,
  subject_user_id uuid not null references app_user(id) on delete restrict,
  requested_by_user_id uuid not null references app_user(id) on delete restrict,
  request_session_id uuid not null references user_session(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text not null check (length(btrim(reason)) between 10 and 500),
  requested_at timestamptz not null,
  decided_at timestamptz,
  decided_by_user_id uuid references app_user(id) on delete restrict,
  decision_session_id uuid references user_session(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  constraint mfa_reset_request_decision_ck check (
    (status = 'pending' and decided_at is null and decided_by_user_id is null and decision_session_id is null) or
    (status in ('approved', 'rejected') and decided_at is not null and decided_by_user_id is not null and decision_session_id is not null)
  )
);

create unique index mfa_reset_request_subject_pending_uq on mfa_reset_request (subject_user_id)
  where status = 'pending';
create index mfa_reset_request_pending_idx on mfa_reset_request (requested_at) where status = 'pending';

create table mfa_security_event (
  id uuid primary key,
  event_type text not null check (event_type in (
    'enrollment_started', 'enrollment_confirmed', 'verification_succeeded',
    'verification_failed', 'recovery_code_used', 'reset_requested',
    'reset_approved', 'reset_rejected'
  )),
  actor_user_id uuid not null references app_user(id) on delete restrict,
  subject_user_id uuid not null references app_user(id) on delete restrict,
  session_id uuid not null references user_session(id) on delete restrict,
  reset_request_id uuid references mfa_reset_request(id) on delete restrict,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint mfa_security_event_metadata_object_ck check (jsonb_typeof(metadata) = 'object')
);

create index mfa_security_event_subject_time_idx on mfa_security_event (subject_user_id, occurred_at desc);
create index mfa_security_event_actor_time_idx on mfa_security_event (actor_user_id, occurred_at desc);
