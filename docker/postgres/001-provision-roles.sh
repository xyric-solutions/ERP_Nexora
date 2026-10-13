#!/bin/sh
set -eu

: "${POSTGRES_MIGRATION_PASSWORD:?migration password is required}"
: "${POSTGRES_APP_PASSWORD:?application password is required}"

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=migration_password="$POSTGRES_MIGRATION_PASSWORD" \
  --set=application_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE nexora_migrator
  LOGIN
  PASSWORD :'migration_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE ROLE nexora_app
  LOGIN
  PASSWORD :'application_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE DATABASE nexora OWNER nexora_migrator;
REVOKE ALL ON DATABASE nexora FROM PUBLIC;
GRANT CONNECT ON DATABASE nexora TO nexora_app;
SQL

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname nexora <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO nexora_app;

ALTER DEFAULT PRIVILEGES FOR ROLE nexora_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexora_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nexora_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexora_app;
SQL
