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

---

## 2. FLUSSO DI REGISTRAZIONE

### 2.1 Step 1 - Frontend: Form Registrazione Iniziale

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
```
✅ SameSite cookie (Strict)
✅ CSRF token per form submission
✅ Origin header validation
```

### 7.4 Rate Limiting
```
✅ Login: max 5 tentativi in 15 minuti
✅ Registrazione: max 3 account dalla stessa IP in 1 ora
✅ Reset Password: max 3 richieste in 1 ora
✅ OTP: max 3 tentativi, 15 min lockout
```

### 7.5 Password Security
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
```
✅ Memorizza device info in sessions
✅ Consenti "Ricorda questo device" (opzionale 2FA)
✅ Mostra all devices attivi
✅ Logout remoto da altri device
```

---

## 8. DIAGRAMMA FLUSSO REGISTRAZIONE

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

