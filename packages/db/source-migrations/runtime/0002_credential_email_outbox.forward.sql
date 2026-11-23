CREATE TABLE credential_email_outbox (
    id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    credential_version bigint NOT NULL CHECK (credential_version > 0),
    template text NOT NULL CHECK (template IN ('account_created', 'password_reset')),
    payload bytea CHECK (octet_length(payload) BETWEEN 29 AND 16384),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    lease_token uuid,
    lease_expires_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
    finished_at timestamptz,
    outcome_code text CHECK (length(outcome_code) BETWEEN 1 AND 128),
    FOREIGN KEY (tenant_id, user_id) REFERENCES security_user_account (tenant_id, id) ON DELETE RESTRICT,
    UNIQUE (tenant_id, user_id, credential_version),
    CHECK ((status = 'sending') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
    CHECK ((status IN ('pending', 'sending')) = (payload IS NOT NULL)),
    CHECK ((status IN ('sent', 'failed')) = (finished_at IS NOT NULL))
);
CREATE INDEX credential_email_outbox_due ON credential_email_outbox (next_attempt_at, id)
    WHERE status IN ('pending', 'sending');
CREATE INDEX credential_email_outbox_expiry ON credential_email_outbox (expires_at)
    WHERE status IN ('pending', 'sending');

-- Runtime writers are tenant-scoped. Only the migration owner, through the bounded worker functions, can lease work across tenants.
ALTER TABLE credential_email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_email_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY credential_email_outbox_owner ON credential_email_outbox
    USING (current_user = pg_get_userbyid((SELECT relowner FROM pg_class
           WHERE oid = 'public.credential_email_outbox'::regclass)));
CREATE POLICY credential_email_outbox_tenant_insert ON credential_email_outbox FOR INSERT
    WITH CHECK (tenant_id = current_setting('nexora.tenant_id', true));
REVOKE ALL ON credential_email_outbox FROM PUBLIC;

CREATE FUNCTION claim_credential_email(worker_token uuid, batch_size integer)
RETURNS TABLE(id uuid, tenant_id text, user_id text, credential_version bigint, template text, payload bytea, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    IF worker_token IS NULL OR batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid credential email claim';
    END IF;
    UPDATE public.credential_email_outbox AS message
       SET status = 'failed', payload = NULL, lease_token = NULL, lease_expires_at = NULL,
           finished_at = now(), outcome_code = 'EMAIL_EXPIRED'
     WHERE message.id IN (
         SELECT item.id FROM public.credential_email_outbox AS item
          WHERE item.status IN ('pending', 'sending') AND item.expires_at <= now()
            AND (item.lease_expires_at IS NULL OR item.lease_expires_at <= now())
          ORDER BY item.expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
     );
    RETURN QUERY
    UPDATE public.credential_email_outbox AS message
       SET status = 'sending', lease_token = worker_token, lease_expires_at = now() + interval '5 minutes'
     WHERE message.id IN (
         SELECT item.id FROM public.credential_email_outbox AS item
          WHERE item.status IN ('pending', 'sending') AND item.next_attempt_at <= now()
            AND item.expires_at > now() AND (item.lease_expires_at IS NULL OR item.lease_expires_at <= now())
          ORDER BY item.next_attempt_at, item.id LIMIT batch_size FOR UPDATE SKIP LOCKED
     )
     RETURNING message.id, message.tenant_id, message.user_id, message.credential_version,
               message.template, message.payload, message.attempts;
END;
$$;

CREATE FUNCTION finish_credential_email(message_id uuid, worker_token uuid, outcome text, retry_at timestamptz, code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    IF outcome IS NULL OR outcome NOT IN ('pending', 'sent', 'failed') OR
       (outcome = 'pending' AND retry_at IS NULL) OR worker_token IS NULL THEN
        RAISE EXCEPTION 'Invalid credential email outcome';
    END IF;
    UPDATE public.credential_email_outbox AS message
       SET status = outcome, attempts = message.attempts + 1, outcome_code = code,
           next_attempt_at = coalesce(retry_at, message.next_attempt_at), lease_token = NULL, lease_expires_at = NULL,
           payload = CASE WHEN outcome = 'pending' THEN message.payload ELSE NULL END,
           finished_at = CASE WHEN outcome = 'pending' THEN NULL ELSE now() END
     WHERE message.id = message_id AND message.status = 'sending' AND message.lease_token = worker_token;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION claim_credential_email(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_credential_email(uuid, uuid, text, timestamptz, text) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexora_app') THEN
        REVOKE SELECT, UPDATE, DELETE ON credential_email_outbox FROM nexora_app;
        GRANT INSERT ON credential_email_outbox TO nexora_app;
        GRANT EXECUTE ON FUNCTION claim_credential_email(uuid, integer) TO nexora_app;
        GRANT EXECUTE ON FUNCTION finish_credential_email(uuid, uuid, text, timestamptz, text) TO nexora_app;
    END IF;
END;
$$;
INSERT INTO nexora_schema_migration (module_name, version, name)
VALUES ('runtime', 2, 'credential_email_outbox');
