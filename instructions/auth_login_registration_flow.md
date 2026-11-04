# Flusso Completo Login/Registrazione - Documentazione Dettagliata

## 1. PANORAMICA GENERALE

Questo documento descrive il flusso di **Registrazione** e **Login** per l'applicazione FlyWallets.

### Principi Fondamentali:

✅ **Sicurezza**: Ogni account è isolato e protetto  
✅ **Indipendenza**: Più utenti possono registrarsi/loggare simultaneamente  
✅ **Verifica Identità**: Email e telefono verificati prima di attivare l'account  
✅ **OTP Sicuro**: Codici generati in memoria, inviati via email/SMS, NON memorizzati  
✅ **Password Hash**: Password mai in chiaro, sempre hashate con bcrypt  
✅ **Session Management**: Token JWT con scadenza e refresh automatico  

> **Nota sullo stato del documento.** Questo file nasce come specifica di progetto (flusso a 6 step, OTP in Redis, SMS, ecc.).
> L'implementazione attuale (backend `backend/src/controllers/authController.js`, frontend `frontend/src/app/*`) è più semplice
> e in alcuni punti diversa. Le sezioni sotto restano come specifica di riferimento; in ogni sezione i blocchi
> **"Stato implementazione"** indicano cosa fa davvero il codice. Legenda: ✅ implementato, ⚠️ implementato in modo diverso,
> ❌ non implementato (solo pianificato).

## 1bis. STATO DI IMPLEMENTAZIONE (riepilogo aggiornato al codice)

| Tema | Specifica (questo documento) | Codice attuale | Stato |
|------|------------------------------|----------------|-------|
| Registrazione | 6 step, endpoint `register-step1`, `register-step3-*`, `register-finalize` | Un solo form (`/register`, scelta Privato/Azienda) e **una** chiamata `POST /api/auth/register`: crea `users` + `user_individuals`/`user_businesses` + OTP + sessione in un'unica transazione SQL e imposta i cookie | ⚠️ |
| Login | Blocca se email non verificata; ritorna i token nel JSON | `POST /api/auth/login`: **non** richiede email verificata; i token viaggiano solo nei cookie HttpOnly (il JSON contiene solo l'utente) | ⚠️ |
| Access token | 1 ora | **15 minuti** (`ACCESS_TTL`), cookie `access_token` | ⚠️ |
| Refresh token | 30 giorni, restituisce nuovo access token | 30 giorni, cookie `refresh_token`. **Rotazione a ogni refresh** con rilevamento del riuso (vedi 6.3) | ✅ (esteso) |
| Tabella `sessions` | `session_token` = hash dell'access JWT | `session_token` = **SHA-256 del refresh token**; colonna `rotated_at` per la rotazione | ⚠️ |
| OTP email | Generato in memoria/Redis, **non** salvato nel DB | Salvato **hashato** in `email_verifications.code_hash` (HMAC-SHA256 con `JWT_SECRET`, legato all'utente). Nessun Redis | ⚠️ |
| Endpoint verifica email | `send-otp-email`, `verify-email-otp {email, otp}` | `POST /api/auth/verify-email {code}` e `POST /api/auth/resend-verification` (entrambi autenticati: l'utente è già loggato dopo la registrazione) | ⚠️ |
| Lockout OTP | 3 tentativi, blocco 15 min | ✅ 3 tentativi (`max_attempts`), `locked_until` +15 min; il tentativo viene riservato in modo atomico in SQL prima del confronto | ✅ |
| Verifica telefono / SMS | Step 5 con OTP SMS | ❌ **Non implementato.** `smsService.js` (Twilio) esiste ma nessun endpoint lo chiama; la tabella `phone_verifications` e `users.phone_verified` non sono usate. Il numero di telefono viene solo salvato | ❌ |
| Reset password | `forgot` + `GET validate-reset-token` + `reset` + email di conferma | `POST /api/auth/forgot-password` (risponde sempre 200) e `POST /api/auth/reset-password`. **Non esiste** `validate-reset-token` e **non** viene inviata l'email "password cambiata" | ⚠️ |
| Rate limiting | login 5/15min, register 3/h, reset 3/h, OTP 3 tentativi | login: 5 tentativi **falliti**/15 min/IP; register 3/h/IP; richieste OTP/reset 3/10 min per utente o per email normalizzata; verify/forgot/reset 20/10 min/IP; API autenticata 120/min/utente; AI 10/min/utente. Contatori in memoria di processo | ✅ (valori diversi) |
| Lockout account dopo login falliti | "Lockout 30 min dopo >5 falliti" | ❌ Solo rate limit per IP, nessun lockout per account | ❌ |
| CSRF | SameSite + token CSRF + verifica Origin | Solo `SameSite=Strict` (+ CORS con allow-list). **Nessun token CSRF** | ⚠️ |
| Verifica email obbligatoria | Account attivo solo dopo verifica | Opzionale: `REQUIRE_VERIFIED_EMAIL=true` blocca le **scritture** (403 `EMAIL_NOT_VERIFIED`); letture e auth restano aperte | ⚠️ |
| Termini / Privacy / Marketing | Checkbox nel form | Il backend imposta `terms_accepted` e `privacy_accepted` a `true` in automatico; il form **non** ha checkbox e `marketing_consent` non viene mai impostato | ⚠️ |
| Password policy | 8+, maiuscola, minuscola, numero, speciale, no password comuni | Backend: 8+, 1 maiuscola, 1 numero, 1 carattere in `@$!%*?&`. Nessun controllo su minuscole né su liste di password comuni. Il frontend mostra un misuratore di robustezza (`PasswordStrength`) | ⚠️ |
| 2FA, device management, email "nuovo login" | Previsti | ❌ Non implementati (colonne `two_factor_*` inutilizzate; le sessioni sono salvate ma nessun endpoint le elenca) | ❌ |
| Audit log | Tutte le azioni di auth | Scritti: `register`, `login`, `forgot_password`, `reset_password`, `verify_email`, `refresh_token_reuse` (e `import_transactions` per il CSV). Non loggati: logout, reinvio OTP, login falliti | ⚠️ |

Mappa dei file: `backend/src/routes/authRoutes.js`, `backend/src/controllers/authController.js`,
`backend/src/utils/security.js` (bcrypt, JWT, SHA-256, OTP/HMAC), `backend/src/middleware/{authMiddleware,rateLimitMiddleware,validationMiddleware}.js`,
`backend/src/services/emailService.js`; frontend: `frontend/src/app/{login,register,register/verify-email,forgot-password,reset-password}/page.js`,
`frontend/src/lib/api.js` (refresh automatico), `frontend/src/proxy.js` (redirect guest/utente).


---

## 2. FLUSSO DI REGISTRAZIONE

### 2.1 Step 1 - Frontend: Form Registrazione Iniziale

> **Stato implementazione:** ⚠️ non esiste `POST /api/auth/register-step1` né una pagina per ogni step. `/register` è un unico form
> (email, password + conferma, tipo account, dati anagrafici/aziendali, indirizzo, telefono) che invia **una sola** `POST /api/auth/register`.
> Il backend controlla l'unicità dell'email (409 se già registrata), calcola l'hash bcrypt (12 round), salva utente e profilo, genera l'OTP,
> crea la sessione, imposta i cookie e risponde 201 con `requiresEmailVerification: true`. Non ci sono checkbox Termini/Privacy/Marketing.


**Pagina**: `/register` o `/signup`

**Campi da Compilare (Frontend)**:

| Campo | Tipo | Validazione Frontend | Obbligatorio |
|-------|------|---------------------|--------------|
| Email | TEXT | Regex email valida, lunghezza max 255 | ✅ |
| Password | PASSWORD | Min 8 caratteri, 1 maiuscola, 1 numero, 1 speciale | ✅ |
| Conferma Password | PASSWORD | Deve uguagliare password | ✅ |
| Termini Servizio | CHECKBOX | Deve essere spuntato | ✅ |
| Privacy Policy | CHECKBOX | Deve essere spuntato | ✅ |
| Marketing | CHECKBOX | Facoltativo | ❌ |

**Validazione Frontend**:
```
- Email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ + length <= 255
- Password: min 8 chars, ≥1 uppercase, ≥1 number, ≥1 special char (@#$%^&*)
- Password Confirm: equals password
- Termini: checked
- Privacy: checked
```

**Azioni Frontend**:
1. Utente compila form
2. Validazione lato client
3. Se valido → Disabilita pulsante e mostra loader
4. Invia POST a `/api/auth/register-step1`
5. Se successo → Passa a Step 2 (Scelta Tipo Account)

---

### 2.2 Step 2 - Frontend: Scelta Tipo Account

**Pagina**: `/register/type-selection` oppure stessa pagina con step

**Campi Scelta**:

| Scelta | Descrizione | Campo Successivo |
|--------|-------------|------------------|
| 📱 **Privato (Individual)** | Persona fisica | Procedi a Step 3 Privato |
| 🏢 **Azienda (Business)** | Azienda/Titolare | Procedi a Step 3 Business |

**Azioni Frontend**:
1. Utente seleziona tipo account
2. Memorizza scelta in variabile locale `userType`
3. Vai a Step 3 (diverso in base a scelta)

---

### 2.3 Step 3A - Frontend: Dati Personali (Privato)

> **Stato implementazione:** ⚠️ i dati vanno nella stessa `POST /api/auth/register` (nessun `register-step3-individual`). Il backend
> valida come obbligatori `first_name`, `last_name`, `fiscal_code`, `date_of_birth`, `place_of_birth` e l'indirizzo (`address_street`, `address_city`,
> `address_postal_code`, `address_province`). Il formato del codice fiscale **non** è verificato dal backend (solo "non vuoto"); il vincolo di età
> (>= 18 anni) non è implementato. `address_country` viene inviato dal form ma il backend non lo salva in fase di registrazione
> (è modificabile da `PUT /api/auth/profile`).


**Pagina**: `/register/personal-data`

**Campi da Compilare (vanno in `user_individuals`)**:

| Campo | Tipo | Validazione Frontend | Obbligatorio | Tabella |
|-------|------|---------------------|--------------|---------|
| Nome | TEXT | Lunghezza 2-50, solo lettere | ✅ | user_individuals.first_name |
| Cognome | TEXT | Lunghezza 2-50, solo lettere | ✅ | user_individuals.last_name |
| Codice Fiscale | TEXT | Formato CF italiano (16 char) | ✅ | user_individuals.fiscal_code |
| Data di Nascita | DATE | Format YYYY-MM-DD, >= 18 anni | ✅ | user_individuals.date_of_birth |
| Luogo Nascita | TEXT | Lunghezza 2-50 | ✅ | user_individuals.place_of_birth |
| Via/Indirizzo | TEXT | Lunghezza 5-100 | ✅ | user_individuals.address_street |
| Città | TEXT | Lunghezza 2-50 | ✅ | user_individuals.address_city |
| CAP | TEXT | 5 cifre | ✅ | user_individuals.address_postal_code |
| Provincia | TEXT | 2 lettere (es. MI, NA) | ✅ | user_individuals.address_province |
| Paese | TEXT | Default IT, selezionabile | ✅ | user_individuals.address_country |

**Validazione Frontend**:
```
- Nome/Cognome: /^[a-zA-ZàèìòùÀÈÌÒÙ\s'-]{2,50}$/
- Codice Fiscale: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/
- Data Nascita: YYYY-MM-DD, età >= 18
- Via: min 5, max 100 chars
- Città: /^[a-zA-Z\s'-]{2,50}$/
- CAP: /^\d{5}$/
- Provincia: /^[A-Z]{2}$/
```

**Azioni Frontend**:
1. Compila campi
2. Validazione lato client
3. Se valido → POST a `/api/auth/register-step3-individual`
4. Passa a Step 4 (Verifica Email)

---

### 2.3B - Frontend: Dati Azienda (Business)

> **Stato implementazione:** ⚠️ stessa `POST /api/auth/register` con `user_type: "business"`. Obbligatori: `company_name`, `vat_number`,
> `owner_first_name`, `owner_last_name`, `owner_fiscal_code`, `phone_number`. `business_type` ha default `srl` (il form non lo chiede).
> Nessuna validazione del formato della Partita IVA lato backend.


**Pagina**: `/register/business-data`

**Campi da Compilare (vanno in `user_businesses`)**:

| Campo | Tipo | Validazione Frontend | Obbligatorio | Tabella |
|-------|------|---------------------|--------------|---------|
| Ragione Sociale | TEXT | Lunghezza 2-100 | ✅ | user_businesses.company_name |
| Partita IVA | TEXT | 11 cifre italiane | ✅ | user_businesses.vat_number |
| Tipo Azienda | SELECT | srl, spa, snc, ditta, coop | ✅ | user_businesses.business_type |
| Nome Titolare | TEXT | Lunghezza 2-50 | ✅ | user_businesses.owner_first_name |
| Cognome Titolare | TEXT | Lunghezza 2-50 | ✅ | user_businesses.owner_last_name |
| CF Titolare | TEXT | Formato CF italiano | ✅ | user_businesses.owner_fiscal_code |
| Via Sede Legale | TEXT | Lunghezza 5-100 | ✅ | user_businesses.address_street |
| Città Sede | TEXT | Lunghezza 2-50 | ✅ | user_businesses.address_city |
| CAP Sede | TEXT | 5 cifre | ✅ | user_businesses.address_postal_code |
| Provincia | TEXT | 2 lettere | ✅ | user_businesses.address_province |
| Paese | TEXT | Default IT | ✅ | user_businesses.address_country |

**Azioni Frontend**:
1. Compila campi aziendali
2. Validazione lato client
3. Se valido → POST a `/api/auth/register-step3-business`
4. Passa a Step 4

---

### 2.4 Step 4 - Frontend: Verifica Email

> **Stato implementazione:** ⚠️ la pagina `/register/verify-email` (6 input da una cifra, countdown di 60 s per il reinvio, gestione del blocco di 15 min)
> viene aperta subito dopo la registrazione, con l'utente già autenticato dai cookie. Gli endpoint reali sono:
> - `POST /api/auth/verify-email` con `{ "code": "123456" }` (non `{email, otp}`: l'utente è quello del token);
> - `POST /api/auth/resend-verification` (nuovo codice; sostituisce quelli pendenti; max 3 richieste ogni 10 minuti per utente; rifiutato se la verifica è bloccata).
>
> L'OTP **non** è in Redis: è nella tabella `email_verifications` solo come HMAC (`code_hash`), con `expires_at` = +10 minuti, `attempts`/`max_attempts` (3) e
> `locked_until` (+15 minuti). Se la verifica va a buon fine: `email_verifications.is_verified = true`, `users.email_verified = true` e audit `verify_email`.
> Risposte: 400 codice errato (con `attemptsLeft`) o scaduto, 429 bloccato (con `retryAfterSeconds`).
> Senza provider email (`SMTP_*` / `RESEND_API_KEY`) il codice viene stampato nella console del backend (mai in `NODE_ENV=production`).


**Pagina**: `/register/verify-email`

**Flusso**:

1. **Richiesta OTP**: 
   - Frontend mostra messaggio: "Abbiamo inviato un codice OTP a {email}"
   - Backend riceve POST `/api/auth/send-otp-email` → Genera OTP in memoria → Invia via email
   - L'OTP è di **6 cifre**, valido per **10 minuti**

2. **Inserimento OTP**:
   - User vede 6 input field (uno per cifra) o un campo unico
   - Inserisce il codice ricevuto via email
   - Clicca "Verifica"

3. **Backend Verifica**:
   - Riceve POST `/api/auth/verify-email-otp`
   - Controlla se OTP è corretto (in memoria, non da DB)
   - Se errato → incrementa `email_verifications.attempts`
   - Se >= 3 tentativi → lancia `locked_until` (15 min di blocco)
   - Se corretto → Setta `email_verifications.is_verified = true` e `verified_at = NOW()`

4. **Response Frontend**:
   - Se successo → Passa a Step 5 (Verifica Telefono)
   - Se errore → Mostra errore, consente nuovo tentativo (se non bloccato)

**Tabella Interessata**: `email_verifications`

---

### 2.5 Step 5 - Frontend: Inserimento Numero Telefono (Facoltativo ma Consigliato)

> **Stato implementazione:** ❌ **non implementato.** Non esistono `/register/phone-verification`, `send-otp-sms`, `verify-phone-otp`.
> `backend/src/services/smsService.js` sa inviare SMS via Twilio (variabili `TWILIO_*`, con fallback su console) ma **nessuna rotta lo chiama**;
> la tabella `phone_verifications` e le colonne `users.phone_verified`/`phone_verified_at` non vengono mai scritte. Il telefono inserito in
> registrazione o nel profilo è solo salvato (colonna `users.phone_number`, univoca).


**Pagina**: `/register/phone-verification`

**Flusso**:

1. **Richiesta Numero**:
   - Input field per numero telefono
   - Formato: +39 XXX XXXX XXXX
   - Validazione: `/^\+39\d{9,10}$/`

2. **Richiesta OTP SMS**:
   - Clicca "Invia Codice via SMS"
   - Backend riceve POST `/api/auth/send-otp-sms`
   - Genera OTP di **6 cifre**, valido **10 minuti**
   - Invia via SMS (Twilio, AWS SNS, ecc.)
   - L'OTP NON viene memorizzato nel DB

3. **Inserimento OTP SMS**:
   - User inserisce 6 cifre ricevute via SMS
   - Clicca "Verifica SMS"
   - Backend riceve POST `/api/auth/verify-phone-otp`
   - Same logica di email: controlla in memoria, max 3 tentativi, lockout 15 min

4. **Response Frontend**:
   - Se successo → Setta `users.phone_verified = true` e `phone_verified_at = NOW()`
   - Se "Salta per ora" → Procedi a Step 6 comunque

**Tabella Interessata**: `phone_verifications`

---

### 2.6 Step 6 - Frontend: Riepilogo e Conferma

> **Stato implementazione:** ❌ non esistono `/register/confirmation` né `register-finalize`; non viene inviata nessuna email di benvenuto.
> L'utente viene creato (con `email_verified = false`) già al submit del form di registrazione e, dopo la pagina di verifica email, va su `/dashboard`.
> `terms_accepted`/`privacy_accepted` sono impostati a `true` dal backend senza una scelta esplicita dell'utente: da sistemare prima di un lancio pubblico.


**Pagina**: `/register/confirmation`

**Mostra**:
```
✅ Email: user@example.com (VERIFICATA)
✅ Tipo Account: Privato / Azienda
✅ Dati Personali: Nome Cognome
✅ Telefono: +39 XXX XXXX (VERIFICATO / NON VERIFICATO)
✅ Termini: Accettati
✅ Privacy: Accettata

[Conferma e Completa Registrazione]
```

**Azioni**:
1. User clicca "Conferma e Completa"
2. Frontend invia POST `/api/auth/register-finalize`
3. Backend:
   - Crea record in `users` con:
     - email, email_verified = true, email_verified_at = NOW()
     - phone_number (se verificato), phone_verified = true
     - password_hash, password_salt
     - user_type (individual/business)
     - terms_accepted = true, terms_accepted_at = NOW()
     - privacy_accepted = true, privacy_accepted_at = NOW()
     - marketing_consent (se spuntato)
     - is_active = true
     - created_at = NOW()
   - Crea record in `user_individuals` o `user_businesses`
   - Genera Session Token (JWT)
   - Invia email di benvenuto
4. Ritorna JWT + Refresh Token
5. Frontend salva token in **HttpOnly Cookie** o **Secure LocalStorage**
6. Redirect a `/dashboard` o `/onboarding`

---

## 3. FLUSSO DI LOGIN

### 3.1 Frontend: Form Login

**Pagina**: `/login`

**Campi**:

| Campo | Tipo | Validazione Frontend |
|-------|------|---------------------|
| Email | TEXT | Regex email valida |
| Password | PASSWORD | Non vuoto |

**Azioni Frontend**:
1. User inserisce email e password
2. Validazione lato client (format email)
3. Se valido → POST `/api/auth/login`
4. Riceve risposta dal backend

---

### 3.2 Backend: Verifica Credenziali

> **Stato implementazione:** ⚠️ differenze rispetto ai punti sotto:
> - la verifica email **non** blocca il login (punto 4): l'utente entra e vede un avviso; se `REQUIRE_VERIFIED_EMAIL=true` sono bloccate solo le scritture sui dati;
> - messaggio unico `Invalid credentials` (401) per email inesistente e password errata; 403 per account disattivato o sospeso;
> - access token **15 minuti**; la riga in `sessions` contiene lo **SHA-256 del refresh token** (non dell'access JWT), `device_name` (User-Agent, 255 caratteri) e `ip_address`;
>   `device_type`/`browser` non sono compilati;
> - il login elimina le sessioni scadute dell'utente e quelle ruotate da più di 7 giorni;
> - nessun contatore `failed_attempts` e nessun lockout per account: protegge solo `loginLimiter` (5 tentativi falliti ogni 15 minuti per IP);
> - la risposta JSON è `{ status: "success", data: { user } }`: **nessun token nel body**, solo cookie HttpOnly.


**Endpoint**: `POST /api/auth/login`

**Richiesta**:
```json
{
  "email": "user@example.com",
  "password": "MyPassword123!"
}
```

**Validazione Backend**:
1. **Controlla email**:
   - SELECT * FROM users WHERE email = 'user@example.com'
   - Se non esiste → Errore: "Email o password non validi"
   
2. **Controlla password**:
   - Legge `users.password_hash` e `users.password_salt`
   - Usa bcrypt.compare(password_input, password_hash)
   - Se false → Errore: "Email o password non validi"
   - Incrementa contatore tentativi falliti (opzionale, per lockout)
   
3. **Controlla account attivo**:
   - Se `users.is_active = false` → Errore: "Account disattivato"
   - Se `users.is_suspended = true` → Errore: "Account sospeso"
   - Leggi `suspension_reason` se sospeso
   
4. **Controlla verifica email**:
   - Se `users.email_verified = false` → Errore: "Email non verificata"
   
5. **Se tutto OK**:
   - Genera JWT Token (valido 1 ora)
   - Genera Refresh Token (valido 30 giorni)
   - Crea entry in `sessions` table:
     - `user_id` = utente
     - `session_token` = hash(JWT)
     - `device_type` = rileva da User-Agent
     - `browser` = rileva da User-Agent
     - `ip_address` = leggi da request
     - `expires_at` = NOW() + 30 giorni
   - Setta `users.last_login_at = NOW()`
   - Log in `audit_logs`: action='login', user_id=user.id, ip_address, user_agent

**Response Frontend**:
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_type": "individual",
    "is_active": true
  }
}
```

---

### 3.3 Frontend: Salvataggio Token e Redirect

> **Stato implementazione:** ✅ i token sono solo nei cookie `HttpOnly` (`SameSite=Strict`, `Secure` in produzione); il frontend non li legge mai.
> In `localStorage` (chiave `flywallets-auth`, Zustand `persist`) finisce solo l'oggetto utente per l'interfaccia. Il redirect è sempre `/dashboard`
> (non esiste `/onboarding`).


**Azioni Frontend**:

1. **Salva Access Token**:
   - Se HttpOnly Cookie → Backend imposta automaticamente
   - Se LocalStorage → `localStorage.setItem('access_token', token)`

2. **Salva Refresh Token**:
   - HttpOnly Cookie con flag `Secure` e `SameSite=Strict`
   - Backend imposta: `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict`

3. **Salva User Info**:
   - `localStorage.setItem('user', JSON.stringify(user))`

4. **Redirect**:
   - `/dashboard` se primo accesso completato
   - `/onboarding` se necessita setup iniziale

---

## 4. GESTIONE PASSWORD

### 4.1 Hash e Storage

**Al momento della registrazione/cambio password**:

```
Backend Flow:
1. Riceve password in plain text da HTTPS
2. Genera salt: bcrypt.gensalt(rounds=12)
3. Hash password: bcrypt.hash(password, salt)
4. Salva in DB:
   - users.password_hash = hash
   - users.password_salt = salt (opzionale, bcrypt include il salt)
   - users.password_changed_at = NOW()
5. NON memorizza mai la password in chiaro
```

**Password Valida** (Frontend):
```
- Lunghezza: >= 8 caratteri
- Maiuscole: >= 1 (A-Z)
- Minuscole: >= 1 (a-z)
- Numeri: >= 1 (0-9)
- Speciali: >= 1 (@#$%^&*!-_)
- Non contiene email address
- Non è una password comune (verificare contro lista)
```

### 4.2 Login e Verifica Password

```
Backend Flow al Login:
1. Riceve email e password
2. SELECT users WHERE email = 'email'
3. bcrypt.compare(password_input, users.password_hash)
4. Se true → Login OK
5. Se false → Errore "Email o password non validi"
```

### 4.3 Reset Password

> **Stato implementazione:** ⚠️ implementato in `authController.forgotPassword` / `resetPassword`:
> - `POST /api/auth/forgot-password {email}` risponde **sempre** 200 con un messaggio generico (nessuna enumerazione degli account); se l'utente esiste e
>   è attivo genera `crypto.randomBytes(32).toString("hex")`, cancella i reset pendenti, salva lo **SHA-256** in `password_resets.reset_token` (scadenza 1 ora),
>   scrive l'audit `forgot_password` e invia il link `${CLIENT_URL}/reset-password?token=...` (primo valore di `CLIENT_URL`; in sviluppo senza SMTP il link è nella console);
> - **non esiste** `GET /api/auth/validate-reset-token`: il frontend invia direttamente `POST /api/auth/reset-password {token, password}`; il token deve essere esadecimale di 64 caratteri;
> - il reset usa `SELECT ... FOR UPDATE` (due richieste con lo stesso token non possono riuscire entrambe), aggiorna `password_hash`/`password_salt`/`password_changed_at`,
>   marca `is_used`, **elimina tutte le sessioni** dell'utente e scrive l'audit `reset_password` (non `password_reset`);
> - non viene inviata l'email di conferma "password cambiata";
> - rate limit: 3 richieste ogni 10 minuti per email normalizzata (gli alias `a.b+x@gmail.com` condividono il contatore) e 20 ogni 10 minuti per IP.


**Pagina**: `/forgot-password`

**Step 1 - Richiesta Reset**:

1. **Frontend**:
   - Input email
   - POST `/api/auth/forgot-password`

2. **Backend**:
   - Controlla se email esiste
   - Genera reset token (JWT o UUID)
   - Hash il token: sha256(token)
   - Crea entry in `password_resets`:
     - `user_id` = utente
     - `reset_token` = hash(token)
     - `expires_at` = NOW() + 1 ora
     - `is_used` = false
   - Invia email con link: `https://app.com/reset-password?token={token}`
   - Response: "Email inviata a user@example.com"

**Step 2 - Click Link Email**:

1. **Frontend**:
   - User clicca link
   - Estrae token da URL params
   - Vai a `/reset-password?token={token}`

2. **Backend**:
   - GET `/api/auth/validate-reset-token?token={token}`
   - SELECT FROM password_resets WHERE reset_token = hash(token)
   - Se non esiste → Errore "Link scaduto"
   - Se expires_at < NOW() → Errore "Link scaduto"
   - Se is_used = true → Errore "Link già usato"
   - Se valido → Ritorna 200 OK

**Step 3 - Nuova Password**:

1. **Frontend**:
   - Input nuova password + conferma
   - POST `/api/auth/reset-password` con:
     ```json
     {
       "token": "reset_token_from_url",
       "password": "NewPassword123!"
     }
     ```

2. **Backend**:
   - Valida token (come sopra)
   - Valida password strength
   - Genera nuovo hash con bcrypt
   - UPDATE users SET password_hash = new_hash, password_changed_at = NOW()
   - UPDATE password_resets SET is_used = true, used_at = NOW()
   - Invalida tutte le sessioni precedenti (DELETE FROM sessions WHERE user_id = ...)
   - Invia email di conferma: "Password cambiata"
   - Log in audit_logs: action='password_reset', user_id, ip_address

3. **Frontend**:
   - Se successo → Redirect a `/login` con messaggio "Password resettata, fai login"

---

## 5. GESTIONE OTP (Email e SMS)

### 5.1 Generazione OTP

> **Stato implementazione:** ⚠️ il codice è generato lato server con `crypto.randomInt` (`generateOtp` in `utils/security.js`, 6 cifre con zeri iniziali).
> La parte con Redis/Python sotto è solo un esempio della specifica: **Redis non è usato** (vedi 5.3).


**Chi la fa**: Backend (server-side), DURANTE il flusso di registrazione/login

**Come**:
```python
# Python Example
import secrets
import string

def generate_otp(length=6):
    """Genera OTP di 6 cifre casuale"""
    digits = string.digits
    otp = ''.join(secrets.choice(digits) for _ in range(length))
    return otp  # Es. "294857"

# Al momento del invio:
otp = generate_otp()  # "294857"
# NON salva in DB, lo tiene in memoria (Redis/Cache)
redis.setex(f"otp:email:{user_email}", 600, otp)  # 10 min expiry
# Invia via email
send_email(email, f"Il tuo codice OTP è: {otp}")
```

### 5.2 Verifica OTP

> **Stato implementazione:** ⚠️ vedi 2.4 per endpoint, payload e risposte reali. Differenza chiave rispetto alla specifica: il confronto avviene con
> `email_verifications.code_hash` (HMAC) e l'incremento di `attempts` è fatto **prima** del confronto con un `UPDATE ... WHERE attempts < max_attempts`
> atomico, così 40 tentativi paralleli non possono superare i 3 consentiti (test `regression.test.js`). L'audit è `verify_email` (non `email_verified`).


**Endpoint Backend**: `POST /api/auth/verify-email-otp`

```
Richiesta:
{
  "email": "user@example.com",
  "otp": "294857"
}

Backend Flow:
1. Leggi da Redis: redis.get(f"otp:email:{email}")
2. Se non esiste → Errore "OTP scaduto"
3. Se OTP ricevuto != OTP salvato → Errore "OTP non valido"
4. Incrementa tentativo: email_verifications.attempts++
5. Se attempts >= 3 → locked_until = NOW() + 15 min, Errore "Troppi tentativi"
6. Se OTP corretto:
   - DELETE da Redis (impedisce riuso)
   - UPDATE email_verifications SET is_verified=true, verified_at=NOW()
   - UPDATE users SET email_verified=true, email_verified_at=NOW()
   - Log in audit_logs: action='email_verified', user_id, email
   - Return: 200 OK

Frontend:
- Se successo → Mostra ✅ Email verificata, prosegui
- Se errore → Mostra messaggio errore
- Se bloccato → "Troppi tentativi, riprova tra 15 minuti"
```

### 5.3 Storage OTP - IMPORTANTE

> **Stato implementazione:** ⚠️ **scelta attuale: database, ma solo hash.** Il codice in chiaro non viene mai salvato: `code_hash = HMAC-SHA256(JWT_SECRET, "<user_id>:<codice>")`
> (`hashOtp`), confrontato con `timingSafeEqual`. Un dump del DB da solo non permette di ricavare i codici e non serve un'infrastruttura aggiuntiva (Redis/Memcached).
> Lo svantaggio rispetto a Redis è che le righe scadute restano in tabella finché non vengono sostituite da un nuovo invio. Redis resta un'opzione futura, non pianificata.


**Dove NON salvare OTP**:
- ❌ Database (chiaro)
- ❌ Variabili globali (non thread-safe)
- ❌ Session file (leggibile)

**Dove salvare OTP**:
- ✅ **Redis** (in-memory, with TTL)
  ```
  Key: otp:email:{email} | otp:phone:{phone}
  Value: {otp_code}
  TTL: 600 sec (10 min)
  ```

- ✅ **Memcached** (simile a Redis)

- ✅ **In-Memory Cache** (app memory, con cleanup)
  ```python
  otp_cache = {
    'otp:email:user@example.com': {
      'code': '294857',
      'expires': time.time() + 600
    }
  }
  ```

**Vantaggi**:
- Scade automaticamente dopo TTL
- Non persiste a restart (visto che è temporaneo)
- Non è nel DB (inaccessibile da DB breaches)
- È veloce (in-memory)

---

## 6. SESSION MANAGEMENT

### 6.1 JWT Token Structure

> **Stato implementazione:** ⚠️ payload reale: access token `{ id, email, user_type, iat, exp }` (scadenza **15 minuti**, firmato con `JWT_SECRET`);
> refresh token `{ id, jti, iat, exp }` (30 giorni, firmato con `JWT_REFRESH_SECRET`; il `jti` casuale rende unico ogni token). Il claim `sub` non è usato.


**Access Token** (1 ora):
```json
{
  "sub": "user_uuid",
  "email": "user@example.com",
  "user_type": "individual",
  "iat": 1702000000,
  "exp": 1702003600
}
```

**Refresh Token** (30 giorni):
```json
{
  "sub": "user_uuid",
  "type": "refresh",
  "iat": 1702000000,
  "exp": 1733536000
}
```

### 6.2 Token Storage - IMPORTANTE

**Access Token**:
- 📱 Mobile App → Secure Storage (Keychain/Keystore)
- 🌐 Web → HttpOnly Cookie (preferito) oppure RAM
- ⚠️ NON in localStorage! (vulnerabile XSS)

**Refresh Token**:
- 📱 Mobile → Secure Storage
- 🌐 Web → HttpOnly Cookie con flag `Secure, SameSite=Strict`

### 6.3 Refresh Token Flow

> **Stato implementazione:** ✅ esteso con **rotazione e rilevamento del riuso** (`authController.refreshToken`, migrazione `database/migrations/002_session_rotation.sql`):
> 1. `POST /api/auth/refresh-token` legge il cookie `refresh_token`, verifica la firma e blocca la riga di `sessions` (`FOR UPDATE`).
> 2. Sessione valida e mai ruotata: la riga viene marcata `rotated_at = NOW()`, ne viene creata una nuova con **nuovo refresh token** e stessa scadenza della originale
>    (la rotazione non allunga i 30 giorni), e vengono reimpostati entrambi i cookie.
> 3. Token già ruotato presentato entro **30 secondi** (race tra più tab): riceve solo un nuovo access token.
> 4. Token già ruotato presentato **dopo** i 30 secondi: considerato rubato; vengono cancellate **tutte** le sessioni dell'utente, i cookie vengono rimossi, audit `refresh_token_reuse`
>    e risposta `403 { code: "REFRESH_TOKEN_REUSED" }`. Il frontend esegue il logout locale e rimanda a `/login`.
> 5. Utente disattivato/sospeso o sessione inesistente/scaduta: `403 Session invalid`; cookie assente: `401`.
> Il logout (`POST /api/auth/logout`) cancella la sessione corrispondente al cookie e ripulisce i cookie.


**Quando Access Token scade**:

```
Frontend:
1. Riceve errore 401 da API (token scaduto)
2. POST /api/auth/refresh-token con refresh_token
3. Backend valida refresh_token
4. Se valido → Ritorna nuovo access_token
5. Frontend retry della richiesta originale
6. Se refresh_token scaduto → Logout automatico, redirect login
```

---

## 7. SICUREZZA - BEST PRACTICES IMPLEMENTATE

### 7.1 HTTPS Obbligatorio
```
✅ Tutte le comunicazioni via HTTPS (TLS 1.2+)
✅ HSTS header: Strict-Transport-Security: max-age=31536000
✅ Redirect HTTP → HTTPS automatico
```

### 7.2 CORS Configuration
```
✅ Whitelisting origini autorizzate (frontend only)
✅ No wildcard origins
✅ Credentials allowed (per cookie)
```

### 7.3 CSRF Protection

> **Stato implementazione:** ⚠️ implementato solo `SameSite=Strict` (+ CORS con allow-list e `credentials`). Non ci sono token CSRF né controllo dell'header `Origin`
> oltre al CORS. Conseguenza operativa: frontend e API devono stare sullo **stesso site** (stesso dominio registrabile), altrimenti i cookie non vengono inviati.

```
✅ SameSite cookie (Strict)
✅ CSRF token per form submission
✅ Origin header validation
```

### 7.4 Rate Limiting

> **Stato implementazione:** ✅ in `backend/src/middleware/rateLimitMiddleware.js` (disattivati con `NODE_ENV=test`, contatori in memoria del processo):
>
> | Limiter | Limite | Chiave |
> |---------|--------|--------|
> | `loginLimiter` | 5 login **falliti** / 15 min | IP |
> | `registerLimiter` | 3 / ora | IP |
> | `otpLimiter` (reinvio OTP, forgot-password) | 3 / 10 min | utente autenticato, altrimenti email normalizzata (non l'IP) |
> | `authCodeIpLimiter` (verify-email, forgot, reset, resend) | 20 / 10 min | IP |
> | `apiLimiter` (tutte le rotte dati autenticate + `PUT /auth/profile`) | 120 / min | utente |
> | `aiLimiter` (`/api/ai/*`) | 10 / min | utente |
>
> Con un reverse proxy impostare `TRUST_PROXY` per vedere l'IP reale.

```
✅ Login: max 5 tentativi in 15 minuti
✅ Registrazione: max 3 account dalla stessa IP in 1 ora
✅ Reset Password: max 3 richieste in 1 ora
✅ OTP: max 3 tentativi, 15 min lockout
```

### 7.5 Password Security

> **Stato implementazione:** ⚠️ bcrypt a 12 round ✅; regole backend: minimo 8 caratteri, 1 maiuscola, 1 numero, 1 carattere in `@$!%*?&`. Il misuratore di robustezza è nel frontend
> (`PasswordStrength`, `lib/passwordStrength.js`). ❌ Nessun controllo contro password comuni né sul fatto che la password contenga l'email. Non esiste un endpoint per cambiare password da loggati
> (solo il flusso di reset via email).

```
✅ bcrypt con rounds=12
✅ Min 8 caratteri, 1 maiusc, 1 numero, 1 speciale
✅ Password strength meter (frontend)
✅ Check contro common passwords
```

### 7.6 Logging & Monitoring
```
✅ Log tutte le azioni di auth in audit_logs
✅ Monitora tentativi falliti
✅ Alert su attività sospette (es. login da IP diverso)
```

### 7.7 Device Management

> **Stato implementazione:** ❌ non implementato. Le sessioni vengono salvate (`sessions`: `device_name`, `ip_address`), ma non c'è un endpoint/UI per elencarle o per il logout remoto,
> né "Ricorda questo device", né 2FA, né email per nuovo login.

```
✅ Memorizza device info in sessions
✅ Consenti "Ricorda questo device" (opzionale 2FA)
✅ Mostra all devices attivi
✅ Logout remoto da altri device
```

---

## 8. DIAGRAMMA FLUSSO REGISTRAZIONE

> **Stato implementazione:** il diagramma descrive la **specifica a 6 step**. Nel codice i passi 1-3 e 6 sono un'unica `POST /api/auth/register` (con sessione e cookie già creati), il passo 4 è la pagina `/register/verify-email` e il passo 5 (telefono) non esiste. Vedi la sezione 1bis.


```
START
  ↓
[Step 1: Email & Password]
  - Frontend: Valida email, password
  - Backend: Controlla email unica, hash password
  ↓
[Step 2: Scelta Tipo Account]
  - User sceglie "Privato" o "Azienda"
  ↓
┌─────────────────────────────────────────┐
│                                         │
├─ PRIVATO                            AZIENDA ┤
│  ↓                                      ↓     │
│ [Step 3A: Dati Personali]      [Step 3B: Dati Azienda] │
│  - Nome, Cognome, CF            - P.IVA, Ragione Sociale │
│  - Data nascita, Indirizzo      - Titolare, Indirizzo   │
│                                                          │
└─────────────────────────────────────────┘
  ↓
[Step 4: Verifica Email]
  - Backend: Invia OTP via email (Redis store)
  - Frontend: User inserisce OTP
  - Backend: Verifica OTP, mark email_verified=true
  ↓
[Step 5: Verifica Telefono (Facoltativo)]
  - Frontend: Input numero telefono
  - Backend: Invia OTP via SMS (Redis store)
  - Frontend: User inserisce OTP
  - Backend: Verifica OTP, mark phone_verified=true
  ↓
[Step 6: Riepilogo e Conferma]
  - Frontend: Mostra tutti i dati inseriti
  - User clicca "Completa Registrazione"
  ↓
[Backend: Finalize Registrazione]
  - Crea record users, user_individuals/user_businesses
  - Genera JWT + Refresh Token
  - Crea session entry
  - Invia email benvenuto
  ↓
[Frontend: Salva Token e Redirect]
  - Save JWT in HttpOnly Cookie
  - Save Refresh in HttpOnly Cookie
  - Redirect /dashboard oppure /onboarding
  ↓
END (Account Attivo)
```

---

## 9. DIAGRAMMA FLUSSO LOGIN

> **Stato implementazione:** differenze rispetto al diagramma: nessun lockout per account (solo rate limit per IP), nessun blocco per email non verificata, access token da 15 minuti, token solo nei cookie (non nel JSON). Vedi la sezione 1bis e 3.2.


```
START (User su /login page)
  ↓
[Step 1: Input Email & Password]
  - Frontend: Valida formato email
  ↓
[Step 2: POST /api/auth/login]
  - Backend: Riceve email, password
  ↓
[Backend: Verifica Email Esiste]
  - SELECT users WHERE email=...
  - Se not found → 401 "Email o password non validi"
  ↓
[Backend: Verifica Password]
  - bcrypt.compare(input_password, users.password_hash)
  - Se mismatch → Incrementa failed_attempts, 401 error
  - Se >5 falliti in 15 min → Account lockout per 30 min
  ↓
[Backend: Verifica Account Status]
  - Se is_active=false → 403 "Account disattivato"
  - Se is_suspended=true → 403 "Account sospeso"
  - Se email_verified=false → 403 "Email non verificata"
  ↓
[Backend: Genera Token e Session]
  - Genera JWT access_token (1 ora TTL)
  - Genera refresh_token (30 giorni TTL)
  - Crea entry in sessions table
  - UPDATE users.last_login_at = NOW()
  - Log in audit_logs: action='login'
  ↓
[Backend: Ritorna Token]
  - SET Cookie: access_token (HttpOnly, Secure)
  - SET Cookie: refresh_token (HttpOnly, Secure, SameSite=Strict)
  - Return JSON: { access_token, refresh_token, user }
  ↓
[Frontend: Riceve Token]
  - Token automaticamente in HttpOnly Cookie (set da server)
  - Salva user info in localStorage
  ↓
[Frontend: Redirect]
  - Redirect a /dashboard
  ↓
END (User Logged In)
```

---

## 10. INDIPENDENZA ACCOUNT & CONCORRENZA

### 10.1 Come Si Garantisce Isolamento Utenti

**Row-Level Security (PostgreSQL)**:
```sql
-- Abilita RLS su tutte le tabelle critical
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: User può vedere solo i propri dati
CREATE POLICY user_isolation ON users
  USING (id = current_user_id());

CREATE POLICY account_isolation ON manual_accounts
  USING (user_id = current_user_id());

-- Anche se un utente modifica URL o ID, il database bloccherà
```

**Backend Authorization**:
```python
# Esempio Python/Flask
@app.route('/api/transactions/<transaction_id>')
@login_required
def get_transaction(transaction_id):
    transaction = Transaction.get(transaction_id)
    
    # IMPORTANTE: Controlla che appartenga all'utente loggato
    if transaction.user_id != current_user.id:
        return 401 Unauthorized
    
    return transaction.to_json()
```

### 10.2 Multi-User Concorrenza

> **Stato implementazione:** ⚠️ pool PostgreSQL (`pg.Pool`) ✅; **Redis ❌ non usato**. L'isolamento è implementato con **due pool**: `DATABASE_URL` (owner, flussi di autenticazione, seed, scheduler)
> e `DATABASE_APP_URL` (ruolo `flywallets_app`, soggetto a RLS) usato da ogni richiesta dati tramite `req.withUser(fn)` → `BEGIN` + `set_config('app.current_user_id', ...)` + query + `COMMIT`.
> Le operazioni sul saldo prendono il lock di riga del conto (`SELECT ... FOR UPDATE`), non servono livelli `SERIALIZABLE`. Se `DATABASE_APP_URL` non è impostata le policy RLS esistono ma
> **non sono applicate** (superuser/owner le bypassano): vedi `database/rls_app_role.sql` e il README principale.


**Problema**: 100 utenti si loggano simultaneamente

**Soluzione**:

1. **Database Connection Pooling**:
   ```
   - Mantieni pool di connessioni (es. 20-50)
   - Ogni richiesta prende connessione dal pool
   - Non crea nuova connessione ogni volta
   - Supporta centinaia di utenti concorrenti
   ```

2. **Redis per OTP e Session**:
   ```
   - OTP: redis.setex(key, 600, otp)
   - Session: redis.setex(key, 86400, session_data)
   - Redis è single-threaded ma molto veloce
   - Supporta thousands di operazioni al secondo
   ```

3. **Load Balancing** (se necessario):
   ```
   - Frontend: Nginx/HAProxy distribuisce richieste
   - Backend: Multi-server (3-5 istanze)
   - Database: Un'unica istanza Postgres (RLS isola dati)
   - Redis: Un'unica istanza (condivisa da tutti i server)
   ```

4. **Transaction Isolation** (PostgreSQL):
   ```
   - Default: READ COMMITTED
   - Per operazioni critiche: SERIALIZABLE
   - Previene race conditions su account balances
   ```

### 10.3 Esempio: 2 Utenti Login Simultaneo

```
TIMELINE:

T=0ms   User1 POST /api/auth/login        User2 POST /api/auth/login
        └─ Backend: Check email1          └─ Backend: Check email2

T=10ms  SELECT users WHERE email1         SELECT users WHERE email2
        └─ Found user1                    └─ Found user2

T=20ms  bcrypt.compare(pw1, hash1)        bcrypt.compare(pw2, hash2)
        └─ Match ✅                       └─ Match ✅

T=30ms  Generate JWT1, Refresh1           Generate JWT2, Refresh2
        Create Session1                   Create Session2
        SET audit_log1                    SET audit_log2

T=40ms  Send HTTP 200 (token1)            Send HTTP 200 (token2)
        └─ User1 cookies: JWT1, RF1       └─ User2 cookies: JWT2, RF2

T=50ms  User1 authorized                  User2 authorized
        Can see only User1 data           Can see only User2 data
        (RLS prevents cross-access)       (RLS prevents cross-access)

⚡ NO CONFLICTS - Fully isolated
```

---

## 11. TABELLA MAPPING REGISTRAZIONE

> **Stato implementazione:** la mappatura campo → colonna è corretta, ma gli "step" sono tutti eseguiti dalla stessa `POST /api/auth/register`. Le righe 5 (telefono verificato / `phone_verifications`) e `marketing_consent` non sono popolate dal flusso attuale: il telefono viene salvato in `users.phone_number` senza verifica, e `terms_accepted`/`privacy_accepted` sono impostati dal backend.


| Step | Campo Frontend | Tabella Database | Colonna |
|------|----------------|--------------------|---------|
| 1 | Email | users | email |
| 1 | Password | users | password_hash, password_salt |
| 1 | Termini | users | terms_accepted, terms_accepted_at |
| 1 | Privacy | users | privacy_accepted, privacy_accepted_at |
| 1 | Marketing | users | marketing_consent |
| 2 | Tipo | users | user_type |
| 3A | Nome | user_individuals | first_name |
| 3A | Cognome | user_individuals | last_name |
| 3A | CF | user_individuals | fiscal_code |
| 3A | Data Nascita | user_individuals | date_of_birth |
| 3A | Luogo Nascita | user_individuals | place_of_birth |
| 3A | Via | user_individuals | address_street |
| 3A | Città | user_individuals | address_city |
| 3A | CAP | user_individuals | address_postal_code |
| 3A | Provincia | user_individuals | address_province |
| 3A | Paese | user_individuals | address_country |
| 3B | Ragione Sociale | user_businesses | company_name |
| 3B | P.IVA | user_businesses | vat_number |
| 3B | Tipo Azienda | user_businesses | business_type |
| 3B | Nome Titolare | user_businesses | owner_first_name |
| 3B | Cognome Titolare | user_businesses | owner_last_name |
| 3B | CF Titolare | user_businesses | owner_fiscal_code |
| 3B | Via Sede | user_businesses | address_street |
| 3B | Città Sede | user_businesses | address_city |
| 3B | CAP | user_businesses | address_postal_code |
| 3B | Provincia | user_businesses | address_province |
| 3B | Paese | user_businesses | address_country |
| 4 | OTP Email | email_verifications | is_verified, verified_at |
| 5 | Telefono | users | phone_number, phone_verified, phone_verified_at |
| 5 | OTP SMS | phone_verifications | is_verified, verified_at |
| 6 | - | users | is_active = true, created_at = NOW() |
| 6 | - | sessions | Crea nuova sessione |

---

## 12. CHECKLIST SICUREZZA

> **Stato implementazione (spunte aggiornate al codice):** [x] CORS senza wildcard · [x] bcrypt 12 round · [x] rate limiting login/registrazione/OTP/API · [x] timeout sessione 15 min access / 30 giorni refresh ·
> [x] reset password con token monouso · [x] RLS abilitato (efficace solo con `DATABASE_APP_URL`) · [x] query parametrizzate · [x] audit log per le azioni di auth principali ·
> [ ] OTP in Redis (scelta diversa: hash in DB) · [ ] HTTPS/HSTS gestiti dal deployment (Helmet imposta l'header HSTS, ma il TLS va configurato davanti all'app) · [ ] CSP del frontend ·
> [ ] token CSRF (solo SameSite) · [ ] 2FA · [ ] gestione dispositivi · [ ] email "nuovo login" · [ ] email obbligatoriamente verificata per usare l'app (opzionale con `REQUIRE_VERIFIED_EMAIL`) ·
> [ ] backup automatici (responsabilità del deployment).


Prima di andare in produzione:

- [ ] HTTPS su tutti gli endpoint
- [ ] HSTS header configurato (min-age 1 anno)
- [ ] CORS configurato (no wildcard)
- [ ] Password bcrypt con rounds >= 12
- [ ] OTP in Redis/Cache (NON in DB)
- [ ] Rate limiting su login (5 tentativi/15min)
- [ ] Rate limiting su registrazione (3 account/IP/ora)
- [ ] Session timeout: 1 ora access token, 30 giorni refresh
- [ ] Logout invalida tutte le sessioni
- [ ] Audit logging per tutte le azioni
- [ ] Email verificata prima di account attivo
- [ ] RLS abilitato su tabelle sensibili
- [ ] SQL Injection prevention (prepared statements)
- [ ] XSS protection (Content Security Policy)
- [ ] CSRF protection (SameSite cookies)
- [ ] Password reset email con token monouso
- [ ] 2FA opzionale (authenticator app)
- [ ] Device management visibile agli utenti
- [ ] Notifiche email: nuovo login da IP diverso
- [ ] Backup database giornalieri

