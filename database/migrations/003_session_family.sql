-- Refresh-token families: every rotation chain (one login) shares a family_id so logout can revoke the whole
-- chain and a rotated token is honoured in the grace window only while its family still has a live head.
-- New installs get this from schema.sql. Run once (after 002):  psql "$DATABASE_URL" -f database/migrations/003_session_family.sql

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS family_id UUID;
UPDATE sessions SET family_id = gen_random_uuid() WHERE family_id IS NULL;
ALTER TABLE sessions ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
ALTER TABLE sessions ALTER COLUMN family_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_family_id ON sessions(family_id);
