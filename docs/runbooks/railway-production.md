# Nexora production on Railway

The `production` environment of [ERP_Nexora](https://railway.com/project/33d799cb-e354-48bb-8cf1-ef7b624a7bcf) uses the US West region. The [public web service](https://web-production-f1e9530f.up.railway.app) serves Next.js and proxies `/api/v1` to the private Express API. Requests and session cookies stay on the same public origin.

| Resource         | Production configuration                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`            | Docker `web` target on port 3000, using the public HTTPS origin for `APP_URL` and `NEXT_PUBLIC_API_BASE_URL`. `NEXORA_API_PROXY_ORIGIN` points to `http://api.railway.internal:4000` at build time.                                   |
| `api`            | Docker `api` target on port 4000. Railway runs the versioned database migrations with `DATABASE_MIGRATION_URL` before starting the API with its restricted `DATABASE_URL`. Railway checks `/api/v1/health/ready` on both API and web. |
| `worker`         | Docker `worker` target. Startup checks PostgreSQL, Redis, S3, and queue scheduler registration. `BANK_REVALUATION_REVERSAL_ENABLED=false` until a governed actor is assigned.                                                         |
| `postgres`       | PostgreSQL 18.7, attached volume at `/var/lib/postgresql`, distinct bootstrap, migration, and runtime roles, and daily Railway volume backups.                                                                                        |
| `Redis`          | Private authenticated Redis on its `/data` volume. The start command enables append-only persistence with `appendfsync everysec` and `noeviction`.                                                                                    |
| `nexora-private` | Private S3-compatible bucket. The API and worker use Railway bucket references and virtual-hosted URLs.                                                                                                                               |

Production passwords, session and login-directory keys, the banking encryption key, and the storage credentials live in Railway variables. PostgreSQL keeps six days of daily snapshots. Preserve them across deploys and database imports. The PostgreSQL initialization script runs only when the data directory is empty. Run database schema updates through the migration gate. Leave the source migrations applied when rolling back an app image.

## Deploy with the Railway CLI

Railway receives CLI uploads from a reviewed source revision. From the intended release checkout, build and test, then stage only the versioned files needed by the Docker build. The following copies the working-tree version of each tracked file. Run it from a reviewed release checkout with the intended source changes applied.

```sh
npm run typecheck
npm run test:unit
npm run test:contract
npm run api:check
npm run build:web
npm audit --omit=dev

test -d tmp || mkdir tmp
release_dir=$(mktemp -d "$PWD/tmp/railway-release.XXXXXXXX")
git ls-files -z -- app server packages public docker package.json package-lock.json \
  tsconfig.json tsconfig.base.json next-env.d.ts next.config.ts postcss.config.mjs \
  .dockerignore .gitignore |
  tar -cf - --null -T - | tar -xf - -C "$release_dir"

railway link --project 33d799cb-e354-48bb-8cf1-ef7b624a7bcf --environment production
railway status --project 33d799cb-e354-48bb-8cf1-ef7b624a7bcf --environment production
railway up "$release_dir" --path-as-root --environment production --service api --detach
railway deployment list --service api --limit 1
```

After the API succeeds, repeat the upload for `worker` and `web` using the same release directory. The PostgreSQL image has a separate lifecycle and keeps its attached volume during image updates. The Redis image is managed separately. Check the latest deployment for each service and use these smoke checks after rollout.

```sh
railway logs --service api --deployment --lines 30
railway logs --service worker --deployment --lines 30
railway ssh --service worker -- node server/worker/dist/healthcheck.js
railway postgres pitr schedule list --service postgres
railway postgres pitr backup list --service postgres
curl --fail --silent --show-error \
  https://web-production-f1e9530f.up.railway.app/api/v1/health/ready
```

## Release verification

The 23 November 2026 release used GitHub `main` at `f1667c2` plus the Railway deployment and dependency updates in this checkout. Local TypeScript checks, the production web build, 1,622 unit tests, 26 API contract tests, the generated client check, and the production dependency audit passed. The four npm runtime advisories were resolved. The Railway API migration reapplied cleanly and found zero changes, with 264 ledger entries across 13 modules.

The database upgrade preserved its mounted data directory. The worker passed its dependency check and processed a synthetic job after one retry. The private bucket passed the application adapter's upload, checksum verification, download, and anonymous-access checks. The synthetic storage object was removed, and the test job's execution record was retained as evidence. All five Railway services reported `SUCCESS`. Both private and public readiness returned HTTP 200 with all 13 checks passing. Chrome verification at 1440, 768, and 390 pixels covered dashboard-to-login redirects and password visibility. Also verified were invalid-login and anonymous-company denial, clearing of an invalid session with a Secure, HttpOnly, SameSite=Strict cookie, and rejection of an untrusted origin.

## First tenant and administrator

The operator command creates one tenant, its first company, its initial fiscal calendar, and the first company-authorized Super Administrator in a single audited transaction. The calendar starts with no posting periods. Use the existing Finance setup flows to configure periods, currencies, and posting controls. The public registration page remains a prototype. Re-running the command with the same tenant profile returns the existing IDs without rotating the password, adding grants, or sending another credential.

Add these variables to the **`api`** service in Railway and apply the changes. Keep credentials in Railway and use a new, unique temporary password if you choose out-of-band delivery.

| Variable                                                              | Value                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXORA_BOOTSTRAP_ENABLED`                                            | `true` when you are ready to run the operator command. The default is `false`.                                                                                  |
| `NEXORA_BOOTSTRAP_TENANT_ID`                                          | Unique lowercase slug with 3–64 characters, starting with a letter. Use letters, numbers, and hyphens.                                                          |
| `NEXORA_BOOTSTRAP_ORGANISATION_NAME`                                  | Legal organization name.                                                                                                                                        |
| `NEXORA_BOOTSTRAP_ORGANISATION_TYPE`                                  | Existing registration type such as `private_limited`. Defaults to `other`.                                                                                      |
| `NEXORA_BOOTSTRAP_COUNTRY_CODE`                                       | Uppercase two-letter country code.                                                                                                                              |
| `NEXORA_BOOTSTRAP_FINANCIAL_YEAR_START_MONTH`                         | Month number from `1` to `12`.                                                                                                                                  |
| `NEXORA_BOOTSTRAP_ADMIN_FULL_NAME` and `NEXORA_BOOTSTRAP_ADMIN_EMAIL` | Name and verified work address for the first administrator.                                                                                                     |
| `NEXORA_BOOTSTRAP_ADMIN_USERNAME`                                     | Optional username. Defaults to `admin-<tenant-id>`.                                                                                                             |
| `NEXORA_BOOTSTRAP_ADMIN_PASSWORD`                                     | Optional temporary password of at least 16 characters for out-of-band delivery. Leave empty to generate and queue a password through the configured email path. |

Use Railway SSH to verify the inputs and then run the operator command. The command uses the existing `DATABASE_MIGRATION_URL` and `AUTH_LOGIN_DIRECTORY_SECRET` and prints identifiers and delivery status only.

```sh
railway ssh --service api -- node server/api/dist/cli/bootstrap-tenant.js --check
railway ssh --service api -- node server/api/dist/cli/bootstrap-tenant.js
```

After completion, set `NEXORA_BOOTSTRAP_ENABLED=false` and clear the temporary password variable. The administrator must change the temporary password before Nexora issues a session.

## Credential email

Credential email is optional for service startup. After approval, the existing governed account creation and password reset transactions enqueue an encrypted email for the current credential version. The worker leases one message at a time, retries transient failures up to five attempts, and clears the encrypted payload on delivery, terminal failure, or expiry. A credential that has been replaced or used is skipped. Existing one-time-password handoff remains available to the approving operator.

| Service          | Variables                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worker`         | Set `CREDENTIAL_EMAIL_ENCRYPTION_KEY` to a dedicated 32-byte base64 key. The API references this same variable. Keep it stable while messages are pending.         |
| `worker`, Resend | Set `CREDENTIAL_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `RESEND_FROM` for the verified sender.                                                               |
| `worker`, SMTP   | Set `CREDENTIAL_EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. The default port is `587`. Production requires TLS. |
| `api`            | Use `CREDENTIAL_EMAIL_ENABLED=true` when the worker has a verified sender and key. `CREDENTIAL_EMAIL_ORIGIN` is the public HTTPS origin.                           |

Resend uses the stable outbox message ID as the provider idempotency key. SMTP has no equivalent guarantee if a server accepts a message immediately before Nexora loses the receipt. Railway supports outbound SMTP on Pro plans and above. [Railway outbound email guidance](https://docs.railway.com/networking/outbound-networking)
