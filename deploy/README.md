# FlyWallets: production deployment (Docker, one domain, automatic HTTPS)

A self-hosted setup for any VPS or server with Docker:

```
Internet --443--> Caddy (TLS, automatic certificates)
                    |-- /api/*  --> backend  (Express, port 5000, internal only)
                    '-- /*      --> frontend (Next.js, port 3000, internal only)
                  backend --> PostgreSQL 16 (internal only, Row-Level Security role enforced)
```

Only Caddy publishes ports (80 and 443). PostgreSQL, the API and the web app are not reachable from outside the
compose network.

## Why a single domain is required

The auth cookies (`access_token`, `refresh_token`) are `HttpOnly`, `Secure` and `SameSite=Strict`, and
`SameSite=Strict` is the only CSRF defence. A browser sends such cookies only to requests that originate from the same
**site**. The web app and the API therefore must live on the same site:

- `my-app.vercel.app` + `my-api.onrender.com` does not work: they are different sites, and `onrender.com` /
  `vercel.app` are on the public suffix list, so every subdomain is its own registrable site. Login would appear to
  succeed, then every following request would be unauthenticated.
- Here the browser only ever talks to `https://<your domain>`: pages come from the frontend, `/api/*` is routed to the
  backend by Caddy. The frontend is built with `NEXT_PUBLIC_API_URL=/api` (relative), so no CORS is involved.

## Prerequisites

- A server with Docker Engine 24+ and the Compose plugin (`docker compose version`), 1 GB RAM minimum (the frontend
  image build needs about 1-2 GB while building; add swap on small VPSs).
- A domain (or subdomain) whose DNS **A/AAAA record points at the server's public IP**.
- Ports **80 and 443** open to the internet (firewall and cloud security group). Port 80 is needed for the
  Let's Encrypt HTTP challenge and for the HTTP to HTTPS redirect. Nothing else may be listening on them.

## First deployment

All commands are run from the repository root.

```bash
git clone <your fork or this repository> flywallets && cd flywallets

# 1. Configuration (deploy/.env is git-ignored: never commit it)
cp deploy/production.env.example deploy/.env

# 2. Generate and paste four secrets into deploy/.env (JWT_SECRET, JWT_REFRESH_SECRET, POSTGRES_PASSWORD, APP_DB_PASSWORD)
openssl rand -hex 48    # run twice: JWT_SECRET and JWT_REFRESH_SECRET (must differ)
openssl rand -hex 24    # run twice: POSTGRES_PASSWORD and APP_DB_PASSWORD (alphanumeric only, keep it that way)

# 3. Edit deploy/.env: set DOMAIN=wallet.example.com (no https://), paste the secrets, configure e-mail (below)
$EDITOR deploy/.env

# 4. Build and start
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build

# 5. Check
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps
curl https://wallet.example.com/api/health
```

Compose refuses to start if `DOMAIN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD` or `APP_DB_PASSWORD` are
missing. The backend itself refuses to start in production with JWT secrets shorter than 32 characters.

Caddy requests the certificate on first start (it needs the DNS record and ports 80/443 to be ready; watch
`docker compose ... logs -f caddy`). Open `https://<your domain>` and register: there is nothing else to create or
promote. There are no admin roles and no demo data: the first user registers like everybody else (the seed script
refuses to run with `NODE_ENV=production`).

Tip: `export COMPOSE_FILE=deploy/docker-compose.prod.yml COMPOSE_ENV_FILES=deploy/.env` in your shell lets you type
just `docker compose ps`, `docker compose logs -f backend`, etc. The examples below spell out the long form.

## E-mail

Without an e-mail provider, verification codes and password-reset links are only **printed in the backend log**
(`docker compose ... logs backend`). That is fine for a private instance, not for real users. Configure one provider
in `deploy/.env`:

- SMTP: `SMTP_HOST`, `SMTP_PORT` (587 + `SMTP_SECURE=false` for STARTTLS, 465 + `SMTP_SECURE=true` for implicit TLS),
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- or Resend: `RESEND_API_KEY` (takes precedence; `SMTP_FROM` must use a domain verified in Resend).

Then set `REQUIRE_VERIFIED_EMAIL=true` (recommended once e-mail works): users with an unverified address can read but
not write data, so disposable addresses cannot be used to fill your database. Do **not** enable it without a working
provider, or nobody can read their verification code and everyone stays read-only. Apply changes with
`docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d` (recreates the backend only).

Optional SMS (Twilio) and AI (`AI_PROVIDER`, Gemini or OpenAI keys) are passed through the same file.

## Logs

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs -f --tail=100 backend
# also: frontend, caddy (JSON access log), postgres
```

## Backups and restore

Data lives in the `pgdata` Docker volume. Back it up with a logical dump (run from the repository root):

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres \
  pg_dump -U postgres -d flywallets --clean --if-exists | gzip > flywallets-$(date +%F).sql.gz
```

Restore (into a running stack; the dump contains `DROP ... IF EXISTS` so it replaces the current content):

```bash
gunzip -c flywallets-YYYY-MM-DD.sql.gz | docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres \
  psql -U postgres -d flywallets -v ON_ERROR_STOP=1 -q
```

Copy the dumps off the server. Automating this (cron, retention, off-site storage) is up to you, see the end of this
file. Also keep a copy of `deploy/.env` somewhere safe (it holds the database passwords and JWT secrets).

## Updating

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Containers are rebuilt and replaced; the database volume and the certificates are kept. Back up first.

### Database migrations (existing databases)

`database/schema.sql` runs only on the first start of an **empty** volume. When an update adds or changes tables, the
change is shipped as a file in `database/migrations/` (also look at the release notes / `git log -- database/`).
There is no migration tracking table: run only the migrations that are newer than the database. For a database
created from an older `schema.sql`, apply them in order:

```bash
DC="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
# 001 is NOT idempotent: run it only if the budgets table does not exist yet (this prints "t" when it exists)
$DC exec -T postgres psql -U postgres -d flywallets -Atc "SELECT to_regclass('public.budgets') IS NOT NULL"
$DC exec -T postgres psql -U postgres -d flywallets -v ON_ERROR_STOP=1 -q < database/migrations/001_budgets_recurring.sql   # only if "f"
# 002-005 are idempotent: safe to run again
for f in database/migrations/00[2-9]_*.sql database/migrations/0[1-9][0-9]_*.sql; do
  [ -e "$f" ] && $DC exec -T postgres psql -U postgres -d flywallets -v ON_ERROR_STOP=1 -q < "$f"
done
# Re-apply the grants of the restricted RLS role (needed after a migration that adds tables; idempotent)
$DC exec -T postgres sh /docker-entrypoint-initdb.d/02_rls_app_role.sh
```

A database created by this stack from the current `schema.sql` already contains everything up to the latest migration
(running 002-005 again is harmless). Restart the backend afterwards (`$DC restart backend`) if the update also changed
code that needs the new schema; `up -d --build` already does that.

## Rotating secrets

- **JWT secrets** (`JWT_SECRET`, `JWT_REFRESH_SECRET`): generate new values in `deploy/.env`, then
  `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d backend`. **Everybody is logged out**
  and pending e-mail verification codes / password-reset flows must be requested again (codes are bound to
  `JWT_SECRET`). Do this at once if a secret leaked.
- **Database passwords** are only read on the first start of an empty volume. To change them on a live database:
  `ALTER ROLE postgres PASSWORD '...'` / `ALTER ROLE flywallets_app PASSWORD '...'` via
  `docker compose ... exec postgres psql -U postgres -d flywallets`, then update `deploy/.env` and recreate the backend.

## Troubleshooting

| Symptom | Check |
|---|---|
| Login "works" but you are immediately logged out / every call is 401 | Cookies not set or not sent. Use `https://<DOMAIN>` exactly (not the IP, not `http://`), and make sure the frontend was built with `NEXT_PUBLIC_API_URL=/api` (compose does it; if you changed it, `up -d --build`). Check `Set-Cookie` in the browser dev tools. |
| Browser certificate error, Caddy log shows ACME errors | DNS record not pointing at this server yet, port 80/443 blocked, or something else already uses them. `docker compose ... logs caddy`. Let's Encrypt rate limits apply to repeated failures: fix DNS first, then restart caddy. |
| `502 Bad Gateway` | Backend not healthy: `docker compose ... ps` and `logs backend` (bad `DATABASE_URL` password after changing `.env` on an existing volume, missing secrets, crash on start). |
| `403 Origin not allowed` on API calls | `CLIENT_URL` is derived from `DOMAIN` as `https://<DOMAIN>`. Browse the exact host name configured there (`www.` is a different origin). |
| Everybody behind the same IP gets "Too many requests" | Rate limits are per client IP: if another proxy/CDN (Cloudflare, a load balancer) sits in front of Caddy, Caddy sees its address instead of the user's. See "Behind another proxy" below. |
| Compose says `required variable ... is missing` | `--env-file deploy/.env` missing, or the variable is empty in that file. |
| No e-mail arrives | No provider configured: the code is in `logs backend`. Otherwise check `SMTP_*`/`RESEND_API_KEY` and the sender domain. |
| Port 80/443 already in use | Stop the other service, or set `HTTP_PORT` / `HTTPS_PORT` (then Let's Encrypt cannot validate; only for testing or when another proxy forwards 80/443 to these ports). |

### Behind another proxy / CDN

The setup assumes Caddy is directly exposed to clients (one proxy hop, `TRUST_PROXY=1`). Caddy discards any
`X-Forwarded-For` header sent by clients and sets its own, so clients cannot spoof their address. If you put another
proxy in front of Caddy, add its address ranges to the `trusted_proxies` option in `deploy/Caddyfile` (global
`servers { trusted_proxies static <CIDRs> }`) and raise `TRUST_PROXY` accordingly in the compose file. Get this wrong in
either direction and the per-IP rate limits become either useless or shared by all users.

### Testing the stack locally (no real domain)

```bash
printf 'DOMAIN=localhost\nTLS_INTERNAL=true\nHTTP_PORT=8088\nHTTPS_PORT=8448\nJWT_SECRET=%s\nJWT_REFRESH_SECRET=%s\nPOSTGRES_PASSWORD=%s\nAPP_DB_PASSWORD=%s\n' \
  $(openssl rand -hex 48) $(openssl rand -hex 48) $(openssl rand -hex 16) $(openssl rand -hex 16) > deploy/.env
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
curl -k https://localhost:8448/api/health
```

`TLS_INTERNAL=true` makes Caddy sign with its own private CA (browsers warn, `curl -k` skips verification). Never use
it for a real domain. The HTTP to HTTPS redirect points at the default port, so use the HTTPS URL directly when you
change the ports. Remove everything with `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env down -v`.

## What this does not include

- **No monitoring or alerting.** Containers have health checks and restart policies, nothing watches them.
- **No backup automation.** The `pg_dump` above is manual; schedule and ship it yourself. No point-in-time recovery.
- **Single instance, no high availability.** One PostgreSQL, one API process, one web process, one proxy.
- **In-memory state in the API**: rate-limit counters (they reset when the backend restarts) and per-user export
  concurrency counters. Running several API replicas would give each its own counters; this stack runs one.
- **The recurring-transactions scheduler runs inside the API process** (at startup, then hourly). With more than one
  replica set `RECURRING_SCHEDULER=off` on all but one.
- No log shipping/rotation beyond Docker's defaults (configure a `logging` driver with `max-size` if the host is small),
  no WAF, no CDN, no automatic OS or image updates.
- Real Let's Encrypt issuance depends on your DNS and firewall; this stack was only verified locally with Caddy's
  internal CA.
