-- User system: nullable email, phone, role/status, OAuth accounts, SMS OTP, admin audit.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  name TEXT,
  email_verified TEXT,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  banned_at TEXT,
  ban_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (
  id, email, phone, name, email_verified, image, status, role, banned_at, ban_reason, created_at
)
SELECT
  id,
  email,
  NULL,
  name,
  email_verified,
  image,
  'active',
  'user',
  NULL,
  NULL,
  created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX accounts_user_idx ON accounts (user_id);

CREATE TABLE sms_otp_challenges (
  phone TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
CREATE INDEX admin_audit_log_actor_idx ON admin_audit_log (actor_id);
