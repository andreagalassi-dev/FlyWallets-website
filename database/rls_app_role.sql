-- Optional: restricted role so Row-Level Security is ACTUALLY enforced.
--
-- PostgreSQL superusers and table owners bypass RLS. The backend therefore uses two pools:
--   DATABASE_URL      -> owner/superuser, used for auth flows (register, login, sessions) and the seed
--   DATABASE_APP_URL  -> this role, used by accounts / categories / transactions / goals / dashboard / ai,
--                        each request running inside a transaction with app.current_user_id set.
-- If DATABASE_APP_URL is not set the backend falls back to DATABASE_URL (RLS present but bypassed).
--
-- Usage (change the password!):
--   psql "$DATABASE_URL" -v app_password="'a-strong-password'" -f database/rls_app_role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'flywallets_app') THEN
    CREATE ROLE flywallets_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

ALTER ROLE flywallets_app PASSWORD :app_password;

GRANT USAGE ON SCHEMA public TO flywallets_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  transaction_categories, bank_accounts, manual_accounts, transactions, account_balances,
  savings_goals, savings_goal_accounts, savings_goal_transactions, budgets, recurring_transactions
TO flywallets_app;
GRANT SELECT ON users, user_individuals, user_businesses, audit_logs TO flywallets_app;
GRANT EXECUTE ON FUNCTION current_user_id() TO flywallets_app;
