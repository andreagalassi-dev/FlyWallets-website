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

---

## 2. Layout Principale della Dashboard

### 2.1 Header/Navbar (Sempre Visibile)

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

**Endpoint**: `GET /api/accounts/:account_id/balance`

**Ritorna**: Saldo aggiornato (utile per refresh rapidi)

---

### 5.3 Sincronizzazione Conti Bancari

**Endpoint**: `POST /api/accounts/:account_id/sync`

**Azione**: Forza sincronizzazione conto con API banca (Plaid, Tink)

**Risposta**: Nuovo saldo e transazioni importate

---

## 6. Funzionalità Interattive

### 6.1 Click su un Conto

- Naviga a `/accounts/{account_id}`
- Mostra dettagli completi del conto
- Lista di tutte le transazioni
- Opzioni modifica nome, icon, colore

### 6.2 Click su una Transazione

- Mostra modal/pagina dettagli
- Nome, importo, categoria, data, ora
- Note personali
- Taggi
- Opzioni: modifica, elimina, duplica

### 6.3 Click su un Obiettivo

- Naviga a `/goals/{goal_id}`
- Mostra dettagli completi
- Quali conti contribuiscono
- Storico contribuzioni
- Opzioni: modifica, pausa, completa anticipatamente

### 6.4 Ricerca

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

- Cache dashboard per 30 secondi (lato client)
- Se cambia una transazione, invalida cache
- Refresh manuale con bottone "Aggiorna"

### 9.3 Pagination

- Transazioni recenti: show 10, pulsante "Carica di più"
- Obiettivi: show 3-5, pulsante "Vedi tutti"

---

## 10. Notifiche Dashboard

### 10.1 Tipi di Notifiche

- ✅ **Goal Progress**: "Sei a 90% del tuo obiettivo Vacanza!"
- ✅ **Transazione Importante**: "Spesa grande: €500 su Conto Nonna"
- ✅ **Saldo Basso**: "Il tuo saldo è sceso sotto €500"
- ✅ **Sincronizzazione**: "Conto bancario sincronizzato (5 nuove transazioni)"
- ✅ **Nuovo Login**: "Accesso da Paris, IP 192.168.1.1"
- ✅ **Goal Completato**: "Complimenti! Hai raggiunto il tuo obiettivo!"

### 10.2 Badge Notifiche

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