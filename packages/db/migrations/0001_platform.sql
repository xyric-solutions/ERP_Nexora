create table job_execution (
  id uuid primary key,
  queue text not null,
  job_key text not null,
  status text not null check (status in ('queued', 'active', 'completed', 'failed', 'dead-lettered')),
  attempts bigint not null default 0 check (attempts >= 0),
  correlation_id text not null,
  payload jsonb not null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_execution_queue_key_uq unique (queue, job_key)
);

create index job_execution_status_idx on job_execution (status);

create table file_object (
  id uuid primary key,
  object_key text not null unique,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  status text not null check (status in ('pending', 'quarantined', 'available', 'rejected')),
  created_at timestamptz not null default now()
);
