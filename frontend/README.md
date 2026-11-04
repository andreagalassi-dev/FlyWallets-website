# FlyWallets Frontend

Web client for FlyWallets, a personal and business finance manager. It is a public landing page, the auth flow
(login, register, e-mail verification, password reset) and a client-rendered dashboard (accounts, transactions,
goals, budgets, recurring transactions, categories, statistics, profile, settings). All data comes from the
FlyWallets REST API in `../backend`; the endpoints are listed in the root `README.md`.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) with React 19, plain JavaScript
- Tailwind CSS 3 (dark UI, gold `primary` colour defined in `tailwind.config.js`)
- Zustand for client state (`persist` middleware for the signed-in user)
- Axios for API calls (`react-hook-form` is used in the login form; other forms use plain controlled inputs)
- `lucide-react` icons, `country-state-city` for country/state pickers
- No UI kit and no chart library: components, including the SVG charts, are hand-written

## Getting started

Requires Node.js 22 (the version used by CI and the Dockerfile) and a running backend (see the root `README.md`).

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

With Docker, the root `docker-compose.yml` builds this app with `frontend/Dockerfile` (Next.js standalone output).

### Environment

| Variable              | Default                     | Description                              |
| --------------------- | --------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api` | Base URL of the backend API (with `/api`) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Optional. Public URL of this app, used as `metadataBase` for the page metadata (Open Graph / Twitter). Not in `.env.example` |

Set it in `frontend/.env.local` (template: `frontend/.env.example`). It is inlined into the browser bundle at
build time, so rebuild after changing it (`next dev` reads it at startup; in Docker it is a build argument
derived from `BACKEND_PORT`). The backend must list this app's origin in its `CLIENT_URL` for CORS. If port 5000 is
taken (macOS AirPlay Receiver), run the API on another port and set e.g. `NEXT_PUBLIC_API_URL=http://localhost:5055/api`.

## Scripts

| Command         | What it does                                              |
| --------------- | --------------------------------------------------------- |
| `npm run dev`   | Development server with hot reload                        |
| `npm run build` | Production build (`output: "standalone"`, used by Docker) |
| `npm start`     | Serve the production build                                |
| `npm run lint`  | ESLint (`eslint-config-next`)                             |
| `npm test`      | Unit tests for `src/lib` (`node --test "src/**/*.test.mjs"`) |

The tests cover the pure helpers: `chartUtils`, `csvClient`, `demoCategorize`, `errors`, `format`, `overdraft`,
`passwordStrength` and `recurring`. There are no component or end-to-end tests. CI runs lint, tests and build.

## Routes

| Route | Page | Access |
| --- | --- | --- |
| `/` | Landing page: hero with dashboard preview, in-browser categorisation demo (`lib/demoCategorize.js`, no API call), features, how it works, call to action | public |
| `/login`, `/register`, `/forgot-password` | Auth forms (redirect to `/dashboard` when a session cookie exists) | guests |
| `/register/verify-email` | 6-digit e-mail OTP entry, 60 s resend cooldown, 15 minute lockout countdown | signed-in, also right after signup |
| `/reset-password?token=...` | New password with strength meter (token from the e-mail link) | public |
| `/dashboard` | Overview: total balance, month income / expense, net worth and spending charts, accounts, recent transactions, goals; quick-create modals | signed-in |
| `/dashboard/accounts` | Manual accounts (create, edit incl. overdraft settings, delete / archive) | signed-in |
| `/dashboard/transactions` | Filterable, paginated list; create, edit, delete; CSV import and export menu | signed-in |
| `/dashboard/goals` | Savings goals: create, edit, contribute, delete | signed-in |
| `/dashboard/budgets` | Monthly budgets per category with progress bars and alert thresholds | signed-in |
| `/dashboard/recurring` | Recurring rules: create, edit, pause / resume, delete, "run now" | signed-in |
| `/dashboard/categories` | Custom categories (system ones are read-only) | signed-in |
| `/dashboard/stats` | AI / rule-based insights (last 30 days) and the spending chart | signed-in |
| `/dashboard/profile` | Profile editing (identity fields are read-only) | signed-in |
| `/dashboard/settings` | Account summary and logout; appearance and notification preferences are placeholders ("coming soon") | signed-in |

## Project structure

```
src/
  app/                  Routes (App Router)
    page.js             Landing page
    login, register, register/verify-email, forgot-password, reset-password   Public auth flow
    dashboard/          Authenticated area: layout.js (sidebar, header, mobile drawer) and pages:
                        overview, accounts, transactions, goals, budgets, recurring, categories,
                        stats, profile, settings
  components/
    ui/                 Generic building blocks: Button, Input, Select, Card, Modal (+ Field, FormError),
                        Pickers (colour/emoji), PasswordStrength, Skeleton, Toaster
    layout/             Sidebar (also exports the shared menu), MobileNav (off-canvas drawer), Header
                        (global transaction search), BudgetBell (budget alert badge + dropdown)
    dashboard/          Domain components: AccountCard, TransactionRow, GoalProgress, BudgetBar, OverdraftFields,
                        create/edit modals (account, transaction, goal, budget, recurring rule),
                        ImportCsvModal and ImportExportMenu (CSV)
    charts/             AreaChart (net worth), DonutChart (spending by category), RangeSelector (30D / 90D / 1Y),
                        ChartCards (data-fetching wrappers), useChartSize
    landing/            Sections of the public landing page and landing.css
    brand/              Logo
  lib/                  Framework-free helpers: api (Axios instance + refresh interceptor), errors, format, colors,
                        passwordStrength, chartUtils, csvClient, overdraft, recurring, demoCategorize
                        (unit-tested via *.test.mjs)
  store/                Zustand stores: authStore (user), toastStore (notifications)
  hooks/                useApiData (GET + loading/error/reload), useBudgetAlerts (polls /budgets/alerts), useLogout
  proxy.js              Route guard (see below)
```

## Authentication

The backend issues `access_token` (15 minutes) and `refresh_token` (30 days) as **HttpOnly cookies**; the frontend
never reads or stores tokens. Only the user object is kept in `authStore` (persisted in localStorage as
`flywallets-auth`) to render names and avatars.

- `src/lib/api.js` creates the Axios instance with `withCredentials: true`. On a `401` from a non-`/auth/*`
  call it calls `/auth/refresh-token` once (parallel failures share one refresh) and retries the request; if
  the refresh fails it redirects to `/login`. The backend rotates the refresh token on every refresh.
- The same interceptor handles two `403` codes: `EMAIL_NOT_VERIFIED` shows a toast with a "Verify now" link, and
  `REFRESH_TOKEN_REUSED` (all sessions were revoked) logs the user out locally and redirects to `/login` with a
  toast.
- `src/proxy.js` (Next.js 16 proxy, formerly "middleware") runs on every route and checks only for the
  presence of the `refresh_token` cookie: `/dashboard/*` without it redirects to `/login`; `/login`,
  `/register` and `/forgot-password` with it redirect to `/dashboard`. `/register/verify-email` and
  `/reset-password` are reachable in both states. This is a UX guard only; the API enforces real
  authorisation.

Because the cookies are `SameSite=Strict`, the frontend and the API must be served from the same site (see
"Deployment notes" in the root `README.md`).

## Conventions

- UI copy is English (the budget alert messages come from the API in Italian); money and dates go through
  `src/lib/format.js` (it-IT locale, EUR).
- Pages are client components (`"use client"`) that load data with `useApiData(path)` and render a
  `Skeleton` while loading and an error card on failure.
- User feedback uses the toast store: `import { toast } from "@/store/toastStore"` then
  `toast.success(...)` / `toast.error(...)`. Turn API errors into messages with `getErrorMessage` /
  `getFriendlyErrorMessage` from `src/lib/errors.js`.
- Forms in modals use `Modal`, `Field` and `FormError` from `components/ui/Modal`; backend validation
  errors (`{ errors: [{ msg, path }] }`) are shown inline or via toast. Business-rule errors carry a `code`
  (`INSUFFICIENT_FUNDS`, `OVERDRAFT_LIMIT_CONFLICT`, ...) that the UI maps to friendly messages.
- Identity fields (`fiscal_code`, `vat_number`) are read-only in the UI and never sent on profile updates.
- Navigation items live in one place (`menuItems` in `components/layout/Sidebar.jsx`) and are shared by the
  desktop sidebar and the mobile drawer. Profile is reached from the header avatar and settings from the sidebar footer.
- Use the Tailwind theme colours (`primary`, `secondary`, `background`) and `twMerge`/`clsx` for class
  composition. Add pure logic to `src/lib` with a `*.test.mjs` next to it.
