-- FlyWallets database schema.
-- Safe by default: it never drops anything. To wipe everything first, run database/reset.sql.

-- Enable UUID extension (pgcrypto is standard for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to get current user_id for RLS (to be set by application context)
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
    -- This relies on the application setting 'app.current_user_id' within the transaction
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = pg_catalog;


-- =============================================
-- 1. USERS
-- =============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP,
    phone_number TEXT UNIQUE,
    phone_verified BOOLEAN DEFAULT false,
    phone_verified_at TIMESTAMP,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_changed_at TIMESTAMP DEFAULT NOW(),
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_method TEXT CHECK (two_factor_method IN ('sms', 'email', 'authenticator_app')),
    two_factor_secret_encrypted TEXT,
    terms_accepted BOOLEAN DEFAULT false,
    terms_accepted_at TIMESTAMP,
    privacy_accepted BOOLEAN DEFAULT false,
    privacy_accepted_at TIMESTAMP,
    marketing_consent BOOLEAN DEFAULT false,
    user_type TEXT NOT NULL CHECK (user_type IN ('individual', 'business')),
    is_active BOOLEAN DEFAULT true,
    is_suspended BOOLEAN DEFAULT false,
    suspension_reason TEXT,
    stripe_customer_id TEXT,
    subscription_plan TEXT DEFAULT 'free',
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    profile_public BOOLEAN DEFAULT false
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone_number ON users(phone_number);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 2. USER_INDIVIDUALS
-- =============================================
CREATE TABLE user_individuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    fiscal_code TEXT NOT NULL UNIQUE,
    date_of_birth DATE NOT NULL,
    place_of_birth TEXT NOT NULL,
    nationality TEXT DEFAULT 'IT',
    address_street TEXT NOT NULL,
    address_city TEXT NOT NULL,
    address_postal_code TEXT NOT NULL,
    address_province TEXT NOT NULL,
    address_country TEXT DEFAULT 'IT',
    identity_document_type TEXT,
    identity_document_number TEXT,
    identity_document_expiry DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_individuals_fiscal_code ON user_individuals(fiscal_code);
CREATE INDEX idx_user_individuals_address_city ON user_individuals(address_city);

CREATE TRIGGER update_user_individuals_updated_at BEFORE UPDATE ON user_individuals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 3. USER_BUSINESSES
-- =============================================
CREATE TABLE user_businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    vat_number TEXT NOT NULL UNIQUE,
    business_type TEXT,
    owner_first_name TEXT NOT NULL,
    owner_last_name TEXT NOT NULL,
    owner_fiscal_code TEXT NOT NULL,
    address_street TEXT NOT NULL,
    address_city TEXT NOT NULL,
    address_postal_code TEXT NOT NULL,
    address_province TEXT NOT NULL,
    address_country TEXT DEFAULT 'IT',
    operational_address_street TEXT,
    operational_address_city TEXT,
    operational_address_postal_code TEXT,
    operational_address_province TEXT,
    operational_address_country TEXT,
    phone_business TEXT,
    website TEXT,
    ateco_code TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_businesses_company_name ON user_businesses(company_name);
CREATE INDEX idx_user_businesses_vat_number ON user_businesses(vat_number);
CREATE INDEX idx_user_businesses_address_city ON user_businesses(address_city);
CREATE INDEX idx_user_businesses_ateco_code ON user_businesses(ateco_code);

CREATE TRIGGER update_user_businesses_updated_at BEFORE UPDATE ON user_businesses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 4. TRANSACTION_CATEGORIES
-- =============================================
CREATE TABLE transaction_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_name TEXT NOT NULL,
    category_type TEXT NOT NULL CHECK (category_type IN ('income', 'expense', 'both')),
    description TEXT,
    color_tag TEXT,
    icon_emoji TEXT,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, category_name),
    CONSTRAINT chk_category_ownership CHECK (
        (is_system = true AND user_id IS NULL) OR 
        (is_system = false AND user_id IS NOT NULL)
    )
);

CREATE INDEX idx_transaction_categories_category_name ON transaction_categories(category_name);

CREATE TRIGGER update_transaction_categories_updated_at BEFORE UPDATE ON transaction_categories FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 5. BANK_ACCOUNTS
-- =============================================
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP,
    account_name TEXT,
    account_iban TEXT,
    bank_name TEXT,
    account_type TEXT,
    account_currency TEXT DEFAULT 'EUR',
    consent_expires_at TIMESTAMP,
    consent_granted_at TIMESTAMP,
    last_synced_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, provider_account_id)
);

CREATE INDEX idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE INDEX idx_bank_accounts_last_synced_at ON bank_accounts(last_synced_at);
CREATE INDEX idx_bank_accounts_is_active ON bank_accounts(is_active);

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 6. MANUAL_ACCOUNTS
-- =============================================
CREATE TABLE manual_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    account_currency TEXT DEFAULT 'EUR',
    initial_balance NUMERIC(18,2) DEFAULT 0,
    current_balance NUMERIC(18,2) DEFAULT 0,
    color_tag TEXT,
    icon_emoji TEXT,
    description TEXT,
    overdraft_allowed BOOLEAN DEFAULT false,
    overdraft_limit NUMERIC(18,2),
    is_active BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_manual_accounts_user_id ON manual_accounts(user_id);
CREATE INDEX idx_manual_accounts_current_balance ON manual_accounts(current_balance);
CREATE INDEX idx_manual_accounts_is_active ON manual_accounts(is_active);

CREATE TRIGGER update_manual_accounts_updated_at BEFORE UPDATE ON manual_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 7. TRANSACTIONS
-- =============================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manual_account_id UUID REFERENCES manual_accounts(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    transaction_date TIMESTAMP NOT NULL,
    transaction_time TIME,
    amount NUMERIC(18,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    description TEXT NOT NULL,
    category_id UUID REFERENCES transaction_categories(id) ON DELETE SET NULL,
    provider_transaction_id TEXT,
    merchant_name TEXT,
    reference TEXT,
    is_auto_imported BOOLEAN DEFAULT false,
    import_source TEXT,
    notes TEXT,
    tags JSON DEFAULT '[]',
    attachment_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (
        (manual_account_id IS NOT NULL AND bank_account_id IS NULL) OR 
        (manual_account_id IS NULL AND bank_account_id IS NOT NULL)
    )
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_manual_account_id ON transactions(manual_account_id);
CREATE INDEX idx_transactions_bank_account_id ON transactions(bank_account_id);
CREATE INDEX idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_user_date_id ON transactions(user_id, transaction_date DESC, id DESC);

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 8. ACCOUNT_BALANCES
-- =============================================
CREATE TABLE account_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manual_account_id UUID REFERENCES manual_accounts(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    balance_date DATE NOT NULL,
    balance_amount NUMERIC(18,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    is_manual BOOLEAN DEFAULT false,
    last_updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, manual_account_id, bank_account_id, balance_date)
);

CREATE INDEX idx_account_balances_user_id ON account_balances(user_id);
CREATE INDEX idx_account_balances_balance_date ON account_balances(balance_date);

-- One snapshot per account per day. The table-level UNIQUE above cannot enforce this
-- because one of the two account columns is always NULL (NULLs are distinct in UNIQUE).
CREATE UNIQUE INDEX uq_account_balances_manual_day ON account_balances(manual_account_id, balance_date) WHERE manual_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_account_balances_bank_day ON account_balances(bank_account_id, balance_date) WHERE bank_account_id IS NOT NULL;

-- =============================================
-- 9. SAVINGS_GOALS
-- =============================================
CREATE TABLE savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_name TEXT NOT NULL,
    description TEXT,
    goal_category TEXT,
    target_amount NUMERIC(18,2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    current_amount NUMERIC(18,2) DEFAULT 0,
    target_date DATE,
    color_tag TEXT,
    icon_emoji TEXT,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_savings_goals_user_id ON savings_goals(user_id);
CREATE INDEX idx_savings_goals_current_amount ON savings_goals(current_amount);
CREATE INDEX idx_savings_goals_target_date ON savings_goals(target_date);
CREATE INDEX idx_savings_goals_is_active ON savings_goals(is_active);

CREATE TRIGGER update_savings_goals_updated_at BEFORE UPDATE ON savings_goals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================
-- 10. SAVINGS_GOAL_ACCOUNTS
-- =============================================
CREATE TABLE savings_goal_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    savings_goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    manual_account_id UUID REFERENCES manual_accounts(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    contribution_percentage NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(savings_goal_id, manual_account_id, bank_account_id)
);

-- =============================================
-- 11. SAVINGS_GOAL_TRANSACTIONS
-- =============================================
CREATE TABLE savings_goal_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    savings_goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    contributed_amount NUMERIC(18,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 12. AUDIT_LOGS
-- =============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSON,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================================
-- 13. EMAIL_VERIFICATIONS
-- =============================================
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code_hash TEXT,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id);

-- =============================================
-- 14. PHONE_VERIFICATIONS
-- =============================================
CREATE TABLE phone_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_phone_verifications_user_id ON phone_verifications(user_id);

-- =============================================
-- 15. PASSWORD_RESETS
-- =============================================
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_token TEXT NOT NULL UNIQUE,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX idx_password_resets_reset_token ON password_resets(reset_token);

-- =============================================
-- 16. SESSIONS
-- =============================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    device_name TEXT,
    device_type TEXT,
    browser TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    -- Set when the refresh token was exchanged for a new one (rotation). Presenting a rotated token after
    -- the short grace window is treated as token theft: every session of the user is revoked.
    rotated_at TIMESTAMP,
    -- All the refresh tokens of one login (the rotation chain) share a family: logout deletes the whole family,
    -- and a rotated token is only honoured in the grace window while its family still has a live head.
    family_id UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_family_id ON sessions(family_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- =============================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_individuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 1. USERS
CREATE POLICY user_isolation ON users
    FOR SELECT USING (id = current_user_id());

CREATE POLICY user_update_self ON users
    FOR UPDATE USING (id = current_user_id());

-- 2. USER_INDIVIDUALS
CREATE POLICY user_individuals_isolation ON user_individuals
    FOR SELECT USING (user_id = current_user_id());
CREATE POLICY user_individuals_update ON user_individuals
    FOR UPDATE USING (user_id = current_user_id());
CREATE POLICY user_individuals_insert ON user_individuals
    FOR INSERT WITH CHECK (user_id = current_user_id());

-- 3. USER_BUSINESSES
CREATE POLICY user_businesses_isolation ON user_businesses
    FOR SELECT USING (user_id = current_user_id());
CREATE POLICY user_businesses_update ON user_businesses
    FOR UPDATE USING (user_id = current_user_id());
CREATE POLICY user_businesses_insert ON user_businesses
    FOR INSERT WITH CHECK (user_id = current_user_id());

-- 4. TRANSACTION_CATEGORIES (System categories are visible to all, User categories only to owner)
CREATE POLICY category_visibility ON transaction_categories
    FOR SELECT USING (is_system = true OR user_id = current_user_id());

CREATE POLICY category_user_management ON transaction_categories
    FOR ALL USING (user_id = current_user_id());

-- 5. BANK_ACCOUNTS
CREATE POLICY bank_accounts_isolation ON bank_accounts
    FOR ALL USING (user_id = current_user_id());

-- 6. MANUAL_ACCOUNTS
CREATE POLICY manual_accounts_isolation ON manual_accounts
    FOR ALL USING (user_id = current_user_id());

-- 7. TRANSACTIONS
-- WITH CHECK also verifies that the referenced account belongs to the same user (FK checks bypass RLS,
-- so without this a user could attach a transaction to somebody else's account id).
CREATE POLICY transactions_isolation ON transactions
    FOR ALL USING (user_id = current_user_id())
    WITH CHECK (
        user_id = current_user_id()
        AND (manual_account_id IS NULL OR EXISTS (SELECT 1 FROM manual_accounts m WHERE m.id = manual_account_id AND m.user_id = current_user_id()))
        AND (bank_account_id IS NULL OR EXISTS (SELECT 1 FROM bank_accounts b WHERE b.id = bank_account_id AND b.user_id = current_user_id()))
        AND (transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM transaction_categories c WHERE c.id = transactions.category_id AND (c.is_system = true OR c.user_id = current_user_id())))
    );

-- 8. ACCOUNT_BALANCES
CREATE POLICY account_balances_isolation ON account_balances
    FOR ALL USING (user_id = current_user_id());

-- 9. SAVINGS_GOALS
CREATE POLICY savings_goals_isolation ON savings_goals
    FOR ALL USING (user_id = current_user_id());

-- 10. SAVINGS_GOAL_ACCOUNTS (Indirect check through savings_goal)
CREATE POLICY savings_goal_accounts_isolation ON savings_goal_accounts
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM savings_goals WHERE id = savings_goal_accounts.savings_goal_id AND user_id = current_user_id())
    );

CREATE POLICY savings_goal_accounts_modification ON savings_goal_accounts
    FOR ALL USING (
         EXISTS (SELECT 1 FROM savings_goals WHERE id = savings_goal_accounts.savings_goal_id AND user_id = current_user_id())
    );

-- 11. SAVINGS_GOAL_TRANSACTIONS
CREATE POLICY savings_goal_transactions_isolation ON savings_goal_transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM savings_goals WHERE id = savings_goal_transactions.savings_goal_id AND user_id = current_user_id())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM savings_goals WHERE id = savings_goal_transactions.savings_goal_id AND user_id = current_user_id())
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = savings_goal_transactions.transaction_id AND t.user_id = current_user_id())
    );

-- 12. AUDIT_LOGS (Users can see their own logs)
CREATE POLICY audit_logs_isolation ON audit_logs
    FOR SELECT USING (user_id = current_user_id());
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (user_id = current_user_id());

-- 13. EMAIL_VERIFICATIONS
CREATE POLICY email_verifications_isolation ON email_verifications
    FOR ALL USING (user_id = current_user_id());

-- 14. PHONE_VERIFICATIONS
CREATE POLICY phone_verifications_isolation ON phone_verifications
    FOR ALL USING (user_id = current_user_id());

-- 15. PASSWORD_RESETS
CREATE POLICY password_resets_isolation ON password_resets
    FOR ALL USING (user_id = current_user_id());

-- 16. SESSIONS
CREATE POLICY sessions_isolation ON sessions
    FOR ALL USING (user_id = current_user_id());


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
        AND (recurring_transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM transaction_categories c WHERE c.id = recurring_transactions.category_id AND (c.is_system = true OR c.user_id = current_user_id())))
    );


-- =============================================
-- SYSTEM DATA: DEFAULT CATEGORIES
-- =============================================

INSERT INTO transaction_categories (category_name, category_type, description, color_tag, icon_emoji, is_system) VALUES
-- INCOME
('Stipendio', 'income', 'Stipendio mensile', 'green', '💼', true),
('Bonus', 'income', 'Bonus e premi', 'green', '💰', true),
('Regalo', 'income', 'Regali ricevuti', 'green', '🎁', true),
('Rimborso', 'income', 'Rimborsi spese o tasse', 'green', '💸', true),
('Interesse', 'income', 'Interessi da investimenti o conti', 'green', '🏦', true),
('Investimenti', 'income', 'Rendite da investimenti', 'green', '📊', true),
('Altro Reddito', 'income', 'Entrate varie', 'green', '👔', true);

INSERT INTO transaction_categories (category_name, category_type, description, color_tag, icon_emoji, is_system) VALUES
-- EXPENSE
('Cibo & Ristoranti', 'expense', 'Spesa al supermercato e pasti fuori', 'red', '🍔', true),
('Affitto & Alloggio', 'expense', 'Affitto, mutuo, condominio', 'red', '🏠', true),
('Utenze', 'expense', 'Luce, Gas, Acqua, Internet, Telefono', 'red', '📱', true),
('Trasporti & Auto', 'expense', 'Benzina, mezzi pubblici, taxi', 'red', '🚗', true),
('Abbigliamento & Accessori', 'expense', 'Vestiti, scarpe, borse', 'red', '👕', true),
('Intrattenimento & Hobby', 'expense', 'Cinema, teatro, hobby', 'red', '🎬', true),
('Salute & Medicina', 'expense', 'Farmaci, visite mediche', 'red', '🏥', true),
('Educazione', 'expense', 'Libri, corsi, tasse scolastiche', 'red', '📚', true),
('Shopping & Negozi', 'expense', 'Acquisti vari', 'red', '🛍️', true),
('Viaggi', 'expense', 'Vacanze, hotel, voli', 'red', '✈️', true),
('Bellezza & Cura Personale', 'expense', 'Parrucchiere, estetica', 'red', '💇', true),
('Animali Domestici', 'expense', 'Cibo e cure veterinare', 'red', '🐕', true),
('Regali', 'expense', 'Regali fatti ad altri', 'red', '🎁', true),
('Pagamenti Carte', 'expense', 'Saldo carta di credito', 'red', '💳', true),
('Commissioni Bancarie', 'expense', 'Costi del conto o bonifici', 'red', '🏦', true),
('Pulizia & Manutenzione', 'expense', 'Prodotti casa, idraulico', 'red', '🧹', true),
('Giochi & Divertimento', 'expense', 'Videogiochi, app', 'red', '🎮', true),
('Varie', 'expense', 'Spese non categorizzate', 'gray', '💐', true);


