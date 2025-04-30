ALTER TABLE user_verifications
ADD COLUMN id_front_path VARCHAR(255);
ALTER TABLE user_verifications
ADD COLUMN id_verification_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted';
ALTER TABLE user_verifications
ADD COLUMN id_verified_at TIMESTAMPTZ;