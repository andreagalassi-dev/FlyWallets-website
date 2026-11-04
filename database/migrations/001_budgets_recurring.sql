-- Migration for databases created before budgets / recurring transactions existed.
-- New installs get these tables from schema.sql. Run once:  psql "$DATABASE_URL" -f database/migrations/001_budgets_recurring.sql

-- =============================================
-- 17. BUDGETS (monthly spending limit per category)
-- =============================================
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES transaction_categories(id) ON DELETE CASCADE,
    monthly_limit NUMERIC(18,2) NOT NULL CHECK (monthly_limit > 0),
    alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold BETWEEN 1 AND 100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, category_id)
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 18. RECURRING_TRANSACTIONS (rent, subscriptions, salary...)
-- =============================================
CREATE TABLE recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manual_account_id UUID NOT NULL REFERENCES manual_accounts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES transaction_categories(id) ON DELETE SET NULL,
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    description TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    start_date DATE NOT NULL,
    next_run_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recurring_user_id ON recurring_transactions(user_id);
CREATE INDEX idx_recurring_next_run ON recurring_transactions(next_run_date) WHERE is_active = true;

CREATE TRIGGER update_recurring_updated_at BEFORE UPDATE ON recurring_transactions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY budgets_isolation ON budgets
    FOR ALL USING (user_id = current_user_id())
    WITH CHECK (
        user_id = current_user_id()
        AND EXISTS (SELECT 1 FROM transaction_categories c WHERE c.id = category_id AND (c.is_system = true OR c.user_id = current_user_id()))
    );

CREATE POLICY recurring_isolation ON recurring_transactions
    FOR ALL USING (user_id = current_user_id())
    WITH CHECK (
        user_id = current_user_id()
        AND EXISTS (SELECT 1 FROM manual_accounts m WHERE m.id = manual_account_id AND m.user_id = current_user_id())
    );
