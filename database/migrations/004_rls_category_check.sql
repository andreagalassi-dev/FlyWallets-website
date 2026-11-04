-- Defense in depth: transactions and recurring rules may only reference a category visible to their owner
-- (a system category or one of the user's own). New installs get these policies from schema.sql.
-- Run once:  psql "$DATABASE_URL" -f database/migrations/004_rls_category_check.sql

BEGIN;

DROP POLICY IF EXISTS transactions_isolation ON transactions;
CREATE POLICY transactions_isolation ON transactions
    FOR ALL USING (user_id = current_user_id())
    WITH CHECK (
        user_id = current_user_id()
        AND (manual_account_id IS NULL OR EXISTS (SELECT 1 FROM manual_accounts m WHERE m.id = manual_account_id AND m.user_id = current_user_id()))
        AND (bank_account_id IS NULL OR EXISTS (SELECT 1 FROM bank_accounts b WHERE b.id = bank_account_id AND b.user_id = current_user_id()))
        AND (transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM transaction_categories c WHERE c.id = transactions.category_id AND (c.is_system = true OR c.user_id = current_user_id())))
    );

DROP POLICY IF EXISTS recurring_isolation ON recurring_transactions;
CREATE POLICY recurring_isolation ON recurring_transactions
    FOR ALL USING (user_id = current_user_id())
    WITH CHECK (
        user_id = current_user_id()
        AND EXISTS (SELECT 1 FROM manual_accounts m WHERE m.id = manual_account_id AND m.user_id = current_user_id())
        AND (recurring_transactions.category_id IS NULL OR EXISTS (SELECT 1 FROM transaction_categories c WHERE c.id = recurring_transactions.category_id AND (c.is_system = true OR c.user_id = current_user_id())))
    );

COMMIT;
