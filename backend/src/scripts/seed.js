/**
 * Demo data: `npm run db:seed`
 *   demo@flywallets.local / Password123!
 * Idempotent: it only deletes and recreates the demo user (cascading to all of its data).
 * Refuses to run in production, and on a non-local database unless --force is passed.
 */
const { pool } = require("../config/db");
const { hashPassword } = require("../utils/security");

const DEMO_EMAIL = "demo@flywallets.local";
const DEMO_PASSWORD = "Password123!";

const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "");

// [daysAgo, account, type, amount, description, category name]
const MAIN = "Conto Principale";
const SAVINGS = "Fondo Risparmio";
const CASH = "Portafoglio Contanti";
const TRANSACTIONS = [
  [29, MAIN, "income", 2100, "Bonifico Stipendio", "Stipendio"],
  [28, MAIN, "expense", 750, "Affitto mensile", "Affitto & Alloggio"],
  [26, MAIN, "expense", 64.3, "Esselunga Milano", "Cibo & Ristoranti"],
  [24, MAIN, "expense", 12.99, "Netflix abbonamento", "Intrattenimento & Hobby"],
  [22, MAIN, "expense", 9.99, "Ricarica Iliad", "Utenze"],
  [20, CASH, "expense", 18.5, "Pizzeria Da Mario", "Cibo & Ristoranti"],
  [18, MAIN, "expense", 55, "Benzina Eni Station", "Trasporti & Auto"],
  [16, MAIN, "expense", 89.9, "Bolletta Enel luce", "Utenze"],
  [14, SAVINGS, "income", 300, "Versamento mensile risparmio", "Altro Reddito"],
  [12, MAIN, "expense", 42.7, "Amazon ordine", "Shopping & Negozi"],
  [9, CASH, "expense", 7.2, "Caffè e cornetto", "Cibo & Ristoranti"],
  [7, MAIN, "expense", 14.99, "Spotify Premium", "Intrattenimento & Hobby"],
  [5, MAIN, "expense", 71.4, "Spesa Conad", "Cibo & Ristoranti"],
  [3, MAIN, "income", 120, "Rimborso spese lavoro", "Rimborso"],
  [1, CASH, "expense", 25, "Cinema", "Intrattenimento & Hobby"],
];

const dayStr = (daysAgo) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production.");
  }
  if (!isLocalDb && !process.argv.includes("--force")) {
    throw new Error("DATABASE_URL is not local. Re-run with --force if you really want to seed it.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE email = $1", [DEMO_EMAIL]);

    const { hash, salt } = await hashPassword(DEMO_PASSWORD);
    const u = await client.query(
      `INSERT INTO users (email, email_verified, email_verified_at, password_hash, password_salt, user_type,
                          terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at)
       VALUES ($1, true, NOW(), $2, $3, 'individual', true, NOW(), true, NOW()) RETURNING id`,
      [DEMO_EMAIL, hash, salt]
    );
    const userId = u.rows[0].id;
    await client.query(
      `INSERT INTO user_individuals (user_id, first_name, last_name, fiscal_code, date_of_birth, place_of_birth,
                                     address_street, address_city, address_postal_code, address_province)
       VALUES ($1, 'Demo', 'User', 'DMEDMO90A01F205X', '1990-01-01', 'Milano', 'Via Roma 1', 'Milano', '20100', 'MI')`,
      [userId]
    );

    // Accounts
    const accountDefs = [
      [MAIN, "checking", 1500, "blue", "🏦", "Conto corrente per le spese di ogni giorno"],
      [SAVINGS, "savings", 4000, "green", "🐷", "Risparmi di lungo periodo"],
      [CASH, "cash", 120, "yellow", "👛", "Contanti in tasca"],
    ];
    const accounts = {};
    for (const [name, type, initial, color, emoji, description] of accountDefs) {
      const r = await client.query(
        `INSERT INTO manual_accounts (user_id, account_name, account_type, initial_balance, current_balance, color_tag, icon_emoji, description)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7) RETURNING id`,
        [userId, name, type, initial, color, emoji, description]
      );
      accounts[name] = { id: r.rows[0].id, initial, balance: initial };
    }

    const cats = await client.query("SELECT id, category_name FROM transaction_categories WHERE is_system = true");
    const catId = Object.fromEntries(cats.rows.map((c) => [c.category_name, c.id]));

    // Transactions
    for (const [daysAgo, acc, type, amount, description, category] of TRANSACTIONS) {
      await client.query(
        `INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description, category_id)
         VALUES ($1, $2, ($3::date + TIME '10:00'), $4, $5, $6, $7)`,
        [userId, accounts[acc].id, dayStr(daysAgo), amount, type, description, catId[category]]
      );
      accounts[acc].balance += type === "income" ? amount : -amount;
    }
    for (const a of Object.values(accounts)) {
      await client.query("UPDATE manual_accounts SET current_balance = $1 WHERE id = $2", [Math.round(a.balance * 100) / 100, a.id]);
    }

    // 30 days of daily balance snapshots (replayed from the transactions) for the history charts
    for (const a of Object.values(accounts)) {
      await client.query(
        `INSERT INTO account_balances (user_id, manual_account_id, balance_date, balance_amount, is_manual)
         SELECT $1, $2, d::date,
                $3 + COALESCE((SELECT SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END)
                                 FROM transactions WHERE manual_account_id = $2 AND transaction_date::date <= d::date), 0),
                true
           FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d`,
        [userId, a.id, a.initial]
      );
    }

    // Goals
    await client.query(
      `INSERT INTO savings_goals (user_id, goal_name, description, target_amount, current_amount, target_date, color_tag, icon_emoji)
       VALUES ($1, 'Vacanza Estiva', 'Due settimane al mare', 2000, 650, CURRENT_DATE + 150, 'blue', '🏖️'),
              ($1, 'Fondo Emergenza', 'Sei mesi di spese', 6000, 3200, CURRENT_DATE + 365, 'green', '🛟')`,
      [userId]
    );

    await client.query("COMMIT");
    console.log(`✅ Seed complete.\n   Email:    ${DEMO_EMAIL}\n   Password: ${DEMO_PASSWORD}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error("❌ Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
