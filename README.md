# 💸 FlyWallets

[![CI](https://github.com/andreagalassi-dev/FlyWallets-website/actions/workflows/ci.yml/badge.svg)](https://github.com/andreagalassi-dev/FlyWallets-website/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2022-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)

> **All-in-One Personal & Business Financial Hub**  
> Collega i tuoi conti correnti bancari, home banking e wallet manuali in un unico centro di controllo intelligente per monitorare liquidità, spese, transazioni e obiettivi di risparmio.

FlyWallets is a self-hosted personal finance manager: a Next.js web app on top of an Express 5 REST API and PostgreSQL 16.
Today every account is a **manual account** (you create it and record or import its transactions). The "connect your bank"
idea in the tagline above is **not implemented yet**; see [Roadmap and known limits](#roadmap-and-known-limits).

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [API reference](#api-reference)
7. [Optional integrations (e-mail, SMS, AI)](#optional-integrations-e-mail-sms-ai)
8. [Database](#database)
9. [Testing and CI](#testing-and-ci)
10. [Deployment notes](#deployment-notes)
11. [Security notes](#security-notes)
12. [Roadmap and known limits](#roadmap-and-known-limits)
13. [Contributing](#contributing)
14. [License](#license)

---

## Features

**Money**

- **Manual accounts** (`checking`, `savings`, `wallet`, `cash`) with colour and emoji. Optional **overdraft**: per account `overdraft_allowed` plus an optional `overdraft_limit` (no limit value = unlimited overdraft). Without overdraft a balance cannot go below zero. An account that has transactions is archived instead of deleted. Daily balance history per account.
- **Transactions**: create, **edit** and delete, with filters (account, category, type, date range, text search) and pagination. Every create / edit / delete updates the account balance **atomically** in one SQL transaction (the old effect is reverted and the new one applied, linked savings goals are kept consistent, daily balance snapshots are rebuilt from the earliest affected day). Dates may be at most 1 day in the future and 10 years in the past.
- **Categories**: 25 system categories (Italian names, seeded by `schema.sql`) plus custom categories per user.
- **Savings goals**: progress percentage, contributions (optionally recorded as an expense on an account), completion state.
- **Monthly budgets**: one spending limit per expense category, an alert threshold (default 80 %), a `warning` / `exceeded` status and a bell in the app header that lists the active alerts. Spending is computed for the current calendar month (UTC).
- **Recurring transactions** (daily, weekly, monthly, yearly) on manual accounts: due occurrences are turned into real transactions when you open the list, when you create or edit a rule, through `POST /api/recurring/process`, and by a **background scheduler** in the API process (one run shortly after startup, then hourly; disable it with `RECURRING_SCHEDULER=off`).
- **CSV import / export**: export the (filtered) transactions as CSV (comma, or semicolon with decimal comma for Italian Excel); import a bank CSV into one account with automatic detection of delimiter, date format, decimal separator and columns (English and Italian headers, signed amounts or separate debit / credit columns), optional manual column mapping, a **dry run** preview, per-row error report and duplicate detection. Spreadsheet formula injection is neutralised on export.
- **Charts and dashboard**: net worth over time and spending by category (30 days, 90 days, 1 year), plus one consolidated `GET /api/dashboard` call with totals, accounts, recent transactions, goals and categories.

**AI (optional)**

- **Categorisation and insights**: Gemini or OpenAI when configured, with a deterministic keyword engine / rule engine as fallback (no key, timeout or provider error never breaks the app). New transactions without a category get one from the keyword engine; the AI provider is only called from the dedicated `/api/ai/*` endpoints.

**Accounts and security**

- **Registration** for individuals and businesses, login with HttpOnly JWT cookies (access 15 minutes, refresh 30 days), profile update, logout.
- **E-mail OTP verification** (6 digits, stored as an HMAC, 10 minute TTL, 3 wrong attempts lock verification for 15 minutes) and **password reset** (random 256-bit token, only its SHA-256 is stored, 1 hour TTL, single use, revokes every session).
- **Refresh-token rotation with reuse detection**: every refresh issues a new refresh token; replaying an already used one (after a 30 second grace window for multi-tab races) revokes all the user's sessions.
- **Optional verified-e-mail gate** (`REQUIRE_VERIFIED_EMAIL=true`): unverified users can read but not modify their financial data.
- **Row-Level Security** on every user-owned table, activated per request through `app.current_user_id` (see [Row-Level Security](#row-level-security-rls)).
- **Hardened API**: Helmet, strict CORS allow-list, differentiated rate limits, validated payloads, no internal error details in responses.

**Frontend**

- Public **landing page** (`/`) with an in-browser categorisation demo, login / register / forgot password / reset password / verify e-mail pages, and a dashboard area with overview, accounts, transactions, goals, budgets, recurring, categories, statistics, profile and settings. Toast notifications, skeleton loading states, responsive layout with a mobile drawer.

**Quality**

- `node:test` + `supertest` integration tests against a real PostgreSQL (backend), unit tests for the pure helpers (frontend), ESLint on both, GitHub Actions CI, Dependabot.

---

## Architecture

Decoupled client-server: the browser talks to the Express API with HttpOnly cookies.

```mermaid
flowchart LR
    subgraph Client ["Frontend (Next.js 16 / React 19)"]
        UI["Tailwind + Lucide UI"]
        Store["Zustand stores"]
        AxiosClient["Axios client\n(HttpOnly cookies)"]
    end

    subgraph Server ["Backend (Node.js 22 / Express 5)"]
        Middlewares["Helmet + CORS + Rate limits + Validators"]
        Modules["Auth, Accounts, Categories, Transactions, Goals,\nBudgets, Recurring, CSV, Dashboard, AI"]
        Services["Ledger, Recurring scheduler, CSV import,\nEmail, SMS (unused), AI"]
    end

    subgraph Storage ["PostgreSQL 16"]
        Owner["Owner pool\n(DATABASE_URL)"]
        App["Restricted RLS pool\n(DATABASE_APP_URL)"]
    end

    Client <-->|REST / cookies| Server
    Server --> Owner
    Server --> App
```

A protected request goes through: `authenticateToken` (JWT from the `access_token` cookie or an `Authorization: Bearer` header) -> `apiLimiter` (120 requests / minute / user) -> `rlsContext` (adds `req.withUser(fn)`, which runs `fn` in a transaction with `app.current_user_id` set) -> `requireVerifiedEmail` (only active when enabled) -> controller. All balance-changing logic lives in `backend/src/services/ledgerService.js` so transactions, goal contributions, recurring rules and CSV import share the same rules (overdraft, dates, snapshots).

**Stack**

- Frontend: Next.js 16 (App Router), React 19, Tailwind CSS 3.4, Zustand, React Hook Form + Zod, Axios, Lucide. Charts are hand-written SVG components (no chart library).
- Backend: Express 5, `pg`, `jsonwebtoken`, `bcrypt` (12 rounds), `express-validator`, `express-rate-limit`, Helmet, CORS, Nodemailer. The CSV parser, scheduler, SMS and AI clients use no extra dependency.
- Database: PostgreSQL 16, `pgcrypto` for UUIDs, `updated_at` triggers, Row-Level Security.

---

## Project structure

```text
FlyWallets-website/
├── .env.example                # Docker Compose settings (copy to .env)
├── docker-compose.yml          # postgres + backend + frontend
├── .github/
│   ├── workflows/ci.yml        # backend, frontend and docker jobs
│   ├── ISSUE_TEMPLATE/         # Bug report / feature request forms
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── SECURITY.md
├── LICENSE
│
├── database/
│   ├── schema.sql              # 18 tables, indexes, triggers, RLS policies, system categories (never drops anything)
│   ├── migrations/             # Incremental scripts for databases created before a feature existed
│   │   ├── 001_budgets_recurring.sql
│   │   └── 002_session_rotation.sql
│   ├── rls_app_role.sql        # Optional restricted role `flywallets_app` (makes RLS effective)
│   └── reset.sql               # DANGER: drops the original 16 tables (see Database section)
│
├── backend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── eslint.config.js
│   ├── tests/                  # node:test + supertest integration tests and helpers.js
│   └── src/
│       ├── app.js              # Express app (exported for tests)
│       ├── server.js           # Entry point: listens and starts the recurring scheduler
│       ├── config/             # env.js (secrets, CORS origins), db.js (pools + RLS context)
│       ├── controllers/        # auth, account, category, transaction, goal, budget, recurring,
│       │                       # dashboard, ai, importExport
│       ├── middleware/         # auth, rate limits, RLS context, validation, verified-e-mail gate
│       ├── routes/             # one router per module
│       ├── services/           # ledger, recurring, csv, import, email, sms, ai
│       ├── scripts/            # seed.js (demo data), verify_schema.js (prints audit_logs columns)
│       └── utils/              # security (bcrypt, JWT, hashing, OTP), httpError
│
├── frontend/
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── app/                # /, /login, /register(/verify-email), /forgot-password, /reset-password, /dashboard/*
│       ├── components/         # landing, layout, dashboard, charts, ui, brand
│       ├── hooks/              # useApiData, useBudgetAlerts, useLogout
│       ├── lib/                # api (Axios + refresh interceptor), formatting, errors, csv, recurring, overdraft...
│       ├── store/              # authStore, toastStore (Zustand)
│       └── proxy.js            # Route guard (Next.js 16 "proxy", formerly middleware)
│
├── instructions/               # Design notes in Italian (auth flow, dashboard, DB schema, security)
└── claude.md                   # Italian planning / release checklist
```

---

## Quick start

**Prerequisites**: Docker with Docker Compose for option A; for option B also Node.js >= 22 and npm.

### Option A: everything in Docker

```bash
git clone https://github.com/andreagalassi-dev/FlyWallets-website.git
cd FlyWallets-website

cp .env.example .env
# Generate two different secrets and paste them into .env as JWT_SECRET and JWT_REFRESH_SECRET
# (each at least 32 characters; compose refuses to start without them):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # or: openssl rand -hex 48

docker compose up --build
```

- Web app: <http://localhost:3000> (or `FRONTEND_PORT`)
- API: <http://localhost:5000/api/health> (or `BACKEND_PORT`)
- PostgreSQL: `127.0.0.1:5432` (or `POSTGRES_PORT`), user `postgres`, database `flywallets`

Load the demo data (the database host is not "localhost" from inside the container, so `--force` is required):

```bash
docker compose exec backend node src/scripts/seed.js --force
```

Then sign in with `demo@flywallets.local` / `Password123!`.

Things to know about the Docker stack:

- `schema.sql` is mounted into the postgres image and runs **only on the first start of an empty volume**. To start from scratch: `docker compose down -v`.
- `NEXT_PUBLIC_API_URL` is inlined into the browser bundle **at build time** (compose passes `http://localhost:${BACKEND_PORT}/api` as a build argument). After changing `BACKEND_PORT` run `docker compose up --build` again. The API must be reachable from the **browser**, not only from the container network.
- The backend container runs with `NODE_ENV=development` on purpose (plain HTTP on localhost: production mode needs HTTPS for the `Secure` cookies and refuses the seed script). For a real deployment use the production setup in [`deploy/README.md`](deploy/README.md) (Caddy with automatic HTTPS, `NODE_ENV=production`).
- Compose forwards only a subset of the backend variables (see the Docker Compose table under [Environment variables](#environment-variables)). In particular `REQUIRE_VERIFIED_EMAIL`, `TRUST_PROXY`, `RECURRING_SCHEDULER`, `GEMINI_MODEL` and `OPENAI_MODEL` are **not** forwarded: add them to the `backend.environment` block of `docker-compose.yml` if you need them. Row-Level Security **is** enforced in the Docker stack: on the first start of an empty volume `database/docker/02_rls_app_role.sh` creates the restricted `flywallets_app` role (password `APP_DB_PASSWORD`, alphanumeric, dev default `flywallets_app`) and the backend uses it through `DATABASE_APP_URL`. If your volume was created before this existed, run `docker compose down -v` (this deletes the data) or create the role by hand as described in [RLS](#row-level-security-rls).
- Without e-mail credentials, verification codes and reset links are printed in `docker compose logs backend`.

### Option B: manual development setup (hot reload)

```bash
# 1. PostgreSQL only:
docker compose up -d postgres
#    Port 5432 busy? -> add POSTGRES_PORT=5433 and use that port in DATABASE_URL below.
#    Any PostgreSQL 15/16 works too: load database/schema.sql into an empty database.

# 2. Backend
cd backend
cp .env.example .env
#    Edit .env: set JWT_SECRET and JWT_REFRESH_SECRET (command above) and, if you changed it, the port in DATABASE_URL.
npm install
npm run db:seed          # demo user + 3 accounts + 15 transactions + 2 goals
npm run dev              # http://localhost:5000  (health: /api/health)

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

**macOS port 5000 conflict**: on recent macOS the AirPlay Receiver listens on port 5000. Run the API on another port and point the frontend at it:

```bash
# backend/.env
PORT=5055
# frontend/.env.local   (restart `npm run dev` afterwards: the value is inlined at build time)
NEXT_PUBLIC_API_URL=http://localhost:5055/api
```

### Demo credentials

| Email | Password |
|---|---|
| `demo@flywallets.local` | `Password123!` |

The seed creates three accounts (Conto Principale, Fondo Risparmio, Portafoglio Contanti), 15 transactions over the last month, daily balance snapshots for the charts and two goals (Vacanza Estiva, Fondo Emergenza). It does **not** create budgets or recurring rules. The demo user's e-mail is already verified. The seed is idempotent (it deletes and recreates only the demo user), refuses to run when `NODE_ENV=production`, and refuses a non-local `DATABASE_URL` unless you pass `--force`.

> Without e-mail credentials the verification codes and reset links are **printed in the backend console**, so you can try every flow locally.

---

## Environment variables

### Backend (`backend/.env`, template: `backend/.env.example`)

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `PORT` | no | `5000` | HTTP port. |
| `NODE_ENV` | no | `development` | `development`, `production` or `test`. In `production` the server exits if a JWT secret is missing or shorter than 32 characters, and cookies get the `Secure` flag. |
| `CLIENT_URL` | no | `http://localhost:3000` | Allowed CORS origin(s), comma-separated. The **first** one is used to build links in e-mails. |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front of the API (e.g. `1`), so rate limiting sees the real client IP. |
| `DATABASE_URL` | yes | none in code (template: `postgresql://postgres:postgres@localhost:5432/flywallets`) | Owner / superuser connection: auth flows, scheduler user discovery, seed, audit log writes. |
| `DB_SSL` | no | SSL on for non-local hosts | Set `false` to disable SSL. Localhost URLs never use SSL. |
| `DATABASE_APP_URL` | no | falls back to `DATABASE_URL` | Connection of the restricted `flywallets_app` role, used by the data modules, so RLS is really enforced. See [RLS](#row-level-security-rls). |
| `JWT_SECRET` | prod | random per process in dev | Access-token secret, >= 32 chars. Also keys the OTP HMAC. |
| `JWT_REFRESH_SECRET` | prod | random per process in dev | Refresh-token secret, >= 32 chars. |
| `REQUIRE_VERIFIED_EMAIL` | no | `false` | `true` / `1` / `yes`: users with an unverified e-mail get `403 EMAIL_NOT_VERIFIED` on every write to accounts, transactions, goals, categories, budgets, recurring and CSV import. Reads, auth routes, dashboard and AI stay open. |
| `RECURRING_SCHEDULER` | no | on | Set to `off` to disable the hourly background generation of recurring transactions (due rules are still processed lazily by the API). |
| `SCHEDULER_USER_BUDGET_MS` | no | 5000 | Recurring scheduler: maximum time spent on one user per run (the rest continues on the next run). |
| `IMPORT_RATE_LIMIT_PER_MIN` / `EXPORT_RATE_LIMIT_PER_MIN` | no | 5 / 10 | Per-user CSV import / export limits per minute. |
| `EXPORT_MAX_CONCURRENT_PER_USER` / `EXPORT_DRAIN_TIMEOUT_MS` | no | 2 / 30000 | Simultaneous exports per user (kept in process memory) and how long a client may stop reading an export before it is dropped. |
| `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS` | no | 10 / 5000 / 30000 | PostgreSQL pool tuning. |
| `DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS` | no | 15000 / 30000 | Server-side timeouts (0 disables). Raise or disable `DB_STATEMENT_TIMEOUT_MS` for long manual migrations run with the owner pool. |
| `RESEND_API_KEY` | no | - | Send e-mail through Resend (takes precedence over SMTP). |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | no | - | All three are needed to enable SMTP. |
| `SMTP_PORT` | no | `587` (template: `2525`) | SMTP port. |
| `SMTP_SECURE` | no | `false` | `true` for implicit TLS (port 465). |
| `SMTP_FROM` | no | `FlyWallets <no-reply@flywallets.local>` | Sender address (with Resend it must use a verified domain). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | no | - | Credentials for the SMS client. **Nothing calls it yet**, see [SMS](#sms). |
| `AI_PROVIDER` | no | `disabled` | `gemini`, `openai` or `disabled`. A provider with a missing key counts as `disabled`. |
| `GEMINI_API_KEY` | no | - | Required when `AI_PROVIDER=gemini`. |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` | Gemini model id (default hard-coded in `aiService.js`; set your own if it is not available to your key). |
| `OPENAI_API_KEY` | no | - | Required when `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | no | `gpt-6-luna` | OpenAI model id (default hard-coded in `aiService.js`; set your own if it is not available to your key). |

Test-only variables (read by `backend/tests/helpers.js`): `TEST_DATABASE_URL`, `TEST_DATABASE_APP_URL`, `CI`. See [Testing and CI](#testing-and-ci).

### Frontend (`frontend/.env.local`, template: `frontend/.env.example`)

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:5000/api` | Base URL of the Express API **including `/api`**. Inlined at build time (and read by `next dev` at startup). |
| `NEXT_PUBLIC_SITE_URL` | no | `http://localhost:3000` | Public URL of the web app, used only as `metadataBase` for page metadata (Open Graph / Twitter tags). Not listed in `frontend/.env.example`. Also inlined at build time. |

### Docker Compose (root `.env`, template: `.env.example`)

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `JWT_SECRET` | recommended | random per start | >= 32 chars. If empty, the backend container generates a random secret at startup (and warns): fine for a demo, but every restart logs everybody out. |
| `JWT_REFRESH_SECRET` | recommended | random per start | >= 32 chars, different from `JWT_SECRET`. Same behaviour as above when empty. |
| `POSTGRES_PORT` | no | `5432` | Host port of PostgreSQL (published on `127.0.0.1` only). |
| `BACKEND_PORT` | no | `5000` | Host port of the API. Also baked into the frontend build as `NEXT_PUBLIC_API_URL`. |
| `FRONTEND_PORT` | no | `3000` | Host port of the web app. |
| `CLIENT_URL` | no | `http://localhost:${FRONTEND_PORT}` | CORS origin(s) / base URL for e-mail links. |
| `POSTGRES_PASSWORD` | no | `postgres` | Password of the `postgres` user, used by the database and the backend. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`, `RESEND_API_KEY` | no | empty / `2525` / `false` | Passed through to the backend (see above). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | no | empty | Passed through to the backend. |
| `AI_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | no | `disabled` / empty | Passed through to the backend. |

---

## API reference

Base URL: `http://localhost:5000/api`. Bodies and responses are JSON, shaped `{ "status": "success", "data": ... }` or `{ "status": "error", "message": ... }`; errors that clients can branch on also carry a machine-readable `code`.

**Auth.** "yes" means a valid access token, sent in the `access_token` HttpOnly cookie or an `Authorization: Bearer <token>` header. Every route outside `/api/auth` and `/api/health` runs `authenticateToken` -> per-user rate limit (120 / minute) -> RLS user context -> verified-e-mail gate, so each of them can also answer **401** (missing / expired token), **429** (rate limit) and, for writes with `REQUIRE_VERIFIED_EMAIL=true`, **403 `EMAIL_NOT_VERIFIED`**. These are not repeated in the tables.

**Common errors**

| Status | `code` | Meaning |
|---|---|---|
| 400 | - | Validation failed: `{ "status": "error", "errors": [{ "msg", "path", ... }] }`, or a business rule (e.g. date out of range) with a `message`. |
| 401 | - | `Access Token Required` / `Invalid or Expired Token`. The frontend answers with one silent `POST /auth/refresh-token`. |
| 403 | `EMAIL_NOT_VERIFIED` | Write refused because the e-mail is unverified and `REQUIRE_VERIFIED_EMAIL=true`. |
| 403 | `REFRESH_TOKEN_REUSED` | A rotated refresh token was replayed: all sessions were revoked and the cookies cleared. |
| 403 | - | CORS origin not allowed, disabled / suspended account, invalid refresh token, system category deletion. |
| 404 | - | Unknown route or resource (also returned for resources of other users). |
| 409 | - | Conflict: duplicate (e-mail, category name, budget) or archived account. |
| 422 | `INSUFFICIENT_FUNDS` | The operation would take an account below its allowed floor (0, or `-overdraft_limit`). Applies to creating, editing and deleting transactions, goal contributions, recurring runs and CSV rows. |
| 422 | `OVERDRAFT_LIMIT_CONFLICT` | An account was created or its overdraft settings were changed so that the current balance would violate them. |
| 429 | - | Rate limited (`message` only). Verification lockouts add `retryAfterSeconds`. |
| 500 | - | `Internal Server Error` (details are never leaked). |

### Public

| Method | Path | Auth | Purpose | Notable errors |
|---|---|:---:|---|---|
| `GET` | `/api/health` | no | Health check `{ "status": "OK", ... }`. | - |
| `GET` | `/` | no | Plain-text banner `FlyWallets API v1.0`. | - |

### Authentication (`/api/auth`)

| Method | Path | Auth | Purpose | Notable errors |
|---|---|:---:|---|---|
| `POST` | `/api/auth/register` | no | Create an individual or business user, send the OTP e-mail, open a session and set the cookies. Returns `requiresEmailVerification: true`. Limit: 3 per hour per IP. | 400 validation, 409 duplicate e-mail / fiscal code / VAT / phone, 429 |
| `POST` | `/api/auth/login` | no | Log in and set the cookies. Does not require a verified e-mail. Limit: 5 **failed** attempts per 15 minutes per IP. | 401 invalid credentials, 403 disabled or suspended account, 429 |
| `POST` | `/api/auth/refresh-token` | refresh cookie | Rotate the refresh token and issue a new access token (the session is checked in the database). | 401 no cookie, 403 invalid / revoked session, 403 `REFRESH_TOKEN_REUSED` |
| `POST` | `/api/auth/logout` | no | Delete the session of the refresh cookie and clear both cookies. | - |
| `GET` | `/api/auth/me` | yes | Current user with profile and `email_verified`. | 404 |
| `PUT` | `/api/auth/profile` | yes | Update profile fields (identity fields such as fiscal code and VAT number are not editable). | 400, 409 |
| `POST` | `/api/auth/verify-email` | yes | Body `{ code }` (6 digits). Max 3 attempts, then locked for 15 minutes. Limit: 20 per 10 minutes per IP. | 400 invalid / expired code (`attemptsLeft`), 429 locked (`retryAfterSeconds`) |
| `POST` | `/api/auth/resend-verification` | yes | Send a new OTP (replaces pending ones). Limit: 3 per 10 minutes per user, refused while locked. | 429 |
| `POST` | `/api/auth/forgot-password` | no | Body `{ email }`. Always answers 200 so accounts cannot be discovered. Limit: 3 per 10 minutes per normalised e-mail, 20 per 10 minutes per IP. | 400 invalid e-mail, 429 |
| `POST` | `/api/auth/reset-password` | no | Body `{ token, password }`. Token is single use (1 hour); on success every session of the user is deleted. | 400 invalid / expired link or weak password, 429 |

### Accounts (`/api/accounts`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/accounts` | Manual and bank accounts in one list with balance, type, overdraft settings. Archived manual accounts are hidden. | - |
| `POST` | `/api/accounts/manual` | Create a manual account: `account_name`, `account_type` (`checking`, `savings`, `wallet`, `cash`), optional `initial_balance`, `color_tag`, `icon_emoji`, `description`, `overdraft_allowed`, `overdraft_limit`. Writes the first balance snapshot. | 400, 422 `OVERDRAFT_LIMIT_CONFLICT` (negative balance without overdraft) |
| `PUT` | `/api/accounts/manual/:id` | Update name, colour, icon, description and overdraft settings (`overdraft_limit: null` = unlimited). The balance only changes through transactions. | 404, 422 `OVERDRAFT_LIMIT_CONFLICT` |
| `DELETE` | `/api/accounts/manual/:id` | Delete an empty account; archive it (`data.archived: true`) when it has transactions. | 404 |
| `GET` | `/api/accounts/:id/history` | Daily balance snapshots `[{ date, balance }]`. Query: `from_date`, `to_date`. | 400 |

### Categories (`/api/categories`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/categories` | System categories plus the user's custom ones. | - |
| `POST` | `/api/categories` | Create a custom category: `category_name`, `category_type` (`income`, `expense`, `both`), `color_tag`, `icon_emoji`. | 409 duplicate name |
| `DELETE` | `/api/categories/:id` | Delete a custom category (transactions keep existing, uncategorised). | 403 system category, 404 |

### Transactions (`/api/transactions`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/transactions` | Query: `account_id`, `category_id`, `type` (`income` / `expense`), `from_date`, `to_date`, `search`, `page`, `limit` (default 20, max 100). Newest first. Returns `transactions` and `pagination`. | 400 |
| `POST` | `/api/transactions` | Body: `manual_account_id`, `transaction_date`, `amount` (> 0, max 2 decimals), `transaction_type`, `description`, optional `category_id` (a keyword-engine suggestion is stored when omitted), `notes`, `tags` (max 10), `savings_goal_id` (expenses only). Inserts, updates the balance and goal progress atomically. | 400 (date > 1 day ahead or > 10 years back, category type mismatch), 404 account / category / goal, 409 archived account, 422 `INSUFFICIENT_FUNDS` |
| `PUT` | `/api/transactions/:id` | Partial edit (at least one of `manual_account_id`, `transaction_date`, `amount`, `transaction_type`, `description`, `category_id`, `notes`, `tags`); reverts the old effect and applies the new one, also across accounts. | 400 (also for imported bank rows), 404, 409, 422 `INSUFFICIENT_FUNDS` |
| `DELETE` | `/api/transactions/:id` | Delete and reverse the amount on the account and on linked goals. | 400 (bank rows), 404, 409, 422 `INSUFFICIENT_FUNDS` (deleting an income that was already spent) |

### Savings goals (`/api/goals`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/goals` | Active goals with `progress_percentage`. | - |
| `POST` | `/api/goals` | Create: `goal_name`, `target_amount`, optional `target_date`, `description`, `color_tag`, `icon_emoji`. | 400 |
| `POST` | `/api/goals/:id/contribute` | Body `{ amount, manual_account_id? }`. With an account the contribution is also recorded as an expense on it; without one only the goal advances. | 404, 409, 422 `INSUFFICIENT_FUNDS` |
| `PUT` | `/api/goals/:id` | Update fields or `is_completed`. | 404 |
| `DELETE` | `/api/goals/:id` | Delete the goal (contribution transactions stay). | 404 |

### Budgets (`/api/budgets`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/budgets` | `period`, `summary` (totals, `warningCount`, `exceededCount`) and the budgets with `spent`, `remaining`, `percentage`, `status` (`ok`, `warning`, `exceeded`). | - |
| `GET` | `/api/budgets/alerts` | Active budgets in `warning` / `exceeded` state, most critical first, with a ready-made `message` (Italian text). | - |
| `POST` | `/api/budgets` | `category_id`, `monthly_limit`, optional `alert_threshold` (1-100, default 80). One budget per category. | 400 income category, 404 category, 409 duplicate |
| `PUT` | `/api/budgets/:id` | Change `monthly_limit`, `alert_threshold`, `is_active`. | 404 |
| `DELETE` | `/api/budgets/:id` | Delete a budget. | 404 |

### Recurring transactions (`/api/recurring`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/recurring` | First generates what is due (time-boxed to 2 s), then lists the rules; `data.processed` reports the generated count. | - |
| `POST` | `/api/recurring/process` | Run the generator now (time-boxed to 10 s); returns `created`, `errors`, `deactivated`, `pending`. | - |
| `GET` | `/api/recurring/:id` | One rule. | 404 |
| `POST` | `/api/recurring` | `manual_account_id`, `amount`, `transaction_type`, `description`, `frequency` (`daily`, `weekly`, `monthly`, `yearly`), `start_date` (`YYYY-MM-DD`, at most 366 days in the past), optional `end_date`, `category_id`. Due occurrences are generated immediately. Monthly / yearly rules keep the original day, clamped to the month length. | 400, 404, 409 archived account |
| `PUT` | `/api/recurring/:id` | Edit any field; `is_active: false` pauses, `true` resumes from today (the paused period is not back-filled). | 400, 404, 422 resuming a rule whose `end_date` passed |
| `DELETE` | `/api/recurring/:id` | Delete a rule (generated transactions stay). | 404 |

A failing occurrence (for example `INSUFFICIENT_FUNDS`) is rolled back alone, stored in the rule's `last_error` and retried at the next run. Generated transactions carry the tag `recurring`.

### Dashboard and charts (`/api/dashboard`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/dashboard` | `summary` (`totalBalance`, `monthlyIncome`, `monthlyExpense`, `netChangePercentage`), `accounts`, `recentTransactions` (8), `savingsGoals` (6), `categories`. | - |
| `GET` | `/api/dashboard/networth` | Daily total of the active manual accounts. Query: `days` = `30` (default), `90` or `365`. Returns `series`, `start`, `end`, `change`, `changePercentage`. | 400 |
| `GET` | `/api/dashboard/spending` | Expenses grouped by category for the window (top 6 plus "Other"). Query: `days` as above. | 400 |

### CSV import / export (`/api/data`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `GET` | `/api/data/export/transactions.csv` | Streams the user's transactions as UTF-8 CSV with BOM (max 50,000 rows, newest first). Query: the same filters as `GET /api/transactions` plus `delimiter` (`,` or `;`; with `;` amounts use a decimal comma). Headers `X-Export-Rows` and `X-Export-Truncated`. | 400 |
| `POST` | `/api/data/import/transactions` | Body: `manual_account_id`, `csv` (string), optional `delimiter` (`,` `;` tab `\|` or `auto`), `date_format` (`iso`, `dmy`, `mdy`, `auto`), `decimal_separator` (`.` `,` `auto`), `mapping` (column name or index for `date`, `amount`, `description`, `type`, `category`, `notes`, `tags`, `debit`, `credit`), `dry_run` (boolean). Returns the detected settings, a 10-row preview, counts of imported / duplicate rows and per-row errors. Limits: 1 MB of CSV, 2,000 rows, 2 MB request body (this route only). | 400 (unrecognisable columns, limits), 404, 409 archived account |

Import notes: duplicates (same account, day, amount, type and description, case-insensitive) are skipped, counted by multiplicity; each row has its own savepoint so a failing row (for example overdraft) only affects itself; with `dry_run: true` everything is rolled back. Rows without a mapped category are categorised with the keyword engine.

### AI (`/api/ai`)

| Method | Path | Purpose | Notable errors |
|---|---|---|---|
| `POST` | `/api/ai/categorize` | Body `{ description, amount?, transaction_type? }`. Returns `suggestion` (one of the user's real categories, `source` `ai` or `keywords`) and the active `provider`. Limit: 10 per minute per user. | 400, 429 |
| `GET` | `/api/ai/insights` | Exactly 3 tips from the last 30 days of spending (`source` `ai` or `rules`). Query: `lang=en\|it`. Limit: 10 per minute per user. | 429 |

---

## Optional integrations (e-mail, SMS, AI)

Everything works with **no external account**: the app falls back to the console and to deterministic rules.

### E-mail (OTP and password reset)

First configured provider wins:

1. **Resend**: set `RESEND_API_KEY` (and `SMTP_FROM` as the sender).
2. **SMTP** (Mailtrap, Mailpit, Gmail, SES...): set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, plus `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` as needed.
3. **None**: the OTP code or reset link is printed in the backend console. In `NODE_ENV=production` nothing is printed (secrets must not reach production logs) and an error is logged instead.

Reset links point to `${CLIENT_URL}/reset-password?token=...` (first `CLIENT_URL` entry). Sending never fails the user flow: provider errors are logged and the API still answers normally.

### SMS

`backend/src/services/smsService.js` can send through Twilio's REST API (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`) and logs to the console otherwise. **No route or controller calls it**: phone verification is not exposed (see [Roadmap](#roadmap-and-known-limits)).

### AI

```env
AI_PROVIDER=gemini        # or openai
GEMINI_API_KEY=...        # or OPENAI_API_KEY=...
```

Only the transaction description and amount (categorisation) or per-category totals (insights) are sent to the provider. Model output is treated as untrusted: a suggested category must match one of the user's real category names, calls time out after 8 seconds, and any failure degrades to the keyword engine. With `AI_PROVIDER=disabled` (or a missing key) categorisation uses keywords (for example "Esselunga" -> Cibo & Ristoranti, "Ricarica Iliad" -> Utenze, "Bonifico Stipendio" -> Stipendio) and insights use fixed rules. Model ids come from `GEMINI_MODEL` / `OPENAI_MODEL`; the defaults in the code could not be verified against the providers' catalogues, so set an id you know your key can use.

---

## Database

### Files

| File | Use |
|---|---|
| `database/schema.sql` | **Fresh installs.** Creates the extension, helper functions, 18 tables, indexes, triggers, RLS policies and the 25 system categories. It never drops anything and is not idempotent: run it once on an empty database (the Docker stack does this on first start). |
| `database/migrations/*.sql` | **Existing databases** created before a feature existed (see below). New installs do not need them: `schema.sql` already contains their changes. |
| `database/rls_app_role.sql` | Optional restricted role `flywallets_app` that makes RLS effective. |
| `database/reset.sql` | **Destructive.** Drops the original 16 tables and all their data (not `budgets` and `recurring_transactions`, which the script predates). |

### Migrations

Run them in order, once each, against the database used by `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -f database/migrations/001_budgets_recurring.sql   # budgets + recurring_transactions tables, indexes, triggers, RLS policies
psql "$DATABASE_URL" -f database/migrations/002_session_rotation.sql    # sessions.rotated_at (refresh-token rotation)
```

With the Docker database: `docker compose exec -T postgres psql -U postgres -d flywallets < database/migrations/001_budgets_recurring.sql`.

- `001` is not idempotent (`CREATE TABLE` without `IF NOT EXISTS`): it fails if the tables already exist. `002` is idempotent.
- If you already created the `flywallets_app` role, **re-run `database/rls_app_role.sql` after `001`** so the role also gets access to `budgets` and `recurring_transactions`.
- **Only these two changes have migrations.** A database created from an older `schema.sql` also lacks `email_verifications.code_hash` (OTP verification would fail), the partial unique indexes `uq_account_balances_manual_day` / `uq_account_balances_bank_day` (balance snapshots need them) and the tightened RLS policies. For a development database the simplest fix is to recreate it: `docker compose down -v` for the Docker volume, or drop the database and load `schema.sql` again. (`reset.sql` alone is not enough: it leaves `budgets` and `recurring_transactions` behind, so a following `schema.sql` would fail on them.) There is no migration tooling or schema-version table.

### Row-Level Security (RLS)

`schema.sql` enables RLS on every user-owned table with policies based on `current_user_id()`, which reads `app.current_user_id`. For every request on accounts, categories, transactions, goals, budgets, recurring, dashboard, CSV and AI, the backend opens a transaction, sets `app.current_user_id` (`set_config(..., true)`, equivalent to `SET LOCAL`) and then runs the queries, **in addition to** the `WHERE user_id = $1` filters.

The backend uses **two connection pools**:

| Pool | Variable | Used for |
|---|---|---|
| Owner pool | `DATABASE_URL` | Registration, login, sessions, OTP, password reset, audit log writes, the recurring scheduler's user discovery, the seed. |
| App pool | `DATABASE_APP_URL` (falls back to the owner pool) | Everything inside `req.withUser(...)` / `withUserContext(...)`. |

**Honest caveat: PostgreSQL superusers and table owners bypass RLS.** The policies are `ENABLE`d, not `FORCE`d. If the backend connects as `postgres` (the default when `DATABASE_APP_URL` is unset; the Docker stack sets it up for you) the policies exist but are **not enforced**, and isolation relies on the `WHERE user_id = ...` filters in the API only. In production the backend logs a warning at startup when `DATABASE_APP_URL` is missing. To enforce RLS at database level:

```bash
psql "$DATABASE_URL" -v app_password="'a-strong-password'" -f database/rls_app_role.sql
```

then add to `backend/.env`:

```env
DATABASE_APP_URL=postgresql://flywallets_app:a-strong-password@localhost:5432/flywallets
```

The role is `NOSUPERUSER NOBYPASSRLS`, has `SELECT/INSERT/UPDATE/DELETE` on the data tables, `SELECT` only on `users`, `user_individuals`, `user_businesses` and `audit_logs`, and no access to `sessions`, `email_verifications`, `phone_verifications` or `password_resets`. The integration tests verify cross-user isolation (including attaching rows to another tenant's account) when `TEST_DATABASE_APP_URL` is provided.

---

## Testing and CI

### Backend

```bash
cd backend
npm run lint
npm test            # node --test --test-concurrency=1 "tests/**/*.test.js"
```

The backend suite is made of integration tests (`node:test` + `supertest`) plus pure unit tests (CSV parser, recurring date arithmetic, budget thresholds, AI keyword engine). The integration tests **need PostgreSQL** with `schema.sql` loaded. Without a reachable database the DB-backed suites are skipped locally and **fail when `CI=true`**. They cover, among others: registration / login / cookies, OTP lockout, password reset, refresh rotation and reuse detection, balance atomicity, overdraft rules, snapshots, goals, budgets, recurring generation (including concurrency), CSV import / export, charts, the verified-e-mail gate, CORS and RLS isolation.

| Variable | Description |
|---|---|
| `TEST_DATABASE_URL` | Test database (owner role). Falls back to a local `DATABASE_URL`, then `postgresql://postgres:postgres@localhost:5432/flywallets`. |
| `TEST_DATABASE_APP_URL` | Optional: `flywallets_app` role, to also test RLS isolation. |

Safety net: the tests create and delete users, so they **refuse to run against a non-local database** (the host must be `localhost` or `127.0.0.1`; use `TEST_DATABASE_URL`). Test users use `@flywallets.test` addresses. Rate limiting is disabled under `NODE_ENV=test`.

### Frontend

```bash
cd frontend
npm run lint
npm test            # node --test "src/**/*.test.mjs"  (unit tests for src/lib)
npm run build
```

### CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`, with three jobs:

| Job | What it does |
|---|---|
| Backend (lint + tests) | `postgres:16-alpine` service, loads `schema.sql`, creates the RLS role (`rls_app_role.sql`), then `npm run lint` and `npm test` with `TEST_DATABASE_URL` and `TEST_DATABASE_APP_URL`. |
| Frontend (lint + tests + build) | `npm ci`, `npm run lint`, `npm test`, `npm run build`. |
| Docker (compose build) | `docker compose build` with placeholder secrets (nothing is started), then validates `deploy/docker-compose.prod.yml` with `docker compose config`. |

---

## Deployment notes

### Production with Docker (recommended)

[`deploy/README.md`](deploy/README.md) is the complete guide. In short:

- One server with Docker, one domain pointing at it, ports 80/443 open. Caddy terminates HTTPS (automatic certificates) and routes `/api/*` to the API and everything else to the web app, so both are served from the **same site** as the `SameSite=Strict` cookies require.
- `cp deploy/production.env.example deploy/.env`, set `DOMAIN` and generate the four secrets (JWT secrets and database passwords), then `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build`.
- The API runs with `NODE_ENV=production`, `TRUST_PROXY=1` and the restricted RLS role; PostgreSQL and the API are not published to the host and no demo data is loaded.
- Backups (`pg_dump`), updates, migrations, secret rotation and the limits of this setup (no monitoring, single instance, in-memory rate limits) are covered in `deploy/README.md`.

### Manual / PaaS deployment

The notes below apply if you do not use the Docker setup above.

- Set `NODE_ENV=production`: cookies get the `Secure` flag (HTTPS required) and the server refuses to start without strong secrets.
- Provide `JWT_SECRET` and `JWT_REFRESH_SECRET` (>= 32 random characters, different from each other):
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Set `CLIENT_URL` to the exact public origin(s) of the frontend and `NEXT_PUBLIC_API_URL` to the public API URL **before building** the frontend.
- **Same-site requirement**: auth cookies are `HttpOnly` with `SameSite=Strict`. Frontend and API must therefore be on the **same site**, e.g. `app.example.com` and `api.example.com` (subdomains of one registrable domain). Two unrelated domains (`my-app.vercel.app` + `my-api.onrender.com`) will not send the cookies, and login will appear to succeed but every following request will be unauthenticated. Ports do not matter (`localhost:3000` and `localhost:5000` are the same site).
- Behind a reverse proxy or PaaS (Render, Heroku, nginx) set `TRUST_PROXY=1` so rate limits use the real client IP.
- Managed PostgreSQL: keep `DB_SSL` at its default (SSL on for non-local hosts) or set it explicitly; load `database/schema.sql` once and create the RLS role (`database/rls_app_role.sql`) with a strong password, then set `DATABASE_APP_URL`. Note that the SSL option used connects without verifying the server certificate (`rejectUnauthorized: false`).
- The recurring scheduler runs inside every API process. With several instances each one runs it; rules are claimed with `FOR UPDATE SKIP LOCKED`, so occurrences are not duplicated, but you can set `RECURRING_SCHEDULER=off` on all but one instance.
- Never run `db:seed` against production (it refuses `NODE_ENV=production`) and never use `database/reset.sql` on live data.

---

## Security notes

- Passwords: bcrypt, 12 salt rounds. Policy (enforced by the API): >= 8 characters, one uppercase letter, one number, one of `@$!%*?&`.
- Cookies: `access_token` (15 minutes) and `refresh_token` (30 days) are `HttpOnly`, `SameSite=Strict`, and `Secure` when `NODE_ENV=production`. The frontend never reads or stores tokens. `SameSite=Strict` is the only CSRF defence (there are no CSRF tokens) and it implies the same-site deployment described above.
- Refresh tokens are stored only as SHA-256 in `sessions` and **rotated** on every refresh (the new session inherits the original 30-day expiry). Replaying a rotated token outside the 30 s grace window revokes every session of the user, clears the cookies and writes a `refresh_token_reuse` audit entry. Password reset revokes all sessions. Login purges expired sessions and sessions rotated more than 7 days ago.
- OTP codes are stored as an HMAC bound to the user (`JWT_SECRET`), reset tokens as SHA-256. Verification attempts are reserved atomically in SQL before the code is compared, so parallel guesses cannot exceed 3 attempts; after 3 wrong codes verification is locked for 15 minutes. Password reset requests answer identically for unknown e-mails.
- Rate limits: login 5 failed / 15 min / IP; registration 3 / hour / IP; OTP and reset e-mail requests 3 / 10 min per target (user, or normalised e-mail so `+` and dot aliases share a bucket); verify / forgot / reset 20 / 10 min / IP; authenticated API 120 / min / user; AI 10 / min / user. Limits are held in process memory (they reset on restart and are per instance). There is no per-account login lockout.
- CSV: exported text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading apostrophe (formula injection guard; import reverses it, so a round trip is lossless). Imports are limited to 1 MB / 2,000 rows and are validated and de-duplicated server-side.
- AI: only descriptions / category totals are sent to the provider, its output is validated against the user's real categories, and the AI endpoints have their own rate limit.
- Helmet headers, strict CORS allow-list with credentials, JSON body limit 100 kB (2 MB on the CSV import route only, after authentication), input validation on every write endpoint, generic 500 messages.
- Multi-tenant isolation through ownership filters plus PostgreSQL RLS (effective only with the restricted role, see above).
- No credentials are stored in the repository: `.env*` files are git-ignored except `.env.example`. If you ever committed a real secret, rotate it.

To report a vulnerability see [`SECURITY.md`](SECURITY.md).

---

## Roadmap and known limits

These things exist in the schema or in code but are **not wired into the product**, or are known limitations. Nothing below should be assumed to work.

| Area | State |
|---|---|
| **Bank connections (Open Banking / PSD2)** | Only a placeholder: the `bank_accounts` table (with encrypted-token columns) and read paths that would show bank accounts and their transactions. There is **no provider integration** (no Plaid / Tink / Fabrick code), nothing creates bank accounts, and the "Collega i tuoi conti" tagline is aspirational. All accounts are manual. |
| **SMS / phone verification** | `smsService.js` (Twilio) and the `phone_verifications` table exist, but **no endpoint calls them**. A phone number can be stored at registration or profile update; it is never verified (`users.phone_verified` is never set). |
| **Two-factor authentication** | The `two_factor_*` columns in `users` are **unused**. |
| **Payments / subscriptions** | `stripe_customer_id`, `subscription_plan`, `subscription_expires_at` are **unused** columns. |
| **Multi-currency** | Single EUR assumption: new accounts take the column default `EUR`, there is no currency selector, totals add balances without conversion and the UI formats everything as EUR. |
| **Recurring rules on bank accounts** | Rules require a manual account. |
| **CSV import scope** | One target account per import (the exported `account` column is ignored on import, so there is no multi-account file import). Supported date formats are ISO, `dd/mm/yyyy` and `mm/dd/yyyy` style text; **Excel serial dates and `.xlsx` files are not supported**. |
| **Time zones** | Everything is UTC end to end: "this month" for the dashboard and budgets starts at the first of the month 00:00 UTC, and recurring rules use UTC calendar dates. Users far from UTC can see a transaction counted in a different month around month boundaries. The dashboard's monthly income / expense also counts transactions dated up to 1 day ahead that fall in the current UTC month, while budgets and the spending chart only count transactions up to now. |
| **Transfers between accounts** | No transfer operation: record an expense and an income. |
| **Account management** | No change-password endpoint for signed-in users (only the e-mail reset flow), no account deletion, no list of active sessions / devices and no full personal-data export (only the transactions CSV). |
| **Terms / privacy consent** | The registration endpoint marks terms and privacy as accepted automatically; the registration form has no consent checkboxes and `marketing_consent` is never set. This needs a real consent step before a public launch. |
| **Notifications and themes** | Budget alerts exist only as the in-app bell. E-mail / push notification preferences and alternative themes are shown as "coming soon" on the settings page. |
| **Goals linked to accounts** | The `savings_goal_accounts` table is unused. |
| **Audit log** | `audit_logs` is written for register, login, forgot / reset password, e-mail verification, refresh-token reuse and CSV import; there is no endpoint or UI to read it. |
| **Migrations** | Only two incremental SQL files and no migration tool or version table (see [Database](#migrations)). |
| **Frontend hardening** | The Next.js app sets no Content-Security-Policy of its own (the API's Helmet headers apply to API responses only). The frontend route guard checks only that a `refresh_token` cookie exists; real authorisation happens in the API. |
| **Rate limiting storage** | In-memory per process: not shared between instances. |

---

## Contributing

Contributions are welcome.

1. Fork the repository and create a branch from `main`.
2. Keep changes focused; follow the existing code style.
3. Run `npm run lint` and `npm test` in `backend/`, and `npm run lint`, `npm test` and `npm run build` in `frontend/`.
4. Never commit secrets; update the `.env.example` files and this README when you add configuration or endpoints.
5. Open a pull request using the provided template. Use the issue forms for bugs and feature requests.

---

## License

Distributed under the **MIT** license. See [`LICENSE`](LICENSE) for details.
