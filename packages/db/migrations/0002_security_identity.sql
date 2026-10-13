create table app_user (
  id uuid primary key,
  login_identifier text not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'disabled', 'locked')),
  bootstrap_administrator boolean not null default false,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_login_identifier_normalized_ck check (
    login_identifier = lower(btrim(login_identifier)) and length(login_identifier) between 3 and 254
  )
);

create unique index app_user_login_identifier_uq on app_user (login_identifier);
create unique index app_user_bootstrap_administrator_uq on app_user (bootstrap_administrator)
  where bootstrap_administrator = true;
create index app_user_status_idx on app_user (status);

create table password_credential (
  user_id uuid primary key references app_user(id) on delete restrict,
  password_hash text not null check (password_hash like '$argon2id$%'),
  hash_algorithm text not null default 'argon2id' check (hash_algorithm = 'argon2id'),
  must_change boolean not null default false,
  changed_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint password_credential_expiry_ck check (expires_at is null or expires_at > changed_at)
);

create table password_history (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete restrict,
  password_hash text not null check (password_hash like '$argon2id$%'),
  hash_algorithm text not null default 'argon2id' check (hash_algorithm = 'argon2id'),
  changed_at timestamptz not null default now()
);

create index password_history_user_changed_idx on password_history (user_id, changed_at desc);

create table authentication_throttle (
  scope text not null check (scope in ('identifier', 'network')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint authentication_throttle_pk primary key (scope, key_hash)
);

create index authentication_throttle_blocked_idx on authentication_throttle (blocked_until)
  where blocked_until is not null;

create table security_bootstrap_state (
  singleton boolean primary key default true check (singleton = true),
  administrator_user_id uuid not null references app_user(id) on delete restrict,
  completed_at timestamptz not null default now()
);
