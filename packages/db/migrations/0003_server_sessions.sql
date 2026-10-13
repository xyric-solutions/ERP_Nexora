create table user_session (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete restrict,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  assurance_level text not null check (assurance_level in ('password', 'mfa')),
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  rotated_from_id uuid references user_session(id) on delete restrict,
  user_agent_hash text check (user_agent_hash is null or user_agent_hash ~ '^[a-f0-9]{64}$'),
  source_ip_hash text check (source_ip_hash is null or source_ip_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz,
  revocation_reason text,
  version bigint not null default 1 check (version > 0),
  constraint user_session_expiry_ck check (
    created_at <= last_seen_at and last_seen_at < absolute_expires_at and
    idle_expires_at > last_seen_at and idle_expires_at <= absolute_expires_at
  ),
  constraint user_session_revocation_ck check (
    (status = 'active' and revoked_at is null and revocation_reason is null) or
    (status = 'revoked' and revoked_at is not null and revocation_reason is not null)
  )
);

create unique index user_session_token_hash_uq on user_session (token_hash);
create index user_session_user_active_idx on user_session (user_id, created_at desc) where status = 'active';
create index user_session_expiry_idx on user_session (idle_expires_at, absolute_expires_at) where status = 'active';
create index user_session_rotated_from_idx on user_session (rotated_from_id) where rotated_from_id is not null;
