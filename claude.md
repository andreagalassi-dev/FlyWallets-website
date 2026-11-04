# 🚀 FlyWallets - Piano di Finalizzazione e Rilascio

Questo documento rappresenta la **guida operativa e direttiva tecnica per l'agente esecutore**.  
Contiene la roadmap dettagliata, le specifiche architetturali e i requisiti implementativi per portare **FlyWallets** dallo stato attuale (prototipo auth) a un'applicazione fintech full-stack completamente funzionante, sicura e pronta per la pubblicazione su GitHub.


> **✅ Stato (novembre 2026): le Fasi 1–7 sono implementate.** Per la documentazione aggiornata vedere `README.md` e `instructions/features_overview.md`.
> Scostamenti rispetto al piano originale: RLS con doppio pool (`DATABASE_URL` + `DATABASE_APP_URL`, `database/rls_app_role.sql`) perché i superuser aggirano la RLS; OTP salvato come HMAC in `email_verifications.code_hash`; `apiLimiter` 120 req/min per utente; AI con fallback deterministico; in più rispetto al piano: modifica transazioni, scoperto, budget, ricorrenze, import/export CSV, grafici, landing page, Docker.
> **Aperto:** la voce "Sanitizzazione Git History" (1.1) non è stata eseguita: la password di database Render presente nella history va **ruotata** dal pannello Render.

---

## 📋 Indice delle Fasi di Lavoro

1. [Fase 1: Sicurezza & Hardening Infrastrutturale](#fase-1-sicurezza--hardening-infrastrutturale)
2. [Fase 2: Servizi di Comunicazione Reali (Email & SMS)](#fase-2-servizi-di-comunicazione-reali-email--sms)
3. [Fase 3: Backend - Endpoint Core Mancanti (Conti, Transazioni, Dashboard)](#fase-3-backend---endpoint-core-mancanti)
4. [Fase 4: Integrazione AI per Categorizzazione & Financial Advisor](#fase-4-integrazione-ai-per-categorizzazione--financial-advisor)
5. [Fase 5: Frontend - Collegamento Dati Reali & UI Interattiva](#fase-5-frontend---collegamento-dati-reali--ui-interattiva)
6. [Fase 6: Script di Seeding & Test Automatizzati](#fase-6-script-di-seeding--test-automatizzati)
7. [Fase 7: Preparazione Finale per GitHub & Rilascio](#fase-7-preparazione-finale-per-github--rilascio)

---

## 🔒 Fase 1: Sicurezza & Hardening Infrastrutturale

### 1.1 Bonifica Credenziali e Variabili d'Ambiente
- [x] **Pulizia file `.env` locale**: Assicurarsi che nessuna credenziale di produzione/sviluppo (es. password Render precedente) sia salvata in chiaro o referenziata nel codice.
- [ ] **Sanitizzazione Git History**: Se necessario, verificare che i commit storici non contengano chiavi API valide o token JWT; invitare a rigenerare eventuali password di database esposte.
- [x] **CORS Dinamico**: In `backend/src/server.js`, sostituire l'origine cablata `"http://localhost:3000"` con un array supportato da variabile `CLIENT_URL` (es. `process.env.CLIENT_URL || "http://localhost:3000"`), supportando più origini se separate da virgola.

### 1.2 Row-Level Security (RLS) Application Context
- [x] **Impostazione Context Tenant**: Creare un middleware `backend/src/middleware/rlsMiddleware.js` che, per ogni connessione/transazione SQL dell'utente autenticato, esegua:
  ```sql
  SET LOCAL app.current_user_id = '<USER_UUID>';
  ```
  Questo attiva a livello di database le policy RLS definite in `database/schema.sql` (funzione `current_user_id()`), garantendo isolamento a livello DB oltre ai filtri `WHERE user_id = $1` a livello API.

### 1.3 Rate Limiting Differenziato & Protezione DoS
- [x] Configurare limiter specifici in `backend/src/middleware/rateLimitMiddleware.js`:
  - `otpLimiter`: Max 3 richieste OTP ogni 10 minuti per IP/email.
  - `apiLimiter`: 120 richieste/minuto per utente autenticato.

---

## 📧 Fase 2: Servizi di Comunicazione Reali (Email & SMS)

Attualmente gli endpoint `verify-email`, `forgot-password` e `reset-password` sono dei semplici mock in `authController.js`. Vanno trasformati in servizi reali e configurabili da `.env`.

### 2.1 Modulo Email (`backend/src/services/emailService.js`)
- [x] Creare il servizio email con supporto **Nodemailer** (o **Resend** via API) con fallback a log in console se le credenziali non sono presenti:
  - Variabili d'ambiente da supportare:
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
    - In alternativa `RESEND_API_KEY`
  - Se configurato: invia una vera email HTML con template FlyWallets.
  - Se non configurato: stampa chiaramente il codice OTP o il token di reset nella console del backend (fondamentale per sviluppo locale senza credenziali SMTP esterne).

### 2.2 Flusso OTP & Token di Verifica
- [x] **Generazione OTP 6 cifre**:
  - Salvare l'hash dell'OTP (o memorizzarlo temporaneamente in tabella `email_verifications` o store in-memory con TTL 10 minuti).
  - Incrementare contatore `attempts` (blocco dopo 3 tentativi errati fino a `locked_until`).
- [x] **Flusso Password Reset**:
  - Endpoint `POST /api/auth/forgot-password`: genera un token crittografico random `crypto.randomBytes(32).toString('hex')`.
  - Salva hash SHA-256 in `password_resets` con scadenza a 1 ora.
  - Invia email con link: `${CLIENT_URL}/reset-password?token=${rawToken}`.
  - Endpoint `POST /api/auth/reset-password`: convalida token, verifica scadenza, aggiorna password con bcrypt e invalida le sessioni attive in `sessions`.

### 2.3 Provider SMS (`backend/src/services/smsService.js`)
- [x] Strutturare il servizio SMS (es. compatibile con Twilio o AWS SNS):
  - Variabili: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
  - Modalità sviluppo: se non configurato, logga il codice OTP SMS nel terminale e restituisce esito positivo.

---

## 💼 Fase 3: Backend - Endpoint Core Mancanti

Il database dispone già delle tabelle relazionali per conti, movimenti e categorie, ma mancano i relativi moduli Express.

### 3.1 Modulo Conti (`backend/src/controllers/accountController.js` e `accountRoutes.js`)
Rotte protette con `authenticateToken`:
- [x] `GET /api/accounts`: Ritorna la lista unificata di tutti i conti dell'utente (`manual_accounts` + `bank_accounts`) con saldo attuale e tipo.
- [x] `POST /api/accounts/manual`: Creazione di un conto manuale:
  - Campi: `account_name`, `account_type` (`checking`, `savings`, `wallet`, `cash`), `initial_balance`, `color_tag`, `icon_emoji`, `description`.
  - Salva saldo iniziale e imposta `current_balance`.
  - Crea automaticamente uno snapshot iniziale in `account_balances`.
- [x] `PUT /api/accounts/manual/:id`: Modifica nome, colore, icona, descrizione.
- [x] `DELETE /api/accounts/manual/:id`: Archiviazione o cancellazione sicura con verifica ownership `user_id`.
- [x] `GET /api/accounts/:id/history`: Storico dei saldi giornalieri da `account_balances` per grafici.

### 3.2 Modulo Categorie (`backend/src/controllers/categoryController.js` e `categoryRoutes.js`)
- [x] `GET /api/categories`: Ritorna le categorie di sistema (`is_system = true`) più quelle personalizzate dell'utente loggato.
- [x] `POST /api/categories`: Creazione categoria personalizzata (`category_name`, `category_type`, `color_tag`, `icon_emoji`).
- [x] `DELETE /api/categories/:id`: Eliminazione categorie personalizzate (non eliminabili quelle di sistema).

### 3.3 Modulo Transazioni (`backend/src/controllers/transactionController.js` e `transactionRoutes.js`)
- [x] `GET /api/transactions`:
  - Supporto filtri: `account_id`, `category_id`, `type` (`income`/`expense`), `from_date`, `to_date`, `search` (testo in descrizione).
  - Paginazione: `page`, `limit` (default 20).
  - Ordinamento decrescente per `transaction_date`.
- [x] `POST /api/transactions`:
  - Input: `manual_account_id`, `transaction_date`, `amount`, `transaction_type`, `description`, `category_id`, `notes`, `tags`.
  - **Transazione Atomica SQL (`BEGIN...COMMIT`)**:
    1. Inserisce la riga in `transactions`.
    2. Aggiorna istantaneamente `current_balance` del conto `manual_accounts` collegato:
       - Se `income`: `current_balance = current_balance + amount`
       - Se `expense`: `current_balance = current_balance - amount`
    3. Se collegato a un `savings_goal`, aggiorna il progresso del goal.
- [x] `DELETE /api/transactions/:id`:
  - Elimina la transazione e storna l'importo dal conto associato.

### 3.4 Modulo Obiettivi di Risparmio (`backend/src/controllers/goalController.js` e `goalRoutes.js`)
- [x] `GET /api/goals`: Lista obiettivi con calcolo percentuale `(current_amount / target_amount) * 100`.
- [x] `POST /api/goals`: Creazione obiettivo (`goal_name`, `target_amount`, `target_date`, `color_tag`, `icon_emoji`).
- [x] `POST /api/goals/:id/contribute`: Aggiunge un versamento all'obiettivo (con creazione transazione opzionale).
- [x] `PUT /api/goals/:id`: Modifica parametri obiettivo o stato (`is_completed`).
- [x] `DELETE /api/goals/:id`: Rimozione obiettivo.

### 3.5 Endpoint Consolidato Dashboard (`GET /api/dashboard`)
- [x] `GET /api/dashboard`:
  - In una singola chiamata ottimizzata (o query aggregate parallele) ritorna:
    ```json
    {
      "status": "success",
      "data": {
        "summary": {
          "totalBalance": 5240.50,
          "monthlyIncome": 2500.00,
          "monthlyExpense": 850.30,
          "netChangePercentage": 4.5
        },
        "accounts": [ ... ],
        "recentTransactions": [ ... ],
        "savingsGoals": [ ... ],
        "categories": [ ... ]
      }
    }
    ```

---

## 🤖 Fase 4: Integrazione AI per Categorizzazione & Financial Advisor

Per rispondere ai requisiti moderni ed elevare il valore del progetto su GitHub, aggiungere un modulo AI opzionale ma completamente integrato.

### 4.1 Modulo `backend/src/services/aiService.js`
- [x] Supportare un provider LLM flessibile via variabile `AI_PROVIDER` (`gemini`, `openai` o `disabled`):
  - Variabili: `GEMINI_API_KEY` o `OPENAI_API_KEY`.
- [x] **Feature 1: Auto-Categorizzazione Transazioni**:
  - Funzione `categorizeTransaction(description, amount)`: riceve una causale (es. "Esselunga Milano", "Ricarica Iliad", "Bonifico Stipendio") e restituisce la categoria e l'emoji più probabili confrontandole con le categorie presenti a DB.
- [x] **Feature 2: Financial Health Insights**:
  - Endpoint `GET /api/ai/insights`: analizza la distribuzione delle spese degli ultimi 30 giorni e restituisce 3 consigli sintetici di ottimizzazione finanziaria in formato JSON.
- [x] **Graceful Degradation**: Se nessuna chiave AI è configurata, l'app usa una categorizzazione deterministica basata su parole chiave senza andare in errore.

---

## 💻 Fase 5: Frontend - Collegamento Dati Reali & UI Interattiva

### 5.1 Dashboard Connessa (`frontend/src/app/dashboard/page.js`)
- [x] Sostituire tutti i dati hardcoded (`€ 0.00`) con un fetch reale verso `GET /api/dashboard`.
- [x] Implementare skeleton di caricamento con stati di loading e gestione errori.
- [x] Visualizzare il saldo totale reale, la lista dei conti dell'utente, le ultime transazioni con badge colorati ed emoji, e le barre di progresso degli obiettivi di risparmio.

### 5.2 Modali & Form Interattivi
- [x] **Modale "Crea Conto Manuale"**: form con selezione tipo conto, saldo iniziale, colore e icona emoji.
- [x] **Modale "Nuova Transazione"**: selettore conto, data, importo, tipo (Entrata/Uscita), categoria dropdown con suggerimento AI opzionale, note.
- [x] **Modale "Nuovo Obiettivo"**: titolo, importo target, data scadenza desiderata.

### 5.3 Pagine Flusso Auth Mancanti
- [x] **Pagina `/register/verify-email`**: interfaccia di inserimento codice OTP a 6 cifre, countdown per reinvio codice e gestione lockout.
- [x] **Pagina `/forgot-password`**: form inserimento email e notifica di invio link.
- [x] **Pagina `/reset-password`**: lettura token dalla query string (`?token=...`), campi nuova password e conferma con meter di sicurezza.

### 5.4 Toast & Feedback UI
- [x] Introdurre un semplice sistema di notifiche toast (senza dipendenze pesanti, es. Zustand store o `sonner`) per conferme di salvataggio, errori di rete e avvisi.

---

## 🧪 Fase 6: Script di Seeding & Test Automatizzati

### 6.1 Database Seed (`backend/src/scripts/seed.js`)
- [x] Creare uno script eseguibile con `npm run db:seed` in `backend`:
  - Pulisce o popola il DB con un utente di test:
    - Email: `demo@flywallets.local`
    - Password: `Password123!`
  - Inserisce 3 conti manuali ("Conto Principale", "Fondo Risparmio", "Portafoglio Contanti").
  - Inserisce 15 transazioni di esempio nell'ultimo mese (spesa, stipendio, abbonamenti).
  - Inserisce 2 obiettivi ("Vacanza Estiva", "Fondo Emergenza").
  - Questo permette a chiunque cloni il repository su GitHub di testare l'app al 100% in 30 secondi.

### 6.2 Test di Integrazione & Sanità
- [x] Aggiungere test basilari in `backend` (con `node:test` o `jest`/`supertest`):
  - Verifica salute endpoint `/api/health`.
  - Test flusso registrazione e login.
  - Test calcolo saldo dopo transazione.
- [x] Aggiungere comando `npm test` funzionante nel `package.json` sia di frontend che di backend.

---

## 🚀 Fase 7: Preparazione Finale per GitHub & Rilascio

### 7.1 Allineamento Git & Branching
- [x] Verificare che non rimangano file non tracciati indesiderati.
- [x] Assicurarsi che `frontend/.next` e `node_modules` siano rigorosamente ignorati.
- [x] Eseguire il merge o il rebase del branch di lavoro su `main`.

### 7.2 GitHub Repository Assets
- [x] Creare cartella `.github/workflows/`:
  - `ci.yml`: GitHub Actions per eseguire build del frontend (`npm run build`) e lint/test del backend su ogni pull request.
- [x] Aggiungere badge di stato GitHub Actions in cima al `README.md`.
- [x] Creare `.github/ISSUE_TEMPLATE/` e `PULL_REQUEST_TEMPLATE.md` per incoraggiare contributi open-source puliti.

---

## 📌 Sintesi Variabili d'Ambiente da Configurare

### File: `backend/.env`
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flywallets
DB_SSL=false

# Autenticazione JWT
JWT_SECRET=generare_chiave_casuale_sicura_almeno_32_caratteri
JWT_REFRESH_SECRET=generare_altra_chiave_casuale_sicura_almeno_32_caratteri

# Email Service (opzionale per prod, fallback su console log in dev)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=
SMTP_PASS=
SMTP_FROM="FlyWallets <no-reply@flywallets.local>"

# SMS Service (opzionale)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# AI Service (opzionale, "gemini", "openai" o "disabled")
AI_PROVIDER=disabled
GEMINI_API_KEY=
OPENAI_API_KEY=
```

### File: `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 🎯 Direttiva per l'Agente Esecutore

> **Regola d'oro**: Procedere in ordine di fase (**Fase 1 ➔ Fase 7**). Ogni modulo creato deve mantenere il supporto a TypeScript/JavaScript esistente, seguire la convenzione di codice già presente e verificare la compatibilità con il frontend prima di considerare completato ogni step. Non cancellare mai file di documentazione esistenti in `instructions/`.

