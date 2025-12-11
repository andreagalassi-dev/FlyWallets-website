# Schema Database - Definizione Testuale Completa

## 1. TABELLA: users

**Descrizione**: Informazioni base di tutti gli utenti (persone fisiche e aziende)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| email | TEXT | UNIQUE, NOT NULL, INDEX | Email utente |
| email_verified | BOOLEAN | DEFAULT false | Flag verifica email |
| email_verified_at | TIMESTAMP | NULLABLE | Data/ora verifica email |
| phone_number | TEXT | UNIQUE, NULLABLE, INDEX | Numero telefono |
| phone_verified | BOOLEAN | DEFAULT false | Flag verifica telefono |
| phone_verified_at | TIMESTAMP | NULLABLE | Data/ora verifica telefono |
| password_hash | TEXT | NOT NULL | Hash bcrypt della password |
| password_salt | TEXT | NOT NULL | Salt per password |
| password_changed_at | TIMESTAMP | DEFAULT NOW | Ultima modifica password |
| two_factor_enabled | BOOLEAN | DEFAULT false | 2FA attivo? |
| two_factor_method | TEXT | NULLABLE | Metodo 2FA: 'sms', 'email', 'authenticator_app' |
| two_factor_secret_encrypted | TEXT | NULLABLE | Secret criptato per authenticator app |
| terms_accepted | BOOLEAN | DEFAULT false | Termini accettati? |
| terms_accepted_at | TIMESTAMP | NULLABLE | Data/ora accettazione termini |
| privacy_accepted | BOOLEAN | DEFAULT false | Privacy accettata? |
| privacy_accepted_at | TIMESTAMP | NULLABLE | Data/ora accettazione privacy |
| marketing_consent | BOOLEAN | DEFAULT false | Consenso marketing? |
| user_type | TEXT | NOT NULL, CHECK IN ('individual', 'business') | Tipo utente |
| is_active | BOOLEAN | DEFAULT true, INDEX | Account attivo? |
| is_suspended | BOOLEAN | DEFAULT false | Account sospeso? |
| suspension_reason | TEXT | NULLABLE | Motivo sospensione |
| stripe_customer_id | TEXT | NULLABLE | ID cliente Stripe (per pagamenti) |
| subscription_plan | TEXT | DEFAULT 'free' | Piano: 'free', 'pro', 'premium' |
| subscription_expires_at | TIMESTAMP | NULLABLE | Scadenza abbonamento |
| created_at | TIMESTAMP | DEFAULT NOW, INDEX | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data ultimo aggiornamento |
| last_login_at | TIMESTAMP | NULLABLE | Ultimo accesso |
| profile_public | BOOLEAN | DEFAULT false | Profilo pubblico? |

---

## 2. TABELLA: user_individuals

**Descrizione**: Dati personali di persone fisiche

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, UNIQUE, NOT NULL, ON DELETE CASCADE | Collegamento a utente |
| first_name | TEXT | NOT NULL | Nome |
| last_name | TEXT | NOT NULL | Cognome |
| fiscal_code | TEXT | UNIQUE, NOT NULL, INDEX | Codice Fiscale italiano |
| date_of_birth | DATE | NOT NULL | Data di nascita |
| place_of_birth | TEXT | NOT NULL | Città di nascita |
| nationality | TEXT | DEFAULT 'IT' | Nazionalità |
| address_street | TEXT | NOT NULL | Via/Indirizzo |
| address_city | TEXT | NOT NULL, INDEX | Città |
| address_postal_code | TEXT | NOT NULL | CAP |
| address_province | TEXT | NOT NULL | Provincia |
| address_country | TEXT | DEFAULT 'IT' | Paese |
| identity_document_type | TEXT | NULLABLE | Tipo: 'passport', 'id_card', 'drivers_license' |
| identity_document_number | TEXT | NULLABLE | Numero documento |
| identity_document_expiry | DATE | NULLABLE | Scadenza documento |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |

---

## 3. TABELLA: user_businesses

**Descrizione**: Dati aziendali e informazioni legali

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, UNIQUE, NOT NULL, ON DELETE CASCADE | Collegamento a utente |
| company_name | TEXT | NOT NULL, INDEX | Ragione sociale |
| vat_number | TEXT | UNIQUE, NOT NULL, INDEX | Partita IVA |
| business_type | TEXT | NULLABLE | Tipo: 'srl', 'spa', 'snc', 'ditta_individuale', 'cooperativa' |
| owner_first_name | TEXT | NOT NULL | Nome titolare |
| owner_last_name | TEXT | NOT NULL | Cognome titolare |
| owner_fiscal_code | TEXT | NOT NULL | Codice fiscale titolare |
| address_street | TEXT | NOT NULL | Via sede legale |
| address_city | TEXT | NOT NULL, INDEX | Città sede legale |
| address_postal_code | TEXT | NOT NULL | CAP |
| address_province | TEXT | NOT NULL | Provincia |
| address_country | TEXT | DEFAULT 'IT' | Paese |
| operational_address_street | TEXT | NULLABLE | Via indirizzo operativo |
| operational_address_city | TEXT | NULLABLE | Città operativo |
| operational_address_postal_code | TEXT | NULLABLE | CAP operativo |
| operational_address_province | TEXT | NULLABLE | Provincia operativa |
| operational_address_country | TEXT | NULLABLE | Paese operativo |
| phone_business | TEXT | NULLABLE | Telefono aziendale |
| website | TEXT | NULLABLE | Sito web |
| ateco_code | TEXT | NULLABLE, INDEX | Codice ATECO (attività economica) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |

---

## 4. TABELLA: transaction_categories

**Descrizione**: Categorie per le transazioni (predefinite e personalizzate)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NULLABLE, ON DELETE CASCADE | NULL = categoria predefinita, altrimenti personalizzata |
| category_name | TEXT | NOT NULL | Nome categoria: 'Stipendio', 'Spesa', 'Cibo', ecc. |
| category_type | TEXT | NOT NULL, CHECK IN ('income', 'expense', 'both') | Tipo di transazione |
| description | TEXT | NULLABLE | Descrizione estesa |
| color_tag | TEXT | NULLABLE | Colore per UI: 'red', 'blue', 'green', ecc. |
| icon_emoji | TEXT | NULLABLE | Emoji per UI: '💼', '🍔', '💰', ecc. |
| is_system | BOOLEAN | DEFAULT false | Se true, è una categoria di sistema (non eliminabile) |
| is_active | BOOLEAN | DEFAULT true | Categoria attiva? |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |
| UNIQUE(user_id, category_name) | - | Non può avere due categorie personalizzate con lo stesso nome | - |

---

## 5. TABELLA: bank_accounts

**Descrizione**: Conti bancari sincronizzati da provider Open Banking (Plaid, Tink, ecc.)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario conto |
| bank_provider | TEXT | NOT NULL | Provider: 'plaid', 'tink', 'bank_name' |
| provider_account_id | TEXT | NOT NULL | ID esterno dal provider |
| access_token_encrypted | TEXT | NOT NULL | Access token criptato (non memorizzare in chiaro!) |
| refresh_token_encrypted | TEXT | NULLABLE | Refresh token criptato |
| token_expires_at | TIMESTAMP | NULLABLE | Scadenza token |
| account_name | TEXT | NULLABLE | Nome assegnato dall'utente |
| account_iban | TEXT | NULLABLE, INDEX | IBAN conto |
| bank_name | TEXT | NULLABLE | Nome banca |
| account_type | TEXT | NULLABLE | Tipo: 'checking', 'savings', 'credit' |
| account_currency | TEXT | DEFAULT 'EUR' | Valuta |
| consent_expires_at | TIMESTAMP | NULLABLE | Scadenza consenso (PSD2) |
| consent_granted_at | TIMESTAMP | NULLABLE | Data consenso |
| last_synced_at | TIMESTAMP | NULLABLE, INDEX | Ultimo sincronismo |
| is_active | BOOLEAN | DEFAULT true, INDEX | Conto attivo? |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |
| UNIQUE(user_id, provider_account_id) | - | Un utente non può sincronizzare lo stesso conto due volte | - |

---

## 6. TABELLA: manual_accounts

**Descrizione**: Conti creati manualmente dall'utente (non sincronizzati)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario conto |
| account_name | TEXT | NOT NULL | Nome: "Conto Nonna", "Cassa", "Piggy Bank" |
| account_type | TEXT | NOT NULL | Tipo: 'savings', 'checking', 'wallet', 'cash' |
| account_currency | TEXT | DEFAULT 'EUR' | Valuta |
| initial_balance | NUMERIC(18,2) | DEFAULT 0 | Saldo iniziale |
| current_balance | NUMERIC(18,2) | DEFAULT 0, INDEX | Saldo attuale |
| color_tag | TEXT | NULLABLE | Colore per UI |
| icon_emoji | TEXT | NULLABLE | Emoji per UI |
| description | TEXT | NULLABLE | Descrizione |
| overdraft_allowed | BOOLEAN | DEFAULT false | Consente scoperto? |
| overdraft_limit | NUMERIC(18,2) | NULLABLE | Limite scoperto |
| is_active | BOOLEAN | DEFAULT true, INDEX | Conto attivo? |
| is_archived | BOOLEAN | DEFAULT false | Conto archiviato? |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |

---

## 7. TABELLA: transactions

**Descrizione**: Tutte le transazioni (da conti bancari o manuali)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario transazione |
| manual_account_id | UUID | FOREIGN KEY → manual_accounts.id, NULLABLE, ON DELETE CASCADE | Se da conto manuale |
| bank_account_id | UUID | FOREIGN KEY → bank_accounts.id, NULLABLE, ON DELETE CASCADE | Se da conto bancario |
| transaction_date | TIMESTAMP | NOT NULL, INDEX | Data/ora transazione |
| transaction_time | TIME | NULLABLE | Ora specifica (opzionale) |
| amount | NUMERIC(18,2) | NOT NULL | Importo (sempre positivo, il segno è in transaction_type) |
| currency | TEXT | DEFAULT 'EUR' | Valuta |
| transaction_type | TEXT | NOT NULL, INDEX, CHECK IN ('income', 'expense') | Entrata o uscita? |
| description | TEXT | NOT NULL | Descrizione: "Nonna", "Orologio", "Stipendio" |
| category_id | UUID | FOREIGN KEY → transaction_categories.id, NULLABLE, INDEX, ON DELETE SET NULL | Categoria transazione |
| provider_transaction_id | TEXT | NULLABLE | ID esterno dal provider (per evitare duplicati) |
| merchant_name | TEXT | NULLABLE | Nome commerciante (da conto bancario) |
| reference | TEXT | NULLABLE | Numero riferimento/causale |
| is_auto_imported | BOOLEAN | DEFAULT false | Importata automaticamente da API? |
| import_source | TEXT | NULLABLE | Fonte: 'api_plaid', 'api_tink', 'manual' |
| notes | TEXT | NULLABLE | Note personali utente |
| tags | JSON ARRAY | DEFAULT '[]' | Tag personalizzati: ['lavoro', 'importante'] |
| attachment_url | TEXT | NULLABLE | URL ricevuta/allegato |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |
| CHECK | - | (manual_account_id NOT NULL AND bank_account_id NULL) OR (manual_account_id NULL AND bank_account_id NOT NULL) | Una transazione appartiene a un solo conto |

---

## 8. TABELLA: account_balances

**Descrizione**: Snapshot giornalieri dei saldi (per grafici e storico)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario |
| manual_account_id | UUID | FOREIGN KEY → manual_accounts.id, NULLABLE, ON DELETE CASCADE | Se da conto manuale |
| bank_account_id | UUID | FOREIGN KEY → bank_accounts.id, NULLABLE, ON DELETE CASCADE | Se da conto bancario |
| balance_date | DATE | NOT NULL, INDEX | Data dello snapshot |
| balance_amount | NUMERIC(18,2) | NOT NULL | Saldo a quella data |
| currency | TEXT | DEFAULT 'EUR' | Valuta |
| is_manual | BOOLEAN | DEFAULT false | Calcolato manualmente? |
| last_updated_at | TIMESTAMP | DEFAULT NOW | Ultimo aggiornamento |
| UNIQUE(user_id, manual_account_id, bank_account_id, balance_date) | - | Un solo snapshot per conto per data | - |

---

## 9. TABELLA: savings_goals

**Descrizione**: Piani di risparmio/obiettivi finanziari

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario |
| goal_name | TEXT | NOT NULL | Nome: "Vacanza", "Auto nuova", "Emergenza" |
| description | TEXT | NULLABLE | Descrizione |
| goal_category | TEXT | NULLABLE | Categoria: 'vacation', 'purchase', 'emergency', 'education', 'other' |
| target_amount | NUMERIC(18,2) | NOT NULL | Importo target |
| currency | TEXT | DEFAULT 'EUR' | Valuta |
| current_amount | NUMERIC(18,2) | DEFAULT 0, INDEX | Importo raggiunto finora |
| target_date | DATE | NULLABLE, INDEX | Data entro cui raggiungere |
| color_tag | TEXT | NULLABLE | Colore per UI |
| icon_emoji | TEXT | NULLABLE | Emoji per UI |
| priority | INTEGER | DEFAULT 0 | Priorità: 1=alta, 2=media, 3=bassa |
| is_active | BOOLEAN | DEFAULT true, INDEX | Goal attivo? |
| is_completed | BOOLEAN | DEFAULT false | Goal completato? |
| completed_at | TIMESTAMP | NULLABLE | Data completamento |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento |

---

## 10. TABELLA: savings_goal_accounts

**Descrizione**: Collegamento molti-a-molti tra goal e conti che contribuiscono

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| savings_goal_id | UUID | FOREIGN KEY → savings_goals.id, NOT NULL, INDEX, ON DELETE CASCADE | Goal |
| manual_account_id | UUID | FOREIGN KEY → manual_accounts.id, NULLABLE, ON DELETE CASCADE | Conto manuale |
| bank_account_id | UUID | FOREIGN KEY → bank_accounts.id, NULLABLE, ON DELETE CASCADE | Conto bancario |
| contribution_percentage | NUMERIC(5,2) | NULLABLE | Percentuale contribuzione (es. 50%) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| UNIQUE(savings_goal_id, manual_account_id, bank_account_id) | - | Una coppia goal-conto una sola volta | - |

---

## 11. TABELLA: savings_goal_transactions

**Descrizione**: Tracciamento dei contributi verso ogni goal

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| savings_goal_id | UUID | FOREIGN KEY → savings_goals.id, NOT NULL, INDEX, ON DELETE CASCADE | Goal |
| transaction_id | UUID | FOREIGN KEY → transactions.id, NOT NULL, INDEX, ON DELETE CASCADE | Transazione contribuita |
| contributed_amount | NUMERIC(18,2) | NOT NULL | Importo contribuito |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |

---

## 12. TABELLA: audit_logs

**Descrizione**: Log di tutte le azioni importanti per tracciamento e sicurezza

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NULLABLE, INDEX, ON DELETE SET NULL | Utente che ha eseguito l'azione |
| action | TEXT | NOT NULL, INDEX | Azione: 'login', 'account_created', 'transaction_added', 'password_changed' |
| resource_type | TEXT | NULLABLE | Tipo risorsa: 'user', 'transaction', 'account', 'goal' |
| resource_id | TEXT | NULLABLE | ID della risorsa interessata |
| details | JSON | NULLABLE | Dati aggiuntivi in JSON |
| ip_address | TEXT | NULLABLE | Indirizzo IP richiedente |
| user_agent | TEXT | NULLABLE | User agent browser |
| created_at | TIMESTAMP | DEFAULT NOW, INDEX | Data/ora azione |

---

## 13. TABELLA: email_verifications

**Descrizione**: Gestione verifica email (OTP NON MEMORIZZATI - solo stato)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| email | TEXT | NOT NULL | Email da verificare |
| is_verified | BOOLEAN | DEFAULT false | Verificata? |
| verified_at | TIMESTAMP | NULLABLE | Data/ora verifica |
| attempts | INTEGER | DEFAULT 0 | Numero tentativi OTP |
| max_attempts | INTEGER | DEFAULT 3 | Massimo tentativi consentiti |
| locked_until | TIMESTAMP | NULLABLE | Bloccata fino a quando (anti-brute-force) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| expires_at | TIMESTAMP | NOT NULL | Scadenza richiesta verifica (es. 24 ore) |

**IMPORTANTE**: 
- L'OTP viene generato in memoria, inviato via email, e NON viene salvato nel database
- Ogni tentativo di verifica controlla l'OTP fornito direttamente (senza leggere dal DB)
- Solo il flag "is_verified" e il contatore "attempts" sono memorizzati

---

## 14. TABELLA: phone_verifications

**Descrizione**: Gestione verifica telefono (OTP NON MEMORIZZATI - solo stato)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| phone_number | TEXT | NOT NULL | Telefono da verificare |
| is_verified | BOOLEAN | DEFAULT false | Verificato? |
| verified_at | TIMESTAMP | NULLABLE | Data/ora verifica |
| attempts | INTEGER | DEFAULT 0 | Numero tentativi OTP |
| max_attempts | INTEGER | DEFAULT 3 | Massimo tentativi consentiti |
| locked_until | TIMESTAMP | NULLABLE | Bloccato fino a quando (anti-brute-force) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| expires_at | TIMESTAMP | NOT NULL | Scadenza richiesta verifica (es. 24 ore) |

**IMPORTANTE**: 
- L'OTP viene generato in memoria, inviato via SMS, e NON viene salvato nel database
- Ogni tentativo di verifica controlla l'OTP fornito direttamente (senza leggere dal DB)
- Solo il flag "is_verified" e il contatore "attempts" sono memorizzati

---

## 15. TABELLA: password_resets

**Descrizione**: Gestione reset password

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| reset_token | TEXT | UNIQUE, NOT NULL, INDEX | Token per reset (hashato) |
| is_used | BOOLEAN | DEFAULT false | Token usato? |
| used_at | TIMESTAMP | NULLABLE | Data/ora uso |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| expires_at | TIMESTAMP | NOT NULL | Scadenza token (es. 1 ora) |

---

## 16. TABELLA: sessions

**Descrizione**: Gestione sessioni utente attive

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| session_token | TEXT | UNIQUE, NOT NULL, INDEX | Token sessione (hashato) |
| device_name | TEXT | NULLABLE | Nome dispositivo |
| device_type | TEXT | NULLABLE | Tipo: 'mobile', 'desktop', 'tablet' |
| browser | TEXT | NULLABLE | Browser utilizzato |
| ip_address | TEXT | NULLABLE | Indirizzo IP |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione sessione |
| expires_at | TIMESTAMP | NOT NULL, INDEX | Scadenza sessione |

---

## RIEPILOGO CATEGORIE PREDEFINITE (transaction_categories)

Le seguenti categorie verranno create di sistema (is_system = true):

### INCOME (Entrate):
- 💼 Stipendio
- 💰 Bonus
- 🎁 Regalo
- 💸 Rimborso
- 🏦 Interesse
- 📊 Investimenti
- 👔 Altro Reddito

### EXPENSE (Spese):
- 🍔 Cibo & Ristoranti
- 🏠 Affitto & Alloggio
- 📱 Utenze (Luce, Gas, Acqua, Internet)
- 🚗 Trasporti & Auto
- 👕 Abbigliamento & Accessori
- 🎬 Intrattenimento & Hobby
- 🏥 Salute & Medicina
- 📚 Educazione
- 🛍️ Shopping & Negozi
- ✈️ Viaggi
- 💇 Bellezza & Cura Personale
- 🐕 Animali Domestici
- 🎁 Regali
- 💳 Pagamenti Carte
- 🏦 Commissioni Bancarie
- 📊 Investimenti
- 🧹 Pulizia & Manutenzione
- 🎮 Giochi & Divertimento
- 💐 Varie

---

## INDICI CREATI PER PERFORMANCE

```
users.email
users.phone_number
users.is_active
users.created_at

user_individuals.fiscal_code
user_individuals.address_city

user_businesses.company_name
user_businesses.vat_number
user_businesses.address_city
user_businesses.ateco_code

transaction_categories.category_name

bank_accounts.user_id
bank_accounts.last_synced_at
bank_accounts.is_active

manual_accounts.user_id
manual_accounts.current_balance
manual_accounts.is_active

transactions.user_id
transactions.manual_account_id
transactions.bank_account_id
transactions.transaction_date
transactions.transaction_type
transactions.category_id

account_balances.user_id
account_balances.balance_date

savings_goals.user_id
savings_goals.current_amount
savings_goals.target_date
savings_goals.is_active

email_verifications.user_id

phone_verifications.user_id

password_resets.user_id
password_resets.reset_token

sessions.user_id
sessions.session_token
sessions.expires_at

audit_logs.user_id
audit_logs.action
audit_logs.created_at
```

---

## REGOLE DI INTEGRITÀ

1. **Cascata Eliminazione**: Quando un utente viene eliminato, tutte le sue relazioni (conti, transazioni, goal, sessioni, log) vengono eliminate
2. **Unicità Email**: Non possono esistere due utenti con la stessa email
3. **Unicità Telefono**: Un numero di telefono può essere associato a un solo utente
4. **Unicità Codice Fiscale**: Una persona fisica non può avere due codici fiscali
5. **Unicità Partita IVA**: Un'azienda non può avere due P.IVA
6. **Transazione Single Account**: Una transazione deve appartenere a UN SOLO conto (manuale O bancario)
7. **Balance Date Univoco**: Un conto non può avere due snapshot di saldo per lo stesso giorno
8. **Goal Account Univoco**: Uno specifico conto non può essere assegnato due volte allo stesso goal

---

## OPERAZIONI DI SISTEMA AUTOMATICHE

1. **Aggiornamento saldo conto manuale**: Ogni transazione su un conto manuale aggiorna `current_balance`
2. **Snapshot giornaliero**: System job crea entry in `account_balances` ogni notte
3. **Aggiornamento goal progress**: Quando una transazione è assegnata a un goal, aumenta `current_amount`
4. **Session expiry**: Session con `expires_at` passato sono considerate scadute
5. **Token expiry check**: Access token con scadenza superata devono essere rinnovati
6. **Password salt**: Viene rigenerato ogni volta che l'utente cambia password
7. **Audit logging**: Ogni azione sensibile viene loggata in `audit_logs`

---

## SICUREZZA - CAMPI CRIPTATI

I seguenti campi DEVONO essere criptati (cifra/decifratura lato applicazione):
- `users.password_hash` → Hash bcrypt (non decifrabile, solo verificabile)
- `users.two_factor_secret_encrypted` → Secret per authenticator app
- `bank_accounts.access_token_encrypted` → Access token API
- `bank_accounts.refresh_token_encrypted` → Refresh token API

I seguenti campi DEVONO usare hash one-way (non decifrare mai):
- `sessions.session_token` → Hash SHA-256 o simile
- `password_resets.reset_token` → Hash SHA-256 o simile