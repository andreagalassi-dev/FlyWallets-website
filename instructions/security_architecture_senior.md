# Security Architecture - Guida Completa per Senior Developers

## PREMESSA CRITICA

Questo documento non è una semplice checklist di sicurezza. È una **architettura di sicurezza end-to-end** che affronta:

- **Threat Models** specifici per applicazioni fintech
- **Vulnerabilità critiche** (OWASP Top 10 + specifiche fintech)
- **Defense in Depth** (multiple layers di protezione)
- **Zero Trust Architecture** (non fidati di nessuno)
- **Compliance Requirements** (GDPR, PSD2, normative bancarie italiane)

---

## 1. CONTESTO: Perché la Sicurezza È Critica per FlyWallets

### 1.1 Natura Sensibile dei Dati

FlyWallets maneggia:

```
🔴 DATI ALTAMENTE SENSIBILI:
├─ Credenziali utente (email, password)
├─ Dati bancari (IBAN, conti collegati)
├─ Dati finanziari personali (saldi, transazioni)
├─ Dati identificativi (CF, P.IVA, indirizzo)
├─ Dati biometrici (se 2FA con impronte)
└─ Token API bancari (accesso ai conti)
```

**Una singola violazione potrebbe significare**:
- Furto di identità
- Frode bancaria
- Perdita di denaro reale
- Violazione GDPR (multa 4% del fatturato o €20M)
- Perdita di fiducia degli utenti
- Azioni legali

---

### 1.2 Livello di Minaccia

```
ATTORI DI MINACCIA:

┌─────────────────────────────────────────────────────────┐
│ 1. EXTERNAL ATTACKERS (High Skill)                      │
│    - Cybercriminals con skill avanzate                  │
│    - Ransomware gangs                                   │
│    - Nation-state actors (se target)                    │
│    - Motivazione: Money, data theft                     │
│                                                         │
│ 2. INSIDER THREATS (High Risk)                          │
│    - Impiegati/contractors con accesso                  │
│    - Credential compromise                              │
│    - Motivazione: Money, vendetta                       │
│                                                         │
│ 3. SCRIPT KIDDIES (Low-Medium Skill)                    │
│    - Usano exploit pubblici                             │
│    - Automated scanning                                 │
│    - Motivazione: Chaos, learning                       │
│                                                         │
│ 4. SUPPLY CHAIN ATTACKS (Critical)                      │
│    - Compromessi a liberie/dipendenze                   │
│    - Esempi: Log4Shell, SolarWinds                      │
│    - Motivazione: Accesso a molti target                │
└─────────────────────────────────────────────────────────┘
```

**Conclusione**: Deve essere costruito con "assunzione di compromissione" da parte di qualunque attore.

---

## 2. ATTACK SURFACE ANALYSIS

### 2.1 Aree di Attacco Identificate

```
┌─────────────────────────────────────────────────────────────┐
│                     ATTACK SURFACE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FRONTEND (Browser)                                         │
│  ├─ XSS (Cross-Site Scripting)                             │
│  ├─ CSRF (Cross-Site Request Forgery)                      │
│  ├─ Clickjacking                                           │
│  ├─ Local Storage compromise (localStorage tokens)          │
│  ├─ Man-in-the-Middle (HTTPS stripping)                    │
│  └─ Supply chain (malicious JS libs)                       │
│                                                             │
│  BACKEND (Server)                                           │
│  ├─ SQL Injection                                          │
│  ├─ NoSQL Injection                                        │
│  ├─ Command Injection                                      │
│  ├─ Insecure Deserialization                               │
│  ├─ Authentication bypass                                  │
│  ├─ Authorization bypass (privilege escalation)            │
│  ├─ Business logic flaws                                   │
│  ├─ Insecure API design                                    │
│  ├─ Rate limiting absence                                  │
│  ├─ Logging/monitoring gaps                                │
│  ├─ Default credentials                                    │
│  └─ Code vulnerabilities (npm audit)                       │
│                                                             │
│  DATA LAYER (Database)                                      │
│  ├─ Weak encryption at rest                                │
│  ├─ Unencrypted data transmission                          │
│  ├─ Excessive data exposure (over-fetching)                │
│  ├─ Backup insecurity                                      │
│  ├─ Database credentials compromise                        │
│  ├─ Log exposure                                           │
│  └─ Physical access to servers                             │
│                                                             │
│  INFRASTRUCTURE                                             │
│  ├─ Cloud misconfiguration (AWS S3 public)                 │
│  ├─ Exposed admin panels                                   │
│  ├─ Weak IAM policies                                      │
│  ├─ DDoS vulnerability                                     │
│  ├─ Insecure secrets management                            │
│  └─ Unpatched systems                                      │
│                                                             │
│  THIRD-PARTY INTEGRATIONS                                  │
│  ├─ Plaid/Tink API key compromise                          │
│  ├─ Email service (Sendgrid) compromise                    │
│  ├─ SMS service (Twilio) compromise                        │
│  ├─ Payment gateway (Stripe) compromise                    │
│  └─ Logging service (Sentry) data leaks                    │
│                                                             │
│  HUMAN FACTORS                                              │
│  ├─ Phishing (staff + users)                               │
│  ├─ Social engineering                                     │
│  ├─ Weak passwords                                         │
│  ├─ Password reuse                                         │
│  └─ Lack of security training                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. DEFENSE IN DEPTH: Multi-Layer Security

### 3.1 Architettura di Sicurezza Stratificata

```
LAYER 1: PERIMETER SECURITY (WAF, DDoS)
         ↓
LAYER 2: NETWORK SECURITY (TLS, VPN, Firewalls)
         ↓
LAYER 3: APPLICATION SECURITY (Auth, Authorization, Input Validation)
         ↓
LAYER 4: DATA SECURITY (Encryption at rest, Encryption in transit)
         ↓
LAYER 5: MONITORING & RESPONSE (Logging, SIEM, Incident Response)

Ogni layer è INDIPENDENTE.
Se uno fallisce, gli altri la contengono.
```

---

## 4. LAYER 1: PERIMETER SECURITY

### 4.1 Web Application Firewall (WAF)

**Implementazione**: AWS WAF, Cloudflare WAF, o ModSecurity

**Regole Critiche**:

```
┌─────────────────────────────────────────────┐
│ WAF RULE SET                                │
├─────────────────────────────────────────────┤
│                                             │
│ 1. SQL Injection Detection                  │
│    - Pattern: ' OR 1=1 --                   │
│    - Pattern: UNION SELECT                  │
│    - Pattern: DROP TABLE                    │
│    Action: BLOCK + LOG                      │
│                                             │
│ 2. XSS Detection                            │
│    - Pattern: <script>                      │
│    - Pattern: javascript:                   │
│    - Pattern: onerror=                      │
│    Action: BLOCK + LOG                      │
│                                             │
│ 3. Path Traversal                           │
│    - Pattern: ../../../etc/passwd           │
│    Action: BLOCK + LOG                      │
│                                             │
│ 4. Rate Limiting per IP                     │
│    - Login endpoint: 5 req/15 min           │
│    - Register endpoint: 3 req/hour/IP       │
│    - API endpoints: 100 req/min             │
│    Action: 429 Too Many Requests            │
│                                             │
│ 5. GeoIP Blocking (Opzionale)               │
│    - Blocca countries ad alto rischio       │
│    - Log per analisi                        │
│                                             │
│ 6. Bot Detection                            │
│    - Cloudflare Bot Management              │
│    - Blocca fingerprint sospetti            │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 DDoS Protection

**Implementazione**: Cloudflare, AWS Shield, Akamai

```
DDOS Mitigation Strategy:

1. Always-On Protection
   - Cloudflare automatic DDoS mitigation
   - AWS Shield Standard (gratuito)
   
2. Rate Limiting
   - IP-based throttling
   - User-based throttling (dopo login)
   
3. Challenge Pages
   - CAPTCHA su traffic anomalo
   - JS Challenge (non visibile, blocca bot)
   
4. Geographic Redundancy
   - Multi-region deployment
   - Automatic failover
```

---

## 5. LAYER 2: NETWORK SECURITY

### 5.1 HTTPS/TLS Configuration

**Standard Minimo**: TLS 1.2, preferibilmente TLS 1.3

```nginx
# Nginx Configuration - STRICT TLS
server {
    # Disabilita TLS 1.0, 1.1 (vulnerabili)
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Only strong ciphers
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    
    # HSTS: Force HTTPS per 1 anno
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Certificate from Let's Encrypt (auto-renew)
    ssl_certificate /etc/letsencrypt/live/app.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.com/privkey.pem;
    
    # OCSP Stapling (verifica revoca certificati)
    ssl_stapling on;
    ssl_stapling_verify on;
}
```

### 5.2 Certificate Management

```
CERTIFICATE LIFECYCLE:

1. Acquisition
   - Let's Encrypt (gratuito, auto-renew)
   - Oppure Sectigo/DigiCert (paid)
   
2. Monitoring
   - Cron job check 30 giorni prima scadenza
   - Alert se scade
   
3. Auto-Renewal
   - Certbot renewal (cron ogni giorno)
   - Test renewal prima di deployment
   
4. Revocation
   - Se private key compromessa
   - Revoke immediatamente
   - Deployment nuovo certificate
```

### 5.3 Mutual TLS (mTLS) per Backend-to-Backend

**Per comunicazione Backend ↔ Plaid/Tink APIs**:

```
Backend        Plaid API
   ├─ Client Certificate (mTLS)
   ├─ Valida Plaid Server Certificate
   ├─ Handshake TLS
   └─ Encrypted Channel
```

**Implementazione Node.js**:

```javascript
const https = require('https');
const fs = require('fs');

// Client certificate per mTLS
const agent = new https.Agent({
  cert: fs.readFileSync('/path/to/client-cert.pem'),
  key: fs.readFileSync('/path/to/client-key.pem'),
  ca: fs.readFileSync('/path/to/ca-cert.pem'),
  rejectUnauthorized: true  // CRITICAL: Valida server cert
});

// Richiesta con mTLS
https.get('https://api.plaid.com/...', { agent }, (res) => {
  // Comunicazione sicura
});
```

### 5.4 VPN/Private Network (Render Database)

```
RENDER SETUP:

┌─────────────┐
│ Backend     │
│ (Render)    │──── Private Link ───┬──── Public Internet
│             │                      │
└─────────────┘                      └─ Render PostgreSQL (Private)
                                        - No public IP
                                        - Only accessible from private link
                                        - Encrypted in transit
```

---

## 6. LAYER 3: APPLICATION SECURITY

### 6.1 Authentication - CRITICO

#### 6.1.1 Password Storage - NON NEGOTIABLE

```javascript
// ❌ ASSOLUTAMENTE VIETATO
const password = req.body.password;  // Mai in chiaro
const hash = SHA256(password);       // Troppo veloce (crackable)
db.users.insert({ password: hash }); // Vulnerabile

// ✅ CORRETTO (bcrypt con rounds=12)
const bcrypt = require('bcrypt');

const password = req.body.password;
const salt = await bcrypt.genSalt(12);  // ~200ms per password
const hash = await bcrypt.hash(password, salt);

// Non salvare salt separato (bcrypt lo include)
db.users.insert({ password_hash: hash });
```

**Perché rounds=12?**

```
Rounds=10: ~10ms per hash   → Attacker: ~1000 password/sec
Rounds=12: ~200ms per hash  → Attacker: ~50 password/sec
Rounds=14: ~4s per hash     → Attacker: ~0.25 password/sec

Con GPU attacker:
Rounds=10: 1 miliardo password/sec (molto veloce per crackare)
Rounds=12: 50 milioni password/sec (ancora crackabile)
Rounds=14: 250mila password/sec (difficile, ma possibile con budget)

Migliore: Rounds=12 balance tra security e user experience.
```

#### 6.1.2 Multi-Factor Authentication (2FA/MFA)

**Obbligatorio implementare, ma opzionale per user**:

```
METODI 2FA (in ordine di preferenza):

1. ✅ TOTP (Time-based One-Time Password)
   - App: Google Authenticator, Authy
   - Come: User scansiona QR code
   - Token: Valido 30 secondi
   - Vantaggio: Offline, no SMS fees, immune phishing
   - Svantaggio: Utente perde accesso se perde device
   
2. ✅ SMS OTP (Backup only)
   - Carrier: Twilio con geo-verification
   - Token: 6 cifre, valido 10 minuti
   - Vantaggio: Facile, universal (qualsiasi phone)
   - Svantaggio: SIM swapping, SMS interception, fees
   - NOTA: Non usare come UNICO metodo!
   
3. ✅ Email OTP (Backup only)
   - Come: Link/codice via email
   - Token: 32 char random, valido 1 ora
   - Vantaggio: Nessun costo, no phishing
   - Svantaggio: Email compromise
   
4. ❌ Security Questions (NON usare)
   - Dati spesso pubblici (DOB, luogo nascita)
   - Crackabile con OSINT
   
5. ❌ SMS-only 2FA (NON usare come primario)
   - Vulnerabile a SIM swapping attacks
   - Carrier can be forced to port number
```

**Implementazione TOTP Sicura**:

```javascript
const speakeasy = require('speakeasy');

// 1. Generazione Secret al primo setup 2FA
const secret = speakeasy.generateSecret({
  name: 'FlyWallets (' + user.email + ')',
  issuer: 'FlyWallets',
  length: 32  // 32 bytes = 256 bit entropy
});

// Secret: JBSWY3DPEBLW64TMMQ======
// QR Code: generiamo con qrcode lib

// 2. User scansiona QR in authenticator app
// 3. User inserisce primo codice (verifica)

const userToken = '123456';  // Da authenticator
const verified = speakeasy.totp.verify({
  secret: secret.base32,
  encoding: 'base32',
  token: userToken,
  window: 1  // Tollera 30 sec drift
});

if (verified) {
  // Salva secret criptato
  db.users.update(user_id, {
    two_factor_secret_encrypted: encrypt(secret.base32),
    two_factor_enabled: true
  });
}

// 4. Ogni login con 2FA abilitato:
//    - Dopo password OK
//    - Chiedi TOTP token
//    - Valida come sopra
```

### 6.2 Authorization - Role-Based Access Control (RBAC)

```javascript
// ❌ SBAGLIATO
app.get('/api/users/:user_id/data', (req, res) => {
  const data = db.users.findById(req.params.user_id);
  return res.json(data);  // Ogni utente vede dati di chiunque!
});

// ✅ CORRETTO
app.get('/api/users/:user_id/data', authenticateJWT, (req, res) => {
  const requestedUserId = req.params.user_id;
  const currentUserId = req.user.id;  // Dal JWT
  
  // Authorization check
  if (requestedUserId !== currentUserId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const data = db.users.findById(requestedUserId);
  return res.json(data);
});
```

**Database-Level Authorization: Row-Level Security (RLS)**

```sql
-- PostgreSQL RLS: even stronger protection

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: User vede solo i propri dati
CREATE POLICY user_isolation ON manual_accounts
FOR SELECT
USING (user_id = current_user_id());

-- Anche se backend ha bug, DB bloccherà cross-access
```

### 6.3 Input Validation - CRITICAL

```javascript
// ❌ SBAGLIATO: Trust user input
app.post('/api/users', (req, res) => {
  const user = {
    email: req.body.email,
    name: req.body.name,
    is_admin: req.body.is_admin  // ❌ User set admin!
  };
  db.users.insert(user);
});

// ✅ CORRETTO: Validate strictly
const { body, validationResult } = require('express-validator');

app.post('/api/users',
  body('email')
    .isEmail()
    .normalizeEmail()
    .trim(),
  body('name')
    .isLength({ min: 2, max: 100 })
    .trim()
    .escape(),  // Remove < > & " '
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),  // Complexity
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const user = {
      email: req.body.email,
      name: req.body.name,
      is_admin: false  // ✅ Backend set, not user
    };
    db.users.insert(user);
  }
);
```

### 6.4 SQL Injection Prevention

```javascript
// ❌ VULNERABILE: String concatenation
const email = req.body.email;
const query = `SELECT * FROM users WHERE email = '${email}'`;
db.query(query);  // If email = "' OR 1=1 --" → tutti i users!

// ✅ CORRETTO: Parameterized queries (prepared statements)
const email = req.body.email;
const query = 'SELECT * FROM users WHERE email = $1';
db.query(query, [email]);  // Email treated as literal value

// Anche con SQL injection attempt:
// email = "' OR 1=1 --"
// Query: SELECT * FROM users WHERE email = $1
// Param 1: "' OR 1=1 --"
// → Nessun match, sicuro!
```

### 6.5 CSRF Protection

```javascript
// ✅ SameSite Cookie (primary defense)
app.use(session({
  cookie: {
    httpOnly: true,
    secure: true,  // HTTPS only
    sameSite: 'strict'  // ← CRITICAL
    // Previene CSRF attacks completamente
  }
}));

// ✅ CSRF Token (secondary defense, per form submissions)
app.get('/register', (req, res) => {
  const csrfToken = generateCSRFToken();
  req.session.csrfToken = csrfToken;
  res.render('register', { csrfToken });
});

app.post('/register', (req, res) => {
  if (req.body._csrf !== req.session.csrfToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  // Process registration
});
```

### 6.6 XSS Prevention

```javascript
// ❌ VULNERABILE: Unsafe HTML rendering
const userComment = req.body.comment;
res.send(`<div>${userComment}</div>`);  // If comment = "<img src=x onerror=alert(1)>"

// ✅ CORRETTO: Template escaping
const userComment = req.body.comment;
res.render('page', { comment: userComment });  // Template engine escapes automatically

// In frontend React:
<div>{userComment}</div>  // ✅ Scoped (React escapes by default)
<div dangerouslySetInnerHTML={{__html: userComment}} />  // ❌ Unsafe!

// ✅ Content Security Policy header
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

### 6.7 Token Security

```javascript
// JWT Token Storage (Frontend)

// ❌ SBAGLIATO: localStorage (vulnerabile XSS)
localStorage.setItem('token', jwtToken);
// Se malicious JS inject, legge: localStorage.getItem('token')

// ✅ CORRETTO: HttpOnly Cookie (immune XSS)
// Backend set nel response header
res.cookie('access_token', jwtToken, {
  httpOnly: true,    // JS non può accedere
  secure: true,      // HTTPS only
  sameSite: 'strict' // CSRF protection
  // maxAge: 3600000   // 1 hour
});
// Frontend non sa mai il token value
// Browser invia automaticamente nei request headers
```

### 6.8 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// Login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minuti
  max: 5,                     // 5 tentativi max
  message: 'Too many login attempts, retry later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip se IP è whitelist (office, partners)
    return whitelist.includes(req.ip);
  }
});

// Register limiter (stricter)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 ora
  max: 3,                     // 3 account max per IP per ora
  keyGenerator: (req) => req.ip  // Per IP, non per user
});

// API limiter (general)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minuto
  max: 100,                  // 100 req per minuto
  keyGenerator: (req) => req.user.id || req.ip  // Per user se loggato
});

app.post('/api/auth/login', loginLimiter, handleLogin);
app.post('/api/auth/register', registerLimiter, handleRegister);
app.use('/api/', apiLimiter);
```

---

## 7. LAYER 4: DATA SECURITY

### 7.1 Encryption at Rest

```javascript
// Campi che DEVONO essere criptati nel DB:

const crypto = require('crypto');

// Encryption utility
function encryptField(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// Campi da criptare:

// 1. Bank Account Tokens
const accessTokenEncrypted = encryptField(
  plaidAccessToken,
  process.env.ENCRYPTION_KEY
);
db.bank_accounts.insert({
  access_token_encrypted: accessTokenEncrypted.encrypted,
  access_token_iv: accessTokenEncrypted.iv,
  access_token_tag: accessTokenEncrypted.authTag
});

// 2. 2FA Secrets
const totpSecret = generateTOTPSecret();
const secretEncrypted = encryptField(totpSecret, process.env.ENCRYPTION_KEY);
db.users.update(user_id, {
  two_factor_secret_encrypted: secretEncrypted.encrypted
});

// 3. Sensitive PII (optional, depends on risk profile)
// Se vogliamo proteggere da data breaches anche moderati
const cfEncrypted = encryptField(user.codiceFiscale, process.env.ENCRYPTION_KEY);
db.user_individuals.update(user_id, {
  fiscal_code_encrypted: cfEncrypted.encrypted
});
```

**Key Management - CRITICAL**:

```
❌ SBAGLIATO
- Chiave hardcodata nel codice
- Chiave in .env file (se repo leaked)
- Chiave nella stessa DB (accesso DB = accesso keys)

✅ CORRETTO
- AWS Secrets Manager (o Hashicorp Vault)
- Backend fetch key at startup
- Key rotate ogni 90 giorni
- Separate access controls per key
```

### 7.2 Encryption in Transit

```
Tutti i dati in movimento:
├─ Browser ↔ Backend: HTTPS (TLS 1.2+)
├─ Backend ↔ Database: Encrypted connection (SSL/TLS)
├─ Backend ↔ Third-parties (Plaid, Twilio, etc): TLS + mTLS
└─ Database Backups: Encrypted at rest + encrypted transmission
```

---

## 8. LAYER 5: MONITORING & INCIDENT RESPONSE

### 8.1 Logging Strategy

```
COSA LOGGARE (Security-critical events):

1. Authentication Events
   - Successful login (IP, device, time)
   - Failed login attempts (email, IP, count)
   - Password change (user, time)
   - 2FA enable/disable (user, time)
   
2. Authorization Events
   - Access to sensitive data (user, resource, time)
   - Permission changes (who changed, what, when)
   
3. Data Modification Events
   - Create/Update/Delete on critical tables
   - Who, what, when, before/after values
   
4. Administrative Events
   - User suspension (who, why, when)
   - Account deletion requests
   - Settings changes
   
5. Security Events
   - Failed 2FA attempts (count, lockout)
   - Rate limit triggers
   - WAF blocks
   - Suspicious patterns (same user, multiple IPs)

WHERE TO LOG:

┌────────────────┐
│ Application    │ → Local file + stdout (Docker logs)
│ Logs           │
└────────────────┘
        ↓ (shipped via Fluent-Bit/Logstash)
┌────────────────┐
│ Centralized    │ → ELK Stack / Datadog / Splunk
│ Log            │ → Retention: 90 days minimum
│ Aggregation    │ → Alerting on suspicious patterns
└────────────────┘
        ↓
┌────────────────┐
│ SIEM           │ → Correlate events across systems
│ (Security      │ → Detect attack patterns
│ Information    │ → Generate alerts
│ Event Mgmt)    │
└────────────────┘
        ↓
┌────────────────┐
│ Incident       │ → On-call engineers
│ Response       │ → Escalation procedures
│ Team           │ → Post-mortem analysis
└────────────────┘
```

**Example Logging Implementation**:

```javascript
// Logger setup
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),  // Structured logging for SIEM
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage
app.post('/api/auth/login', async (req, res) => {
  const { email, ip, userAgent } = req.body;
  
  const user = await findUser(email);
  
  if (!user) {
    logger.warn('Login attempt: user not found', {
      email,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM'
    });
    return res.status(401).send('Invalid credentials');
  }
  
  const passwordMatch = await bcrypt.compare(req.body.password, user.password_hash);
  
  if (!passwordMatch) {
    logger.warn('Login attempt: wrong password', {
      user_id: user.id,
      email,
      ip,
      userAgent,
      attempt_count: incrementAttemptCounter(user.id),
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM'
    });
    return res.status(401).send('Invalid credentials');
  }
  
  logger.info('User login successful', {
    user_id: user.id,
    email,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
    severity: 'LOW'
  });
  
  // Continue with login
});
```

### 8.2 Security Monitoring Alerts

```
CRITICAL ALERTS (Page on-call immediately):

1. Multiple failed logins (>10 in 1 hour)
   → Possible brute force attack
   
2. Login from unusual location
   → Compare IP geolocation vs historical
   → Alert if different country/continent
   
3. Access to sensitive data from unusual IP
   → Database export, bulk transactions read
   
4. Rate limiter triggered for >100 times
   → Possible scraping/enumeration attack
   
5. Database backup missing
   → Could indicate ransomware attack
   
6. Secrets Manager access failure
   → Could indicate attacker trying to rotate keys
   
7. WAF blocking >1000 requests from same IP
   → DDoS or exploit scanning
   
8. User data export request from new device
   → Possible account compromise
   
9. Multiple password reset requests (>3 in 1 hour)
   → Possible takeover attempt
   
10. Admin account activity outside business hours
    → Insider threat or compromise
```

### 8.3 Incident Response Playbook

```
DETECTED: Possible unauthorized access to user accounts

IMMEDIATE (First 5 minutes):
1. [ ] Page on-call security team
2. [ ] Isolate affected systems (NOT complete shutdown yet)
3. [ ] Preserve evidence (don't delete logs)
4. [ ] Notify CTO/Security Lead
5. [ ] Open incident ticket with timeline

SHORT-TERM (5-30 minutes):
1. [ ] Determine scope (how many users affected?)
2. [ ] Check for data exfiltration (DB audit logs)
3. [ ] Review WAF/access logs for attack pattern
4. [ ] Check if credentials exposed (breach database)
5. [ ] Assess business impact (notify legal/insurance)

MEDIUM-TERM (30 min - 2 hours):
1. [ ] Force logout all affected users
2. [ ] Reset passwords of affected users
3. [ ] Enable mandatory 2FA for affected users
4. [ ] Block attacker IP at WAF
5. [ ] Patch vulnerability if identified
6. [ ] Review third-party access (employees, contractors)

NOTIFICATION (if required):
1. [ ] Affected users (transparent communication)
2. [ ] Regulators (if required by GDPR/PSD2)
3. [ ] Insurance company
4. [ ] Legal counsel

POST-INCIDENT (24-48 hours):
1. [ ] Root cause analysis
2. [ ] Why was it not caught by monitoring?
3. [ ] Update incident response playbook
4. [ ] Implement preventive measures
5. [ ] Post-mortem with team
```

---

## 9. COMPLIANCE & REGULATORY REQUIREMENTS

### 9.1 GDPR Compliance

```
GDPR Requirements for FlyWallets:

1. LAWFUL BASIS FOR PROCESSING
   - Consent (explicit for marketing)
   - Contract (terms of service)
   - Legal obligation (KYC/AML)
   - Legitimate interest (fraud prevention)

2. DATA MINIMIZATION
   - Collect ONLY what's necessary
   - NOT: User's browser history
   - YES: Email, fiscal code, address

3. STORAGE LIMITATION
   - Not indefinitely
   - Delete after 90 days if no activity
   - Transactions: keep for 7 years (tax requirement)
   - Marketing data: delete after 2 years

4. USER RIGHTS
   - Right to Access (GET /api/user/data/export)
   - Right to Rectification (edit profile)
   - Right to Erasure (DELETE account)
   - Right to Data Portability (export as JSON/CSV)
   - Right to Restrict Processing (pause analytics)

5. BREACH NOTIFICATION
   - MUST notify users within 72 hours
   - MUST notify authorities if "high risk"
   - Keep documentation of breach

6. DATA PROTECTION BY DESIGN
   - Encryption by default
   - Minimal permissions
   - Regular audits
   - Privacy impact assessments
```

### 9.2 PSD2 Compliance

```
PSD2 Requirements for Open Banking Integration:

1. STRONG CUSTOMER AUTHENTICATION (SCA)
   - 2FA for accessing bank data
   - Exemptions: <€30, repeat transactions

2. SECURE COMMUNICATION
   - TLS 1.2 minimum
   - Certificate pinning (optional but recommended)

3. API SECURITY
   - OAuth 2.0 for authorization
   - No password sharing with bank
   - Scope limiting (read-only by default)

4. CONSENT MANAGEMENT
   - Explicit consent before accessing accounts
   - Consent expiry (typically 90 days)
   - Revocation capability
   - Consent audit trail

5. ERROR HANDLING
   - No sensitive info in error messages
   - Log for audit trail
   - Proper HTTP status codes
```

---

## 10. VULNERABILITY SCANNING & TESTING

### 10.1 Static Analysis (SAST)

```
Tools:
- Semgrep (pattern-based, good for custom rules)
- SonarQube (comprehensive, works with all languages)
- CodeQL (GitHub native, excellent for SQL injection)
- Snyk (focuses on dependencies)

Setup:
- Run in CI/CD pipeline
- Every commit
- Fail build if critical issues found
- Weekly full scans
```

### 10.2 Dynamic Analysis (DAST)

```
Tools:
- OWASP ZAP (open source)
- Burp Suite Pro (industry standard)
- Nessus (network scanner)

Schedule:
- Daily scan of staging environment
- Weekly full penetration test
- Quarterly third-party pentest
```

### 10.3 Software Composition Analysis (SCA)

```
Tools:
- npm audit (built-in for Node.js)
- Snyk (comprehensive)
- WhiteSource (enterprise)
- Dependabot (GitHub native)

CI/CD Integration:
npm install
npm audit --audit-level=moderate
# Fails if vulnerabilities found

Maintenance:
- Update dependencies monthly
- Security updates immediately
- Major version updates quarterly
```

---

## 11. SECRETS MANAGEMENT

### 11.1 Secrets That Need Protection

```
1. Database credentials
2. JWT signing keys
3. Third-party API keys (Plaid, Twilio, Stripe)
4. Encryption keys
5. Email service credentials
6. S3/Cloud storage credentials
7. Admin panel credentials
8. Private keys for certificate signing
```

### 11.2 How to Store Secrets - CORRECT WAY

```
❌ SBAGLIATO
- Hardcoded in source code
- In .env file committed to git
- In Docker image
- In CloudFormation/Terraform files visible in git

✅ CORRETTO
┌─────────────────────────────────────┐
│ AWS Secrets Manager / HashiCorp Vault│
│ - Centralized secret storage         │
│ - Encryption at rest                 │
│ - Access control per secret          │
│ - Audit logging of access            │
│ - Automatic rotation (optional)       │
│ - Versioning                         │
└─────────────────────────────────────┘

Backend startup:
1. Authenticate to Secrets Manager (IAM role)
2. Fetch all secrets
3. Load into environment variables
4. Never log secrets
```

---

## 12. INFRASTRUCTURE SECURITY

### 12.1 Cloud Misconfiguration Prevention

```
AWS/Cloud Risks:

1. S3 Bucket Public Access
   ❌ Accidentally public bucket with user data
   ✅ Default: BLOCK public access
   ✅ Use CloudFront for distribution
   ✅ Require presigned URLs for access

2. Security Groups Too Open
   ❌ Database accessible from 0.0.0.0:3306
   ✅ Restrict to backend security group only
   ✅ Whitelist specific IPs for admin

3. IAM Permissions Over-Privileged
   ❌ Lambda can read/write all S3 buckets
   ✅ Least privilege: read specific bucket only
   ✅ Use resource-based policies

4. Backup Not Encrypted
   ❌ RDS backup unencrypted
   ✅ Enable encryption at rest + in transit
   ✅ Multi-region backup

5. CloudTrail Not Enabled
   ❌ No audit of who accessed what
   ✅ Enable CloudTrail for all regions
   ✅ Store logs in protected S3 bucket

6. Secrets in Environment Variables
   ❌ AWS Lambda environment variables visible in console
   ✅ Use AWS Secrets Manager / Parameter Store
   ✅ Reference in Lambda via SDK
```

### 12.2 Network Isolation

```
VPC Configuration:

┌─────────────────────────────────────┐
│ AWS VPC (Private Network)           │
├─────────────────────────────────────┤
│                                     │
│  Public Subnet (NAT Gateway)        │
│  ├─ ALB (Application Load Balancer) │
│  └─ Internet Gateway                │
│                                     │
│  Private Subnet (Backend)           │
│  ├─ EC2 / ECS (Backend API)        │
│  ├─ ALB only in same VPC            │
│  └─ No internet access              │
│                                     │
│  Private Subnet (Database)          │
│  ├─ RDS PostgreSQL                  │
│  ├─ Only Backend can access         │
│  ├─ No direct internet access       │
│  └─ Encrypted at rest + in transit  │
│                                     │
│  Private Subnet (Redis/Cache)       │
│  ├─ ElastiCache Redis               │
│  ├─ Only Backend can access         │
│  └─ Encrypted in transit            │
│                                     │
└─────────────────────────────────────┘
```

---

## 13. SECURITY TESTING SCHEDULE

### 13.1 Continuous Testing

```
EVERY COMMIT:
- npm audit (dependencies)
- Linting (code quality)
- Unit tests (functionality)

EVERY DAY:
- SAST (static analysis)
- Dependency scanning
- Container scanning

EVERY WEEK:
- DAST (dynamic analysis)
- Security scanning
- Log review

EVERY MONTH:
- Penetration testing
- Vulnerability patching
- Access review

EVERY QUARTER:
- Third-party security audit
- Compliance audit
- Disaster recovery drill

ANNUALLY:
- Full penetration test
- Security awareness training
- Architecture review
```

---

## 14. INCIDENT RESPONSE REQUIREMENTS

### 14.1 Detection & Response Time Targets (SLA)

```
Critical Incidents (RTO/RTCritical: 1 hour)
├─ Database breach
├─ Unauthorized access to user accounts
├─ DDoS attack impacting service
└─ Ransomware encryption

High Incidents (RTO/RTC: 4 hours)
├─ SQL injection vulnerability
├─ Unauthorized privilege escalation
├─ WAF misconfiguration
└─ Certificate expiration

Medium Incidents (RTO/RTC: 24 hours)
├─ Failed login attempts
├─ Unusual access patterns
├─ Rate limiting triggered
└─ Malware detection

Low Incidents (RTO/RTC: 7 days)
├─ Deprecation warnings
├─ Update notifications
├─ Non-critical findings
└─ Documentation issues
```

---

## 15. SECURITY CHECKLIST - PRE-PRODUCTION

```
INFRASTRUCTURE
- [ ] HTTPS/TLS 1.2+ configured
- [ ] HSTS header set (min 1 year)
- [ ] WAF rules enabled
- [ ] DDoS protection active
- [ ] VPC isolation correct
- [ ] Security groups configured
- [ ] Database not publicly accessible
- [ ] CloudTrail enabled
- [ ] S3 buckets not public
- [ ] Backup encryption enabled
- [ ] Multi-region failover ready

APPLICATION
- [ ] Input validation on ALL fields
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection (CSP header, template escaping)
- [ ] CSRF protection (SameSite cookies)
- [ ] Authentication working (bcrypt, 12 rounds)
- [ ] Authorization checks every endpoint
- [ ] Rate limiting configured
- [ ] Secrets in Secrets Manager (not .env)
- [ ] No hardcoded credentials
- [ ] Encryption key rotation policy

DATA
- [ ] Sensitive data encrypted at rest
- [ ] Encryption key separately stored
- [ ] Database credentials strong
- [ ] Backup encryption enabled
- [ ] Retention policies defined
- [ ] GDPR rights implemented (export, delete)
- [ ] PII handling compliant
- [ ] Audit logging enabled

MONITORING
- [ ] Centralized logging configured
- [ ] SIEM/alerting setup
- [ ] Security alerts configured
- [ ] Incident response playbook ready
- [ ] On-call schedule established
- [ ] Log retention 90+ days
- [ ] Access logs archived
- [ ] Failed login monitoring

DEPENDENCIES
- [ ] npm audit clean (zero vulnerabilities)
- [ ] All dependencies updated
- [ ] Docker image scanned
- [ ] No deprecated libraries
- [ ] SCA tool configured in CI/CD

DOCUMENTATION
- [ ] Security architecture documented
- [ ] Threat model documented
- [ ] Incident response playbook ready
- [ ] Security policies documented
- [ ] Employee security training completed
- [ ] Third-party vendor security reviewed
```

---

## 16. IMPORTANT: DATA BREACH WORST CASE

### 16.1 What if Security is Breached?

```
Se i dati vengono compromessi:

USERS ARE HARMED:
✓ Identity theft
✓ Bank fraud
✓ Financial loss
✓ Emotional distress
✓ Damaged trust in online banking

COMPANY IS HARMED:
✓ Legal liability (sued by users)
✓ Regulatory fines (GDPR €20M+ or 4% revenue)
✓ Reputational damage (media coverage)
✓ Customer exodus (lost revenue)
✓ Insurance costs increase
✓ Credit downgrade
✓ Partnership loss (banks won't integrate)
✓ Criminal investigation (possible jail time for CTO/CEO)

FINANCIAL IMPACT:
┌──────────────────────────────────────┐
│ Cost of Data Breach (100k users)      │
├──────────────────────────────────────┤
│ Notification costs: €500k             │
│ Legal/forensics: €1M                  │
│ Regulatory fines: €5-20M              │
│ Reputational damage: €10M             │
│ Customer compensation: €2M            │
│ Lost business: €50M+                  │
│                                       │
│ TOTAL: €68-83M+ for startup!          │
│                                       │
│ Compare to: Spending €500k on security │
│            = Good ROI (136:1)         │
└──────────────────────────────────────┘
```

---

## 17. FINAL WORDS FOR SENIOR DEVELOPERS

### 17.1 Security Mindset

```
🔴 CRITICAL PRINCIPLE:

"Never assume security is added later."
"Never assume users won't do bad things."
"Never assume your code is secure."
"Never assume a single layer is enough."

✅ INSTEAD, ADOPT:

1. THREAT MODELING
   - Think like attacker
   - What data is valuable?
   - What's the worst case?
   - How would I attack this?

2. SECURE DEFAULTS
   - Deny by default, allow explicitly
   - Encryption on by default
   - Logging on by default
   - Rate limiting on by default

3. DEFENSE IN DEPTH
   - Multiple layers
   - Independent protection
   - Fail secure (don't expose data on error)

4. LEAST PRIVILEGE
   - User has minimal permissions
   - Each component has minimal permissions
   - Database has minimal permissions
   - Even if one is compromised, damage is limited

5. FAIL SECURELY
   - Errors don't expose information
   - Don't log sensitive data
   - Don't give user clues about vulnerabilities
   - Always return same error for "not found" vs "wrong password"
```

### 17.2 Common Mistakes

```
❌ COMMON DEVELOPER MISTAKES

1. "I'll add authentication later"
   → Built insecure, hard to fix after

2. "Just use the default password for testing"
   → Ships to production

3. "Nobody will find this endpoint"
   → Automatic scanning finds it

4. "This library is popular, must be secure"
   → Supply chain compromise possible

5. "The WAF will catch SQL injection"
   → Defense in depth, not reliance on single layer

6. "I'll encrypt passwords with SHA256"
   → No salt, crackable with modern GPUs

7. "Logging sensitive data for debugging"
   → Data breaches expose in logs

8. "Secrets in environment variables"
   → Cloud dashboards expose them

9. "Testing only happy path"
   → Attackers test 1000 edge cases

10. "Security review at end of project"
    → Too late to fix architecture
```

### 17.3 Red Flags in Code Review

```
🚨 IMMEDIATELY REJECT PULL REQUESTS WITH:

1. Strings concatenated into SQL queries
2. Passwords not hashed with bcrypt/scrypt/Argon2
3. Secrets in code or .env files
4. No input validation on user input
5. No authorization checks on endpoints
6. Sensitive data logged
7. CORS allowing wildcard origins
8. No HTTPS/TLS enforcement
9. Token stored in localStorage
10. Comments with credentials/keys
11. "TODO: Fix security" comments
12. Error messages revealing system info
13. No rate limiting on auth endpoints
14. Database accessible from internet
15. Commented-out security checks
```

---

## 18. SECURITY = BUSINESS REQUIREMENT

**Non è un "nice to have".**

FlyWallets maneggia **denaro reale e identità reale**.

Una falla di sicurezza non è un bug minore da aggiustare dopo.

È un **rischio existenziale** per l'azienda.

**Investire in sicurezza dall'inizio:**
- Costa meno che aggiustare dopo
- Mantiene la fiducia degli utenti
- Soddisfa compliance
- Protegge l'azienda legalmente
- È il **right thing to do**

---

## REFERENCES & RESOURCES

```
OWASP Resources:
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

Security Guidelines:
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- CWE/SANS Top 25: https://cwe.mitre.org/top25/

Compliance:
- GDPR Full Text: https://gdpr-info.eu/
- PSD2 Guidelines: https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money

Tools:
- OWASP ZAP: https://www.zaproxy.org/
- Snyk: https://snyk.io/
- npm audit: Built-in to npm

Books:
- "The Web Application Hacker's Handbook" - Stuttard & Pinto
- "Security Engineering" - Ross Anderson
- "OWASP Testing Guide" - Free online
```

---

**FINAL NOTE**: Security is not a feature. It's the foundation. Build it right from the start.

