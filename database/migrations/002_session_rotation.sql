-- Refresh-token rotation with reuse detection.
-- New installs get this column from schema.sql. Run once:  psql "$DATABASE_URL" -f database/migrations/002_session_rotation.sql

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMP;
