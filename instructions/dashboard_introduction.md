# Dashboard - Introduzione e Panoramica

## 1. Cos'è la Dashboard?

La **Dashboard** è la pagina principale che l'utente vede dopo il login. È il centro di controllo dell'applicazione FlyWallets, dove può visualizzare:

- ✅ Un riepilogo rapido dei propri conti e saldi
- ✅ Le transazioni recenti
- ✅ I progressi verso gli obiettivi di risparmio
- ✅ Statistiche e grafici finanziari
- ✅ Avvisi e notifiche importanti

**URL**: `/dashboard`

**Accesso**: Solo utenti autenticati (richiede JWT valido)

> **Nota sullo stato del documento.** Questo file è la specifica originale della dashboard. La dashboard è ora **implementata**
> (`frontend/src/app/dashboard/page.js`, `backend/src/controllers/dashboardController.js`) ma con alcune differenze. I blocchi
> **"Stato implementazione"** nelle sezioni sotto indicano cosa fa il codice. Legenda: ✅ implementato, ⚠️ implementato in modo diverso, ❌ non implementato.

### Riepilogo dello stato (aggiornato al codice)

| Elemento della specifica | Stato | Come è nel codice |
|--------------------------|:-----:|-------------------|
| Pagina `/dashboard` protetta da login | ✅ | `src/proxy.js` reindirizza a `/login` senza cookie `refresh_token`; l'API verifica il JWT |
| Saldo totale + variazione | ⚠️ | `summary.totalBalance` e `summary.netChangePercentage` = flusso netto del **mese corrente** rispetto al saldo a inizio mese (non "rispetto a ieri"); card Entrate/Uscite del mese |
| Griglia dei conti | ⚠️ | Solo conti **manuali** con "Aggiungi conto"; nessun pulsante "Collegati a Banca" né "Sincronizza" |
| Transazioni recenti | ✅ | Ultime 8 (`recentTransactions`), badge categoria con emoji, link a `/dashboard/transactions` |
| Obiettivi di risparmio | ✅ | Primi 6 (`savingsGoals`) con barra di progresso e `progress_percentage` |
| Grafici | ✅ (extra) | Patrimonio nel tempo e spese per categoria con selettore 30G / 90G / 1A (`GET /api/dashboard/networth` e `/spending`) |
| Notifiche | ⚠️ | Nessuna tabella/endpoint `notifications`. La campanella in header (`BudgetBell`) mostra solo gli **avvisi budget** (`GET /api/budgets/alerts`, aggiornati ogni 5 minuti e al focus della finestra) |
| Ricerca globale | ⚠️ | La barra in header cerca solo nelle **descrizioni delle transazioni** (porta a `/dashboard/transactions?search=...`); non cerca conti, obiettivi, importi o date |
| Sidebar | ⚠️ | Dashboard, Accounts, Transactions, Goals, Budgets, Recurring, Categories, Statistics; in fondo Settings e Logout. Non c'è la voce "Aiuto". Su mobile è un drawer (`MobileNav`) |
| Skeleton / errori / retry | ✅ | `DashboardSkeleton`, card di errore con pulsante "Retry" |
| Aggiornamento in tempo reale / polling 30 s / cache 30 s | ❌ | Nessun polling né cache client: i dati si ricaricano dopo ogni azione (`reload`) e al cambio pagina |
| Endpoint `GET /api/accounts/:id/balance`, `POST /api/accounts/:id/sync` | ❌ | Non esistono (nessuna sincronizzazione bancaria). Lo storico saldi è `GET /api/accounts/:id/history` |
| Pagine di dettaglio `/accounts/{id}`, `/goals/{id}` | ❌ | Non esistono: modifica e dettagli sono modali nelle pagine elenco (`/dashboard/accounts`, `/dashboard/goals`, `/dashboard/transactions`) |
| Rate limit "1 richiesta ogni 5 secondi" su `/api/dashboard` | ⚠️ | Vale il limite generale delle rotte autenticate: 120 richieste/minuto per utente |


---

## 2. Layout Principale della Dashboard

### 2.1 Header/Navbar (Sempre Visibile)

> **Stato implementazione:** ⚠️ `components/layout/Header.jsx`: pulsante menu (mobile), barra di ricerca transazioni, `BudgetBell` (avvisi budget con badge numerico) e avatar che porta a `/dashboard/profile`.
> Il logout è nel footer della sidebar e in `/dashboard/settings`.


```
┌─────────────────────────────────────────────────────────────┐
│ 💰 FlyWallets        Ricerca    🔔 Notifiche    👤 Profilo │
└─────────────────────────────────────────────────────────────┘
```

**Elementi**:
- **Logo**: Clickable, ritorna a dashboard se in altra pagina
- **Ricerca**: Cerca transazioni, conti, obiettivi
- **Notifiche**: Icona con badge numero notifiche non lette
- **Profilo**: Menu dropdown con impostazioni, logout

---

### 2.2 Sidebar (Navigazione Laterale)

> **Stato implementazione:** ⚠️ voci reali (`menuItems` in `components/layout/Sidebar.jsx`): Dashboard, Accounts, Transactions, Goals, Budgets, Recurring, Categories, Statistics. Settings e Logout sono nel footer. Nessuna voce "Aiuto".


```
┌─────────────────┐
│ 📊 Dashboard    │  ← Attuale
│ 🏦 Conti        │
│ 💳 Transazioni  │
│ 🎯 Obiettivi    │
│ 📈 Statistiche  │
│ ⚙️ Impostazioni │
│ ❓ Aiuto        │
└─────────────────┘
```

**Funzionalità**:
- Navigazione principale tra sezioni
- Evidenzia pagina corrente
- Collassabile su mobile
- Mostra info account utente in fondo

---

### 2.3 Area Principale (Content Area)

Divisa in **4 sezioni principali**:

---

## 3. Sezioni della Dashboard

### 3.1 SEZIONE 1: Saldi Totali (Widget Principale)

> **Stato implementazione:** ⚠️ `totalBalance` somma `current_balance` dei **conti manuali attivi e non archiviati**; i conti bancari non sono inclusi (nessuna integrazione bancaria).
> `netChangePercentage` = (entrate − uscite del mese corrente) / saldo a inizio mese, 0 se la base non è positiva; il "mese" è calcolato in **UTC**. Sono incluse le transazioni
> datate fino a 1 giorno nel futuro che cadono nel mese corrente. Sotto ci sono i grafici Net worth e Spending (richieste separate: la dashboard non aspetta i grafici).


**Posizione**: Top della dashboard, visibile subito

**Cosa mostra**:
```
┌─────────────────────────────────────┐
│ SALDO TOTALE                        │
│                                     │
│         € 5,234.50                  │
│                                     │
│ ▲ +€ 234 rispetto a ieri            │
│                                     │
│ [Vedi Dettagli] [Aggiungi Conto]   │
└─────────────────────────────────────┘
```

**Dati Visualizzati**:
- Somma di tutti i saldi dei conti (manuali + bancari) dell'utente
- Variazione rispetto al giorno precedente
- Bottoni di azione rapida

**Tabelle Coinvolte**:
- `manual_accounts` → current_balance
- `bank_accounts` → saldo letto da API esterna
- `account_balances` → per variazione giornaliera

---

### 3.2 SEZIONE 2: I Tuoi Conti (Card Grid)

> **Stato implementazione:** ⚠️ `accounts` della dashboard contiene `id, source, account_name, account_type, currency, current_balance, color_tag, icon_emoji` dei conti manuali.
> `GET /api/accounts` restituisce anche i conti `bank_accounts` (saldo dall'ultimo snapshot) ma **nessun codice li crea**: l'integrazione Open Banking (Plaid/Tink) è **pianificata, non implementata**.
> I conti con scoperto (`overdraft_allowed`, `overdraft_limit`) sono supportati; un conto con transazioni viene archiviato invece di essere eliminato.


**Posizione**: Sotto il saldo totale

**Cosa mostra**: Griglia di card, una per ogni conto

```
┌──────────────────┬──────────────────┬──────────────────┐
│ 🏦 Conto Nonna   │ 💳 Conto Corrente│ 💰 Risparmio    │
│                  │                  │                  │
│ € 1,200.00       │ € 3,500.00       │ € 534.50         │
│                  │                  │                  │
│ Conto manuale    │ Banco XYZ        │ Conto manuale    │
│ [+] [Dettagli]   │ [Sincronizza]    │ [+] [Dettagli]   │
└──────────────────┴──────────────────┴──────────────────┘

[+ Aggiungi Conto Manuale]  [+ Collegati a Banca]
```

**Dati per Card**:
- Nome conto
- Saldo attuale
- Tipo conto (manuale/bancario)
- Icona/Colore personalizzato
- Bottoni azione

**Tabelle Coinvolte**:
- `manual_accounts` → account_name, current_balance, icon_emoji, color_tag
- `bank_accounts` → account_name, bank_name, account_type

---

### 3.3 SEZIONE 3: Transazioni Recenti

> **Stato implementazione:** ✅ 8 transazioni (non 10-15) con `category_name`, `category_emoji`, `category_color`, `account_name`. Le transazioni si creano, modificano ed eliminano da
> `/dashboard/transactions` (modale di modifica); ogni operazione aggiorna il saldo in modo atomico. In quella pagina ci sono filtri, paginazione (15 per pagina nella UI; default API 20) e il menu import/export CSV.


**Posizione**: In basso a sinistra

**Cosa mostra**: Ultime 10-15 transazioni

```
┌──────────────────────────────────────────┐
│ TRANSAZIONI RECENTI                      │
├──────────────────────────────────────────┤
│ 🍔 -€ 25.50          Spesa Cena   Oggi   │
│ 💼 +€ 2,500.00       Stipendio    Oggi   │
│ 🛍️  -€ 89.99         Shopping     Ieri   │
│ 🎁 +€ 50.00          Regalo       2 gg  │
│ 📱 -€ 19.99          Telefono     3 gg  │
│                                          │
│ [Visualizza Tutte]                       │
└──────────────────────────────────────────┘
```

**Dati per Transazione**:
- Icona categoria (emoji)
- Descrizione
- Importo (+ verde, - rosso)
- Data relativa (Oggi, Ieri, 2 gg fa)
- Click per dettagli completi

**Tabelle Coinvolte**:
- `transactions` → user_id, amount, description, transaction_type, transaction_date
- `transaction_categories` → icon_emoji, category_name

---

### 3.4 SEZIONE 4: Obiettivi di Risparmio (Savings Goals)

> **Stato implementazione:** ✅ `savingsGoals` (max 6) con `progress_percentage` calcolato dal backend. `current_amount` è una colonna aggiornata dalle operazioni sul ledger
> (contributi, transazioni collegate con `savings_goal_id`), non una somma calcolata al volo da `savings_goal_transactions`. La tabella `savings_goal_accounts` non è usata.


**Posizione**: In basso a destra

**Cosa mostra**: Progressi verso gli obiettivi

```
┌──────────────────────────────────────────┐
│ I TUOI OBIETTIVI                         │
├──────────────────────────────────────────┤
│ ✈️  VACANZA ESTIVA                        │
│ █████████░  € 4,500 / € 5,000 (90%)      │
│ Scadenza: 15 luglio 2025                 │
│                                          │
│ 🚗 AUTO NUOVA                             │
│ ████░░░░░░  € 8,000 / € 20,000 (40%)    │
│ Scadenza: 31 dic 2025                    │
│                                          │
│ 🏠 FONDO EMERGENZA                        │
│ ████████░░  € 3,500 / € 5,000 (70%)     │
│ Senza scadenza                           │
│                                          │
│ [+ Nuovo Obiettivo]                      │
└──────────────────────────────────────────┘
```

**Dati per Obiettivo**:
- Nome obiettivo
- Emoji/Icona
- Barra di progresso
- Importo raggiunto / target
- Data scadenza
- Percentuale completamento

**Tabelle Coinvolte**:
- `savings_goals` → goal_name, target_amount, current_amount, target_date, icon_emoji
- `savings_goal_transactions` → per calcolare current_amount

---

## 4. Struttura Dati Frontend

### 4.1 State della Dashboard (React/Vue)

> **Stato implementazione:** ⚠️ non c'è uno store globale della dashboard: `useApiData("/dashboard")` tiene `{ data, loading, error, reload }` nello stato della pagina; solo l'utente è in Zustand (`authStore`).
> La forma reale dei dati è quella di 5.1 (`summary`, `accounts`, `recentTransactions`, `savingsGoals`, `categories`); non ci sono `notifications` né `balanceChange`.


```javascript
{
  user: {
    id: "uuid",
    email: "user@example.com",
    user_type: "individual",
    name: "Mario Rossi"
  },
  
  totalBalance: 5234.50,
  balanceChange: {
    amount: 234,
    percentage: 4.7,
    period: "1 day"
  },
  
  accounts: [
    {
      id: "uuid",
      type: "manual",
      name: "Conto Nonna",
      balance: 1200.00,
      icon: "💰",
      color: "blue"
    },
    {
      id: "uuid",
      type: "bank",
      name: "Conto Corrente",
      balance: 3500.00,
      bank: "Banco XYZ",
      icon: "🏦",
      color: "green"
    }
  ],
  
  recentTransactions: [
    {
      id: "uuid",
      description: "Spesa Cena",
      amount: 25.50,
      type: "expense",
      category: "Cibo & Ristoranti",
      categoryIcon: "🍔",
      date: "2025-12-11T20:30:00Z",
      account: "Conto Nonna"
    }
  ],
  
  savingsGoals: [
    {
      id: "uuid",
      name: "Vacanza Estiva",
      icon: "✈️",
      targetAmount: 5000,
      currentAmount: 4500,
      targetDate: "2025-07-15",
      progress: 90
    }
  ],
  
  notifications: [
    {
      id: "uuid",
      type: "goal_progress",
      message: "Sei a 90% del tuo obiettivo Vacanza Estiva!",
      read: false,
      createdAt: "2025-12-11T10:00:00Z"
    }
  ]
}
```

---

## 5. API Endpoints Necessari

La dashboard richiama questi endpoint al caricamento:

### 5.1 Caricamento Dashboard Completa

> **Stato implementazione:** ⚠️ risposta reale di `GET /api/dashboard`:
> ```json
> { "status": "success",
>   "data": {
>     "summary": { "totalBalance": 0, "monthlyIncome": 0, "monthlyExpense": 0, "netChangePercentage": 0 },
>     "accounts": [], "recentTransactions": [], "savingsGoals": [], "categories": [] } }
> ```
> Non contiene `user`, `balanceChange`, `notifications`. Endpoint collegati: `GET /api/dashboard/networth?days=30|90|365` (serie giornaliera `series`, `start`, `end`, `change`, `changePercentage`)
> e `GET /api/dashboard/spending?days=30|90|365` (prime 6 categorie + "Other"). Tutti passano da `authenticateToken` → `apiLimiter` (120/min) → contesto RLS.


**Endpoint**: `GET /api/dashboard`

**Ritorna**:
```json
{
  "user": { ... },
  "totalBalance": 5234.50,
  "balanceChange": { ... },
  "accounts": [ ... ],
  "recentTransactions": [ ... ],
  "savingsGoals": [ ... ],
  "notifications": [ ... ]
}
```

**Autenticazione**: Richiede JWT valido

**Rate Limit**: 1 richiesta ogni 5 secondi

---

### 5.2 Aggiornamento Saldi Specifici

> **Stato implementazione:** ❌ `GET /api/accounts/:account_id/balance` non esiste. Disponibili: `GET /api/accounts` (lista con saldi) e `GET /api/accounts/:id/history?from_date&to_date` (snapshot giornalieri in `account_balances`,
> ricostruiti dal ledger a ogni creazione/modifica/eliminazione di transazione, anche retrodatata).


**Endpoint**: `GET /api/accounts/:account_id/balance`

**Ritorna**: Saldo aggiornato (utile per refresh rapidi)

---

### 5.3 Sincronizzazione Conti Bancari

> **Stato implementazione:** ❌ **non implementato e non pianificato a breve.** Non esiste `POST /api/accounts/:account_id/sync`, né integrazione Plaid/Tink. Le colonne di `bank_accounts` (token cifrati, consenso PSD2) sono solo predisposte nello schema.


**Endpoint**: `POST /api/accounts/:account_id/sync`

**Azione**: Forza sincronizzazione conto con API banca (Plaid, Tink)

**Risposta**: Nuovo saldo e transazioni importate

---

## 6. Funzionalità Interattive

### 6.1 Click su un Conto

> **Stato implementazione:** ⚠️ non esiste la pagina `/accounts/{id}`: in `/dashboard/accounts` ogni conto ha i pulsanti modifica (nome, colore, icona, descrizione, scoperto) ed elimina/archivia.


- Naviga a `/accounts/{account_id}`
- Mostra dettagli completi del conto
- Lista di tutte le transazioni
- Opzioni modifica nome, icon, colore

### 6.2 Click su una Transazione

> **Stato implementazione:** ⚠️ modifica (`PUT /api/transactions/:id`) ed eliminazione (`DELETE`) sono in `/dashboard/transactions`. "Duplica" non esiste. Le note sono modificabili nella modale (i tag solo via API).


- Mostra modal/pagina dettagli
- Nome, importo, categoria, data, ora
- Note personali
- Taggi
- Opzioni: modifica, elimina, duplica

### 6.3 Click su un Obiettivo

> **Stato implementazione:** ⚠️ non esiste `/goals/{id}`: in `/dashboard/goals` si può creare, modificare (anche `is_completed`), versare un contributo (con conto opzionale) ed eliminare. Nessuno storico contribuzioni nella UI.


- Naviga a `/goals/{goal_id}`
- Mostra dettagli completi
- Quali conti contribuiscono
- Storico contribuzioni
- Opzioni: modifica, pausa, completa anticipatamente

### 6.4 Ricerca

> **Stato implementazione:** ⚠️ solo ricerca testuale sulla descrizione delle transazioni (`GET /api/transactions?search=...`, case-insensitive). Filtri aggiuntivi nella pagina transazioni: conto, categoria, tipo, intervallo di date.


- Search bar nel header
- Cerca per:
  - Nome transazione
  - Nome conto
  - Nome obiettivo
  - Importo
  - Data

---

## 7. Responsive Design

### 7.1 Desktop (>1024px)

```
┌────────────┬─────────────────────────────┐
│            │                             │
│  Sidebar   │  Content Area (4 sezioni)   │
│            │                             │
│            ├────┬────┬────┬────┬────┬────┤
│            │ S1 │ S2 │ S3 │ S4 │ S5 │ S6 │
│            ├────┴────┴────┴────┴────┴────┤
│            │                             │
│            │  Grid 2x3 o 3x2             │
│            │                             │
└────────────┴─────────────────────────────┘
```

---

### 7.2 Tablet (768px - 1024px)

```
┌──────────────────────────────────┐
│  Sidebar Collassato (hamburger)  │
├──────────────────────────────────┤
│  Content (stack 2 colonne)       │
│  ┌──────────┬──────────┐         │
│  │ Sezione1 │ Sezione2 │         │
│  ├──────────┼──────────┤         │
│  │ Sezione3 │ Sezione4 │         │
│  └──────────┴──────────┘         │
└──────────────────────────────────┘
```

---

### 7.3 Mobile (<768px)

```
┌──────────────────────────┐
│ ☰ Logo   Notif  Profilo  │
├──────────────────────────┤
│  Saldo Totale (full)     │
├──────────────────────────┤
│  Conti (scroll horiz)    │
├──────────────────────────┤
│  Transazioni Recenti     │
├──────────────────────────┤
│  Obiettivi (scroll)      │
└──────────────────────────┘
```

---

## 8. Sicurezza Dashboard

### 8.1 Autenticazione

- ✅ Token JWT obbligatorio
- ✅ Se token scaduto → redirect login
- ✅ Se token invalido → logout automatico

### 8.2 Row-Level Security (RLS)

> **Stato implementazione:** ⚠️ ogni richiesta dati gira in una transazione con `app.current_user_id` impostato (`req.withUser`), oltre ai filtri `WHERE user_id = $1`. Le policy sono però **efficaci solo se**
> il backend si collega con il ruolo ristretto `flywallets_app` (`DATABASE_APP_URL`, vedi `database/rls_app_role.sql`): il superuser/owner le bypassa. Senza `DATABASE_APP_URL` (default, anche in Docker)
> l'isolamento dipende dai filtri applicativi.


- ✅ Backend applica RLS su tutte le query
- ✅ Utente vede SOLO i propri dati
- ✅ Anche se modifica URL, DB bloccherà

### 8.3 Autorizzazione

- ✅ Verifica che i conti appartengono all'utente loggato
- ✅ Verifica che le transazioni appartengono all'utente
- ✅ Verifica che gli obiettivi appartengono all'utente

---

## 9. Performance Optimization

### 9.1 Lazy Loading

- Carica solo i dati iniziali (saldo, ultimi conti)
- Carica "Transazioni Recenti" on-demand
- Carica "Obiettivi" on-demand

### 9.2 Caching

> **Stato implementazione:** ❌ nessuna cache lato client né pulsante "Aggiorna": `useApiData` ricarica quando cambia il percorso o dopo `reload()`; i grafici si ricaricano dopo ogni modifica tramite `chartsKey`.


- Cache dashboard per 30 secondi (lato client)
- Se cambia una transazione, invalida cache
- Refresh manuale con bottone "Aggiorna"

### 9.3 Pagination

> **Stato implementazione:** ⚠️ la dashboard mostra liste fisse (8 transazioni, 6 obiettivi). La paginazione vera è su `GET /api/transactions` (`page`, `limit` default 20, max 100).


- Transazioni recenti: show 10, pulsante "Carica di più"
- Obiettivi: show 3-5, pulsante "Vedi tutti"

---

## 10. Notifiche Dashboard

### 10.1 Tipi di Notifiche

> **Stato implementazione:** ⚠️ implementati solo gli **avvisi budget** (`warning` oltre la soglia `alert_threshold`, default 80 %, ed `exceeded` oltre il limite mensile), calcolati al volo sul mese corrente (UTC).
> Non esistono notifiche per progresso obiettivi, spese importanti, saldo basso, sincronizzazione, nuovo login; né email o push (la pagina Settings mostra "coming soon").


- ✅ **Goal Progress**: "Sei a 90% del tuo obiettivo Vacanza!"
- ✅ **Transazione Importante**: "Spesa grande: €500 su Conto Nonna"
- ✅ **Saldo Basso**: "Il tuo saldo è sceso sotto €500"
- ✅ **Sincronizzazione**: "Conto bancario sincronizzato (5 nuove transazioni)"
- ✅ **Nuovo Login**: "Accesso da Paris, IP 192.168.1.1"
- ✅ **Goal Completato**: "Complimenti! Hai raggiunto il tuo obiettivo!"

### 10.2 Badge Notifiche

> **Stato implementazione:** ✅ il badge della campanella mostra il numero di avvisi budget attivi (non esiste il concetto di "non letto").


```
┌─────────┐
│ 🔔 (3)  │  ← Badge rosso con numero notifiche non lette
└─────────┘
```

---

## 11. Componenti React/Vue Suggeriti

```
Dashboard.jsx
├── Header.jsx
├── Sidebar.jsx
├── MainContent.jsx
│   ├── BalanceCard.jsx
│   ├── AccountsGrid.jsx
│   │   └── AccountCard.jsx (x N)
│   ├── RecentTransactions.jsx
│   │   └── TransactionRow.jsx (x N)
│   └── SavingsGoals.jsx
│       └── GoalProgress.jsx (x N)
└── Notifications.jsx
    └── NotificationItem.jsx (x N)
```

---

## 12. Flusso Dati Semplificato

```
1. User Logga In
   └─> Ottiene JWT Token
   
2. User Naviga a /dashboard
   └─> Frontend: Controlla JWT valido
   └─> Se valido → Carica Dashboard.jsx
   
3. Dashboard.jsx Monta
   └─> Effettua GET /api/dashboard
   └─> Backend: Valida JWT
   └─> Backend: Applica RLS (user_id dal JWT)
   └─> Backend: Ritorna dati user
   
4. Frontend: Riceve Dati
   └─> Popola State
   └─> Rendering componenti
   
5. User Interagisce
   └─> Click account → /accounts/{id}
   └─> Click transazione → Modal dettagli
   └─> Click obiettivo → /goals/{id}
```

---

## 13. Checklist Implementazione

> **Stato implementazione (spunte aggiornate):** [x] GET /api/dashboard · [x] contesto RLS su tutte le query dati (efficace con `DATABASE_APP_URL`) · [x] validazione JWT ·
> [x] layout responsive · [x] caricamento da API · [x] error handling e retry · [x] skeleton · [ ] aggiornamenti in tempo reale/polling 30 s · [ ] pulsante "Aggiorna" ·
> [x] toast (`Toaster`, `toastStore`) · [x] sidebar collassata su mobile · [~] accessibilità (alcune aria-label e `aria-current`, nessun audit completo) · [ ] lazy loading delle sezioni · [ ] ottimizzazione immagini.


- [ ] Backend: Endpoint GET /api/dashboard
- [ ] Backend: RLS su tutte le query
- [ ] Backend: Validazione JWT
- [ ] Frontend: Layout responsive (desktop, tablet, mobile)
- [ ] Frontend: Caricamento dati da API
- [ ] Frontend: Error handling (API fallita, offline)
- [ ] Frontend: Loading states (spinner, skeleton)
- [ ] Frontend: Real-time updates (polling ogni 30s)
- [ ] Frontend: Refresh manuale button
- [ ] Frontend: Notifiche toast/banner
- [ ] Mobile: Sidebar collassato
- [ ] Mobile: Touch-friendly buttons
- [ ] Accessibilità: ARIA labels
- [ ] Performance: Lazy loading
- [ ] Performance: Image optimization

---

## 14. Prossimi Step

> **Stato implementazione:** 1. Statistiche ✅ parziale (pagina `/dashboard/stats`: insight AI o a regole degli ultimi 30 giorni + grafico spese; nessun grafico mensile/annuale dedicato) ·
> 2. Budget ✅ (`/dashboard/budgets`, `/api/budgets`) · 3. Esportazione ⚠️ solo **CSV** delle transazioni (+ import CSV); PDF ❌ · 4. Preferiti ❌ · 5. Widget personalizzabili ❌ ·
> 6. Dark mode: l'interfaccia è solo scura, nessun toggle ❌ · 7. Notifiche real-time (WebSocket) ❌.
> Aggiunte non previste dalla specifica: transazioni ricorrenti con scheduler (`/dashboard/recurring`), categorie personalizzate, scoperto di conto, landing page pubblica.


Una volta implementata la dashboard di base, puoi aggiungere:

1. **Sezione Statistiche**: Grafici mensili/annuali
2. **Sezione Budget**: Limiti di spesa per categoria
3. **Sezione Esportazione**: Scarica dati CSV/PDF
4. **Sezione Preferiti**: Accesso rapido a conti/obiettivi
5. **Widget Personalizzabili**: User sceglie cosa visualizzare
6. **Dark Mode**: Toggle tema chiaro/scuro
7. **Notifiche Real-Time**: WebSocket per aggiornamenti live

---

Questa è una panoramica leggera ma completa della dashboard! Pronto a implementarla? 🚀