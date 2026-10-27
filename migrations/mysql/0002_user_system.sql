-- User system: nullable email, phone, role/status, OAuth accounts, SMS OTP, admin audit.

ALTER TABLE users
  MODIFY email VARCHAR(255) NULL,
  ADD COLUMN phone VARCHAR(32) NULL,
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user',
  ADD COLUMN banned_at VARCHAR(40) NULL,
  ADD COLUMN ban_reason TEXT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_status_chk CHECK (status IN ('active', 'banned')),
  ADD CONSTRAINT users_role_chk CHECK (role IN ('user', 'admin'));

ALTER TABLE users
  ADD UNIQUE KEY users_phone_uidx (phone);

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  type VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT NULL,
  access_token TEXT NULL,
  expires_at INT NULL,
  token_type VARCHAR(64) NULL,
  scope TEXT NULL,
  id_token TEXT NULL,
  session_state TEXT NULL,
  UNIQUE KEY accounts_provider_uidx (provider, provider_account_id),
  KEY accounts_user_idx (user_id),
  CONSTRAINT accounts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sms_otp_challenges (
  phone VARCHAR(32) PRIMARY KEY,
  code_hash VARCHAR(128) NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT sms_otp_attempts_chk CHECK (attempts >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id VARCHAR(128) PRIMARY KEY,
  actor_id VARCHAR(128) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NULL,
  payload MEDIUMTEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY admin_audit_log_created_idx (created_at),
  KEY admin_audit_log_actor_idx (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
