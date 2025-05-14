-- Your SQL goes here
ALTER TABLE users
ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
-- Add an index for faster lookups
CREATE INDEX idx_users_is_admin ON users(is_admin);