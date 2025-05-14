-- This file should undo anything in `up.sql`
DROP INDEX IF EXISTS idx_users_is_admin;
ALTER TABLE users DROP COLUMN is_admin;