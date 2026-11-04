-- Keyset pagination of the CSV export and the transactions list: (user_id, transaction_date DESC, id DESC).
-- New installs get it from schema.sql. Run once:  psql "$DATABASE_URL" -f database/migrations/005_transactions_export_index.sql

CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id ON transactions(user_id, transaction_date DESC, id DESC);
