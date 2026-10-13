alter table security_password_credential
  add column if not exists argon2_hash text,
  add column if not exists argon2_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'security_password_credential'::regclass
      and conname = 'security_password_credential_argon2_hash_check'
  ) then
    alter table security_password_credential
      add constraint security_password_credential_argon2_hash_check
      check (argon2_hash is null or argon2_hash ~ '^\$argon2id\$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'security_password_credential'::regclass
      and conname = 'security_password_credential_argon2_timestamp_check'
  ) then
    alter table security_password_credential
      add constraint security_password_credential_argon2_timestamp_check
      check (
        (argon2_hash is null and argon2_updated_at is null)
        or (argon2_hash is not null and argon2_updated_at is not null)
      );
  end if;
end
$$;

insert into nexora_schema_migration (module_name, version, name)
values ('security', 6, 'password_argon2_compatibility');
