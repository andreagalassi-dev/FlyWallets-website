# Schema Database - Definizione Testuale Completa

> **Nota sullo stato del documento.** Descrive lo schema di `database/schema.sql` (PostgreSQL 16), aggiornato al codice: **18 tabelle** (le 16 originali + `budgets` e `recurring_transactions`).
> Il file SQL è la fonte di verità; questo documento ne è la versione leggibile. Le colonne/tabelle presenti nello schema ma **non usate dal codice** sono segnate con ❌ "predisposta, non usata".
> Per i database già esistenti vedere `database/migrations/` (solo `001_budgets_recurring.sql` e `002_session_rotation.sql`; nessuna migrazione per `code_hash`, indici univoci degli snapshot e policy RLS aggiornate: in sviluppo ricreare il database).

### Stato d'uso delle tabelle

| Tabella | Usata dal codice | Note |
|---------|:----------------:|------|
| `users`, `user_individuals`, `user_businesses` | ✅ | Registrazione, login, profilo (`authController`) |
| `transaction_categories` | ✅ | 25 categorie di sistema nel seed di `schema.sql` + categorie utente |
| `manual_accounts` | ✅ | Conti manuali, scoperto (`overdraft_allowed`, `overdraft_limit`), archiviazione |
| `transactions` | ✅ | Ledger; `bank_account_id` esiste ma nessun codice crea transazioni bancarie |
| `account_balances` | ✅ | Snapshot giornalieri ricostruiti da `ledgerService` (non da un job notturno) |
| `savings_goals`, `savings_goal_transactions` | ✅ | Obiettivi e contributi |
| `budgets` | ✅ | Limite mensile per categoria (tabella 17) |
| `recurring_transactions` | ✅ | Regole ricorrenti + scheduler (tabella 18) |
| `audit_logs` | ✅ (solo scrittura) | Nessun endpoint di lettura |
| `email_verifications`, `password_resets`, `sessions` | ✅ | OTP email, reset password, refresh token |
| `bank_accounts` | ❌ | Predisposta per Open Banking: nessuna integrazione provider, nessun codice la popola |
| `phone_verifications` | ❌ | Nessun endpoint la usa (la verifica SMS non è implementata) |
| `savings_goal_accounts` | ❌ | Nessun codice la usa |

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

**Stato d'uso**: ✅ `email`, `email_verified(_at)`, `password_*`, `user_type`, `is_active`, `is_suspended`, `last_login_at`, `terms_*`/`privacy_*` (impostati a `true` dal backend alla registrazione), `phone_number` (solo salvato).
❌ Non usate: `phone_verified(_at)`, `two_factor_*` (nessuna 2FA), `stripe_customer_id`, `subscription_plan`, `subscription_expires_at`, `marketing_consent`, `suspension_reason` (non letta né scritta dal codice; il login controlla solo `is_suspended`), `profile_public`.
`password_salt` contiene il salt generato da bcrypt (è già incorporato in `password_hash`; la colonna è ridondante ma NOT NULL).

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

**Stato**: ❌ **tabella predisposta, non popolata da nessun codice.** Non esiste un'integrazione con provider Open Banking (Plaid/Tink/Fabrick). `GET /api/accounts`, i filtri delle transazioni, l'export CSV e i budget sanno leggere
righe di questa tabella, ma oggi non ne esistono. Le colonne dei token cifrati non hanno alcuna routine di cifratura (vedi sezione sicurezza in fondo).

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

**Regole applicative**: `current_balance` è modificato solo dal ledger (transazioni, contributi obiettivo, ricorrenze, import CSV) con `SELECT ... FOR UPDATE` sulla riga. Il saldo non può scendere sotto `0` se `overdraft_allowed = false`,
né sotto `-overdraft_limit` se il limite è valorizzato (`overdraft_limit NULL` con `overdraft_allowed = true` = scoperto illimitato); violazioni → 422 `INSUFFICIENT_FUNDS` / `OVERDRAFT_LIMIT_CONFLICT`.
Un conto con transazioni viene archiviato (`is_archived = true`, `is_active = false`) invece di essere eliminato. `account_currency` vale `EUR`: non c'è selezione valuta.

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

**Regole applicative**: l'API accetta date fino a 1 giorno nel futuro e fino a 10 anni nel passato; `amount` > 0 con al massimo 2 decimali. `transaction_date` è `TIMESTAMP` senza fuso: tutto il sistema lavora in **UTC** (sessione `timezone=UTC`).
Le colonne `transaction_time`, `provider_transaction_id`, `merchant_name`, `reference`, `is_auto_imported`, `import_source`, `attachment_url` ❌ non sono usate (predisposte per l'import bancario). Le transazioni generate dalle regole ricorrenti hanno il tag `recurring`.
Le transazioni con `bank_account_id` non sono modificabili/eliminabili dall'API (400).

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
| UNIQUE(user_id, manual_account_id, bank_account_id, balance_date) | - | Vincolo di tabella (non sufficiente da solo: una delle due colonne conto è sempre NULL e i NULL sono distinti) | - |

**Indici univoci parziali** (aggiunti per garantire davvero uno snapshot per conto e per giorno, usati da `INSERT ... ON CONFLICT` in `ledgerService.rebuildSnapshots`):
`uq_account_balances_manual_day ON (manual_account_id, balance_date) WHERE manual_account_id IS NOT NULL` e `uq_account_balances_bank_day ON (bank_account_id, balance_date) WHERE bank_account_id IS NOT NULL`.
**Come si popola**: non c'è un job notturno. A ogni creazione/modifica/eliminazione di transazione (anche retrodatata) il ledger ricostruisce gli snapshot dalla data più antica toccata fino a oggi
(`saldo(giorno) = initial_balance + somma firmata delle transazioni fino a quel giorno`). Alimentano `GET /api/accounts/:id/history` e il grafico Net worth.

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

**Descrizione**: Gestione verifica email (OTP): contiene **l'hash** del codice, mai il codice in chiaro

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| email | TEXT | NOT NULL | Email da verificare |
| code_hash | TEXT | NULLABLE | HMAC-SHA256 (chiave `JWT_SECRET`) di `"<user_id>:<codice>"`; il codice a 6 cifre non è mai salvato |
| is_verified | BOOLEAN | DEFAULT false | Verificata? |
| verified_at | TIMESTAMP | NULLABLE | Data/ora verifica |
| attempts | INTEGER | DEFAULT 0 | Numero tentativi OTP |
| max_attempts | INTEGER | DEFAULT 3 | Massimo tentativi consentiti |
| locked_until | TIMESTAMP | NULLABLE | Bloccata fino a quando (anti-brute-force, +15 minuti al raggiungimento di `max_attempts`) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| expires_at | TIMESTAMP | NOT NULL | Scadenza del codice (10 minuti dalla generazione) |

**IMPORTANTE (stato attuale del codice)**:
- L'OTP è generato lato server (`crypto.randomInt`), inviato via email e salvato **solo come HMAC** in `code_hash`. Redis/cache non sono usati.
- Un nuovo invio cancella le righe non verificate dell'utente e ne crea una nuova.
- Il tentativo viene riservato con un `UPDATE ... WHERE attempts < max_attempts` atomico **prima** del confronto, quindi richieste parallele non possono superare `max_attempts`.
- Le righe scadute non vengono pulite da un job: restano finché non sono sostituite da un nuovo invio.

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

**Stato**: ❌ **tabella predisposta ma non usata.** La verifica del telefono via SMS non è implementata (`smsService.js` non è chiamato da nessun endpoint). Il design previsto era: OTP generato lato server, inviato via SMS e confrontato senza salvarlo in chiaro (stessa logica di `email_verifications`, che oggi salva un hash in `code_hash`; per questa tabella servirebbe una colonna analoga).

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
| expires_at | TIMESTAMP | NOT NULL | Scadenza token (1 ora) |

**Stato attuale**: `reset_token` contiene lo **SHA-256** del token casuale a 256 bit (`crypto.randomBytes(32)` in esadecimale, 64 caratteri) inviato nel link email; il token in chiaro non è salvato. Una nuova richiesta cancella i reset non usati dell'utente; il reset è monouso (`is_used`, `used_at`) ed elimina tutte le righe di `sessions` dell'utente.

---

## 16. TABELLA: sessions

**Descrizione**: Gestione sessioni utente attive (una riga per ogni refresh token emesso)

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Utente |
| session_token | TEXT | UNIQUE, NOT NULL, INDEX | **SHA-256 del refresh token** (il token in chiaro è solo nel cookie `refresh_token`) |
| device_name | TEXT | NULLABLE | User-Agent (troncato a 255 caratteri) |
| device_type | TEXT | NULLABLE | ❌ non popolata |
| browser | TEXT | NULLABLE | ❌ non popolata |
| ip_address | TEXT | NULLABLE | Indirizzo IP della richiesta |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione sessione |
| expires_at | TIMESTAMP | NOT NULL, INDEX | Scadenza sessione (30 giorni dal login; la rotazione eredita la scadenza originale) |
| rotated_at | TIMESTAMP | NULLABLE | Valorizzata quando il refresh token è stato scambiato con uno nuovo (rotazione). Aggiunta dalla migrazione `002_session_rotation.sql` |

**Rotazione e rilevamento del riuso**: a ogni `POST /api/auth/refresh-token` la riga corrente riceve `rotated_at = NOW()` e ne viene inserita una nuova. Un token già ruotato presentato entro 30 secondi
(race tra più tab) ottiene solo un nuovo access token; oltre i 30 secondi il riuso è considerato furto: **tutte** le sessioni dell'utente vengono cancellate (audit `refresh_token_reuse`).
Il login elimina le sessioni scadute dell'utente e quelle ruotate da più di 7 giorni.

---

## 17. TABELLA: budgets

**Descrizione**: Limite di spesa mensile per categoria (un budget per utente e categoria). Il "speso" non è salvato: è calcolato a ogni lettura sulle spese del mese corrente (UTC).

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario |
| category_id | UUID | FOREIGN KEY → transaction_categories.id, NOT NULL, ON DELETE CASCADE | Categoria (solo `expense` o `both`, verificato dall'API) |
| monthly_limit | NUMERIC(18,2) | NOT NULL, CHECK > 0 | Limite mensile |
| alert_threshold | INTEGER | NOT NULL, DEFAULT 80, CHECK BETWEEN 1 AND 100 | Percentuale oltre la quale lo stato diventa `warning` |
| is_active | BOOLEAN | DEFAULT true | Budget attivo? (solo gli attivi entrano nei totali e negli avvisi) |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento (trigger) |
| UNIQUE(user_id, category_id) | - | Un solo budget per categoria | - |

Stato calcolato dall'API: `ok`, `warning` (speso ≥ soglia % del limite) o `exceeded` (speso ≥ limite). Migrazione per DB esistenti: `001_budgets_recurring.sql`.

---

## 18. TABELLA: recurring_transactions

**Descrizione**: Regole di transazioni ricorrenti (affitto, abbonamenti, stipendio) su **conti manuali**. Le occorrenze dovute diventano transazioni vere tramite il ledger.

| Colonna | Tipo | Regole | Descrizione |
|---------|------|--------|-------------|
| id | UUID | PRIMARY KEY, NOT NULL, AUTO | Identificatore univoco |
| user_id | UUID | FOREIGN KEY → users.id, NOT NULL, INDEX, ON DELETE CASCADE | Proprietario |
| manual_account_id | UUID | FOREIGN KEY → manual_accounts.id, NOT NULL, ON DELETE CASCADE | Conto su cui generare le transazioni |
| category_id | UUID | FOREIGN KEY → transaction_categories.id, NULLABLE, ON DELETE SET NULL | Categoria |
| amount | NUMERIC(18,2) | NOT NULL, CHECK > 0 | Importo |
| transaction_type | TEXT | NOT NULL, CHECK IN ('income', 'expense') | Entrata o uscita |
| description | TEXT | NOT NULL | Descrizione |
| frequency | TEXT | NOT NULL, CHECK IN ('daily', 'weekly', 'monthly', 'yearly') | Frequenza |
| start_date | DATE | NOT NULL | Data di ancoraggio (giorno del mese mantenuto, con riduzione a fine mese: 31 gen → 28/29 feb → 31 mar) |
| next_run_date | DATE | NOT NULL, INDEX parziale (solo regole attive) | Prima occorrenza non ancora generata |
| end_date | DATE | NULLABLE | Ultima data; superata, la regola viene disattivata |
| is_active | BOOLEAN | DEFAULT true | Regola attiva? (pausa/ripresa) |
| last_run_at | TIMESTAMP | NULLABLE | Ultima generazione riuscita |
| last_error | TEXT | NULLABLE | Ultimo errore (es. fondi insufficienti): l'occorrenza fallita viene ritentata al giro successivo |
| created_at | TIMESTAMP | DEFAULT NOW | Data creazione |
| updated_at | TIMESTAMP | DEFAULT NOW | Data aggiornamento (trigger) |

Elaborazione (`services/recurringService.js`): le regole dovute (`next_run_date <= oggi UTC`) sono reclamate con `FOR UPDATE SKIP LOCKED`, ogni occorrenza gira in un SAVEPOINT e passa da `ledgerService.recordTransaction`
(quindi rispetta scoperto e snapshot). Max 366 occorrenze per regola per esecuzione. Eseguita: allo startup e ogni ora da uno scheduler nel processo API (`RECURRING_SCHEDULER=off` lo disabilita),
in modo pigro su `GET /api/recurring`, alla creazione/modifica di una regola e su `POST /api/recurring/process`. Migrazione per DB esistenti: `001_budgets_recurring.sql`.

---

## ROW-LEVEL SECURITY (RLS)

- `schema.sql` abilita RLS (`ENABLE ROW LEVEL SECURITY`, **non** `FORCE`) su tutte le tabelle utente, incluse `budgets` e `recurring_transactions`, con policy basate su `current_user_id()`
  (legge `current_setting('app.current_user_id', true)`; funzione `STABLE` con `search_path = pg_catalog`).
- Il backend usa **due pool**: `DATABASE_URL` (owner/superuser: registrazione, login, sessioni, OTP, reset, scritture di audit, scoperta utenti dello scheduler, seed) e `DATABASE_APP_URL`
  (ruolo `flywallets_app`, creato da `database/rls_app_role.sql`) per tutte le rotte dati, ognuna dentro una transazione con `set_config('app.current_user_id', <uuid>, true)`.
- Il ruolo `flywallets_app` è `NOSUPERUSER NOBYPASSRLS` e ha: `SELECT/INSERT/UPDATE/DELETE` su categorie, conti, transazioni, snapshot, obiettivi (+ tabelle ponte), `budgets`, `recurring_transactions`;
  solo `SELECT` su `users`, `user_individuals`, `user_businesses`, `audit_logs`; **nessun accesso** a `sessions`, `email_verifications`, `phone_verifications`, `password_resets`.
- **Caveat onesto**: superuser e proprietari delle tabelle bypassano RLS. Se `DATABASE_APP_URL` non è impostata (default, anche nello stack Docker) le policy esistono ma non sono applicate e l'isolamento
  dipende dai filtri `WHERE user_id = $1` dell'API. Dopo `001_budgets_recurring.sql` su un DB che ha già il ruolo, rieseguire `rls_app_role.sql` per concedere i permessi sulle nuove tabelle.
- Policy rilevanti: `transactions_isolation` verifica anche (WITH CHECK) che il conto referenziato appartenga all'utente (le FK bypassano RLS); `savings_goal_transactions_isolation` verifica obiettivo e transazione;
  `budgets_isolation` verifica che la categoria sia di sistema o dell'utente; `recurring_isolation` verifica il conto; `audit_logs` ha `SELECT` e `INSERT` per il proprio `user_id`.

---

## RIEPILOGO CATEGORIE PREDEFINITE (transaction_categories)

Le seguenti **25** categorie (7 entrate + 18 spese) vengono inserite da `schema.sql` come categorie di sistema (is_system = true, user_id NULL). Le descrizioni e i colori sono nel file SQL. Il motore di categorizzazione a parole chiave (`services/aiService.js`) fa riferimento a questi nomi:

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

budgets.user_id

recurring_transactions.user_id
recurring_transactions.next_run_date   (parziale: WHERE is_active = true)

account_balances (manual_account_id, balance_date)  UNIQUE parziale WHERE manual_account_id IS NOT NULL
account_balances (bank_account_id, balance_date)    UNIQUE parziale WHERE bank_account_id IS NOT NULL

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
7. **Balance Date Univoco**: Un conto non può avere due snapshot di saldo per lo stesso giorno (garantito dagli indici univoci parziali `uq_account_balances_*_day`)
8. **Goal Account Univoco**: Uno specifico conto non può essere assegnato due volte allo stesso goal (tabella `savings_goal_accounts` oggi non usata dal codice)
9. **Budget Univoco**: un solo budget per (utente, categoria); `monthly_limit > 0`; `alert_threshold` tra 1 e 100
10. **Ricorrenze**: `amount > 0`, `frequency` in (`daily`, `weekly`, `monthly`, `yearly`); eliminando il conto o l'utente le regole vengono eliminate, eliminando la categoria diventano senza categoria

---

## OPERAZIONI DI SISTEMA AUTOMATICHE

1. **Aggiornamento saldo conto manuale**: ogni creazione/modifica/eliminazione di transazione aggiorna `current_balance` nella stessa transazione SQL (`ledgerService`), con controllo dello scoperto.
2. **Snapshot giornaliero**: ✅ ricostruito dal ledger a ogni variazione (dalla data più antica toccata fino a oggi), non da un job notturno.
3. **Aggiornamento goal progress**: contributi (`POST /api/goals/:id/contribute`) e transazioni di spesa con `savings_goal_id` aumentano `current_amount`; modifiche/eliminazioni li stornano. Il completamento è "appiccicoso" quando si aggiunge denaro.
4. **Generazione ricorrenze**: scheduler nel processo API all'avvio e ogni ora (`RECURRING_SCHEDULER=off` per disattivarlo) + elaborazione pigra quando si usa l'API delle ricorrenze.
5. **Session expiry**: le sessioni con `expires_at` passato non sono valide per il refresh; il login elimina quelle scadute dell'utente e quelle ruotate da più di 7 giorni.
6. **Token expiry check**: l'access token dura 15 minuti; il frontend lo rinnova in automatico con il refresh token (che viene ruotato).
7. **Password salt**: viene rigenerato a ogni cambio password (bcrypt, 12 round).
8. **Audit logging**: scritto per `register`, `login`, `forgot_password`, `reset_password`, `verify_email`, `refresh_token_reuse`, `import_transactions`. Nessuna lettura via API.
9. **`updated_at`**: aggiornato dal trigger `update_updated_at_column()` sulle tabelle che lo hanno.

---

## SICUREZZA - CAMPI CRIPTATI

Stato attuale rispetto alla specifica:

- `users.password_hash` → ✅ hash bcrypt (non decifrabile, solo verificabile).
- `sessions.session_token` → ✅ SHA-256 del **refresh token** (hash one-way).
- `password_resets.reset_token` → ✅ SHA-256 del token inviato via email.
- `email_verifications.code_hash` → ✅ HMAC-SHA256 del codice OTP, legato all'utente.
- `users.two_factor_secret_encrypted` → ❌ colonna predisposta, 2FA non implementata.
- `bank_accounts.access_token_encrypted` / `refresh_token_encrypted` → ❌ colonne predisposte, nessuna integrazione bancaria e **nessuna routine di cifratura implementata**: se si implementerà Open Banking
  va aggiunta una cifratura applicativa (es. AES-GCM con chiave fuori dal DB) prima di salvare questi valori.

I campi che DEVONO usare hash one-way (non decifrare mai): `sessions.session_token`, `password_resets.reset_token`, `email_verifications.code_hash`, `users.password_hash`.
