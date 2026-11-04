# FlyWallets - Panoramica delle Funzionalità e Mappa del Codice

> Documento di sintesi, aggiornato al codice. Per i dettagli vedere il `README.md` principale (API, variabili d'ambiente, avvio) e gli altri file in `instructions/`
> (flusso di autenticazione, dashboard, schema DB, sicurezza), che contengono anche le specifiche originali con i blocchi **"Stato implementazione"**.
> Legenda: ✅ implementato, ⚠️ parziale, ❌ non implementato.

---

## 1. Architettura in breve

- **Backend**: Node.js 22 + Express 5 (`backend/src`), PostgreSQL 16 (`database/schema.sql`). Entry point `server.js` (ascolta e avvia lo scheduler delle ricorrenze), app Express in `app.js` (esportata per i test).
- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind 3 (`frontend/src`). Route guard in `src/proxy.js`.
- **Pipeline di una richiesta dati**: `authenticateToken` → `apiLimiter` (120/min/utente) → `rlsContext` (`req.withUser`) → `requireVerifiedEmail` (solo con `REQUIRE_VERIFIED_EMAIL=true`, solo scritture) → controller.
- **Ledger unico**: `services/ledgerService.js` contiene tutta la logica che tocca i saldi (creazione/modifica/eliminazione di transazioni, contributi agli obiettivi, scoperto, snapshot giornalieri). Transazioni, ricorrenze e import CSV lo riusano.
- **Due pool PostgreSQL**: `DATABASE_URL` (owner: autenticazione, seed, scheduler) e `DATABASE_APP_URL` (ruolo `flywallets_app`, soggetto a RLS: tutte le rotte dati). Senza `DATABASE_APP_URL` la RLS non è applicata.

## 2. Moduli

| Modulo | Stato | Backend (`backend/src`) | Frontend (`frontend/src`) | Test (`backend/tests`) |
|--------|:-----:|-------------------------|---------------------------|------------------------|
| Autenticazione (registrazione, login, refresh con rotazione, logout, profilo) | ✅ | `routes/authRoutes.js`, `controllers/authController.js`, `utils/security.js`, `middleware/authMiddleware.js` | `app/login`, `app/register`, `lib/api.js`, `store/authStore.js`, `proxy.js`, `app/dashboard/profile` | `auth.test.js`, `refresh-rotation.test.js`, `regression.test.js` |
| Verifica email (OTP) e reset password | ✅ | `authController.js` (`verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`), `services/emailService.js` | `app/register/verify-email`, `app/forgot-password`, `app/reset-password` | `auth.test.js`, `regression.test.js` |
| Gate "email verificata" (opzionale) | ✅ | `middleware/verifiedEmailMiddleware.js` | gestione del codice `EMAIL_NOT_VERIFIED` in `lib/api.js` | `core-ledger.test.js` |
| Conti manuali (con scoperto) | ✅ | `routes/accountRoutes.js`, `controllers/accountController.js` | `app/dashboard/accounts`, `components/dashboard/{CreateAccountModal,EditAccountModal,OverdraftFields}.jsx` | `ledger.test.js`, `core-ledger.test.js` |
| Transazioni (crea/modifica/elimina, filtri, paginazione) | ✅ | `routes/transactionRoutes.js`, `controllers/transactionController.js`, `services/ledgerService.js` | `app/dashboard/transactions`, `components/dashboard/{NewTransactionModal,EditTransactionModal,TransactionRow}.jsx` | `ledger.test.js`, `core-ledger.test.js`, `ledger-batching.test.js` |
| Categorie (sistema + personalizzate) | ✅ | `routes/categoryRoutes.js`, `controllers/categoryController.js` | `app/dashboard/categories` | `ledger.test.js` |
| Obiettivi di risparmio | ✅ | `routes/goalRoutes.js`, `controllers/goalController.js` | `app/dashboard/goals`, `components/dashboard/{NewGoalModal,EditGoalModal,GoalProgress}.jsx` | `ledger.test.js`, `regression.test.js` |
| Budget mensili e avvisi | ✅ | `routes/budgetRoutes.js`, `controllers/budgetController.js` | `app/dashboard/budgets`, `components/dashboard/{BudgetBar,BudgetModals}.jsx`, `components/layout/BudgetBell.jsx`, `hooks/useBudgetAlerts.js` | `budgets.test.js` |
| Transazioni ricorrenti + scheduler | ✅ | `routes/recurringRoutes.js`, `controllers/recurringController.js`, `services/recurringService.js` (scheduler avviato da `server.js`) | `app/dashboard/recurring`, `components/dashboard/RecurringFormModal.jsx`, `lib/recurring.js` | `recurring.test.js` |
| Import / export CSV | ✅ | `routes/importExportRoutes.js`, `controllers/importExportController.js`, `services/{csvService,importService}.js` | `components/dashboard/{ImportCsvModal,ImportExportMenu}.jsx`, `lib/csvClient.js` | `csv.test.js` |
| Dashboard consolidata e grafici | ✅ | `routes/dashboardRoutes.js`, `controllers/dashboardController.js` | `app/dashboard/page.js`, `components/charts/*`, `lib/chartUtils.js` | `ledger.test.js`, `dashboard-charts.test.js` |
| AI (categorizzazione, insight) con fallback deterministico | ✅ | `routes/aiRoutes.js`, `controllers/aiController.js`, `services/aiService.js` | `app/dashboard/stats`, `NewTransactionModal.jsx` (suggerimento categoria) | `ai.test.js`, `ledger.test.js` |
| Landing page pubblica | ✅ | - | `app/page.js`, `components/landing/*`, `lib/demoCategorize.js` | (test unitario frontend `demoCategorize.test.mjs`) |
| Row-Level Security | ⚠️ | `config/db.js` (`withUserContext`, due pool), `middleware/rlsMiddleware.js`, `database/rls_app_role.sql` | - | `ledger.test.js`, `regression.test.js` (con `TEST_DATABASE_APP_URL`) |
| Rate limiting | ✅ | `middleware/rateLimitMiddleware.js` | - | disattivato in `NODE_ENV=test` |
| Seed dati demo | ✅ | `scripts/seed.js` (`npm run db:seed`) | - | - |
| Conti bancari / Open Banking | ❌ | solo tabella `bank_accounts` e letture predisposte | - | - |
| SMS / verifica telefono | ❌ | `services/smsService.js` esiste, nessuna rotta lo chiama; tabella `phone_verifications` inutilizzata | - | - |
| 2FA, abbonamenti (Stripe), multi-valuta, trasferimenti tra conti | ❌ | colonne `two_factor_*`, `stripe_*`/`subscription_*` inutilizzate | - | - |

## 3. Regole di business da conoscere

- **Saldo**: entrata `+importo`, uscita `-importo` sul `current_balance` del conto, nella stessa transazione SQL dell'inserimento. Senza scoperto il saldo non può scendere sotto 0; con `overdraft_limit` non sotto `-limite`; con scoperto senza limite non ci sono vincoli (422 `INSUFFICIENT_FUNDS`). Le operazioni che *aumentano* il saldo sono sempre consentite.
- **Date**: transazioni al massimo 1 giorno nel futuro e 10 anni nel passato. Tutto in **UTC** (mese corrente = dal 1° alle 00:00 UTC).
- **Snapshot dei saldi** (`account_balances`): ricostruiti dal ledger dalla data più antica toccata fino a oggi; alimentano storico conto e grafico del patrimonio.
- **Conti**: un conto con transazioni viene archiviato (non eliminato); su conti archiviati non si può operare (409).
- **Obiettivi**: un contributo con conto registra una spesa sul conto e fa avanzare l'obiettivo; eliminare/modificare la transazione storna anche l'obiettivo.
- **Budget**: uno per categoria di spesa; `warning` oltre la soglia (default 80 %), `exceeded` al raggiungimento del limite; calcolati sul mese corrente.
- **Ricorrenze**: giorno del mese mantenuto con riduzione a fine mese; max 366 occorrenze per regola per esecuzione; occorrenza fallita (es. fondi insufficienti) ritentata al giro successivo, errore in `last_error`; la pausa non genera arretrati.
- **CSV**: import in un solo conto, rilevamento automatico di delimitatore/data/decimali, `dry_run`, deduplica per (conto, giorno, importo, tipo, descrizione), formula injection neutralizzata in export (e ripristinata in import).
- **Errori con `code`**: `INSUFFICIENT_FUNDS`, `OVERDRAFT_LIMIT_CONFLICT` (422), `EMAIL_NOT_VERIFIED` (403), `REFRESH_TOKEN_REUSED` (403).

## 4. Comandi utili

| Operazione | Comando |
|------------|---------|
| Stack completo in Docker | `cp .env.example .env` (impostare i due secret JWT) poi `docker compose up --build` |
| Dati demo (Docker) | `docker compose exec backend node src/scripts/seed.js --force` |
| Dati demo (locale) | `cd backend && npm run db:seed` (utente `demo@flywallets.local` / `Password123!`) |
| Sviluppo backend / frontend | `npm run dev` in `backend/` e in `frontend/` |
| Test e lint backend (serve PostgreSQL) | `cd backend && npm run lint && npm test` |
| Test, lint e build frontend | `cd frontend && npm run lint && npm test && npm run build` |
| Migrazioni DB esistenti | `psql "$DATABASE_URL" -f database/migrations/001_budgets_recurring.sql` poi `002_session_rotation.sql` |
| Ruolo RLS | `psql "$DATABASE_URL" -v app_password="'password-sicura'" -f database/rls_app_role.sql` e impostare `DATABASE_APP_URL` |
