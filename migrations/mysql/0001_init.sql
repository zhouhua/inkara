-- Production schema for Aliyun RDS MySQL 8.0 (AliSQL vector).
-- SQLite/D1 migrations in ../ stay for Cloudflare. This file is the Node deploy.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(128) PRIMARY KEY,
  applied_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  email_verified VARCHAR(40) NULL,
  image TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY users_email_uidx (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(512) NOT NULL,
  expires VARCHAR(40) NOT NULL,
  PRIMARY KEY (identifier, token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_lots (
  id VARCHAR(128) PRIMARY KEY,
  subject_id VARCHAR(128) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  amount INT NOT NULL,
  remaining INT NOT NULL,
  grant_date VARCHAR(10) NULL,
  expires_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT credit_lots_kind_chk CHECK (kind IN ('daily_grant', 'purchased', 'goodwill')),
  CONSTRAINT credit_lots_amount_chk CHECK (amount > 0),
  CONSTRAINT credit_lots_remaining_chk CHECK (remaining >= 0 AND remaining <= amount),
  -- grant_date is NULL except daily_grant; MySQL unique allows many NULLs.
  UNIQUE KEY credit_lots_daily_grant_uidx (subject_id, grant_date),
  KEY credit_lots_subject_idx (subject_id),
  KEY credit_lots_subject_kind_idx (subject_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  current_period_start VARCHAR(40) NOT NULL,
  current_period_end VARCHAR(40) NOT NULL,
  cancel_at_period_end TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT subscriptions_status_chk CHECK (status IN ('active', 'canceled', 'expired')),
  CONSTRAINT subscriptions_cancel_chk CHECK (cancel_at_period_end IN (0, 1)),
  KEY subscriptions_user_idx (user_id),
  KEY subscriptions_user_status_idx (user_id, status),
  CONSTRAINT subscriptions_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_usage (
  user_id VARCHAR(128) NOT NULL,
  period_yyyy_mm VARCHAR(7) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period_yyyy_mm),
  CONSTRAINT subscription_usage_count_chk CHECK (count >= 0),
  CONSTRAINT subscription_usage_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goodwill_grants (
  user_id VARCHAR(128) NOT NULL,
  period_yyyy_mm VARCHAR(7) NOT NULL,
  granted_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, period_yyyy_mm),
  CONSTRAINT goodwill_grants_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  amount_fen INT NOT NULL,
  status VARCHAR(16) NOT NULL,
  channel VARCHAR(32) NULL,
  provider_trade_no VARCHAR(128) NULL,
  raw MEDIUMTEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT orders_amount_chk CHECK (amount_fen >= 0),
  CONSTRAINT orders_status_chk CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  UNIQUE KEY orders_provider_trade_no_uidx (provider_trade_no),
  KEY orders_user_idx (user_id),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id VARCHAR(128) PRIMARY KEY,
  subject_id VARCHAR(128) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(128) NOT NULL,
  ref_order VARCHAR(128) NULL,
  ref_ask VARCHAR(128) NULL,
  lot_id VARCHAR(128) NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY ledger_entries_subject_idx (subject_id),
  KEY ledger_entries_ref_order_idx (ref_order),
  KEY ledger_entries_ref_ask_idx (ref_ask)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  subject_id VARCHAR(128) PRIMARY KEY,
  locale VARCHAR(16) NOT NULL DEFAULT 'zh',
  paper_style VARCHAR(32) NOT NULL DEFAULT 'plain',
  input_mode VARCHAR(16) NOT NULL DEFAULT 'pen',
  submit_mode VARCHAR(16) NOT NULL DEFAULT 'manual',
  idle_pace VARCHAR(16) NOT NULL DEFAULT 'normal',
  has_committed_once TINYINT NOT NULL DEFAULT 0,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT user_settings_committed_chk CHECK (has_committed_once IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pages (
  id VARCHAR(128) PRIMARY KEY,
  subject_id VARCHAR(128) NOT NULL,
  created_at BIGINT NOT NULL,
  transcription MEDIUMTEXT NOT NULL,
  reply MEDIUMTEXT NOT NULL,
  KEY pages_subject_created_idx (subject_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1024-d page embeddings (bge-m3 / text-embedding-v3). HNSW cosine.
-- App score = 1 - VEC_DISTANCE_COSINE (distance 0 = identical).
CREATE TABLE IF NOT EXISTS page_embeddings (
  page_id VARCHAR(128) PRIMARY KEY,
  subject_id VARCHAR(128) NOT NULL,
  dims INT NOT NULL,
  model VARCHAR(128) NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  VECTOR INDEX page_embeddings_hnsw (embedding) M=16 DISTANCE=COSINE,
  KEY page_embeddings_subject_idx (subject_id),
  CONSTRAINT page_embeddings_page_fk FOREIGN KEY (page_id) REFERENCES pages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (id, applied_at)
VALUES ('0001_init', '2026-10-18T00:00:00.000Z')
ON DUPLICATE KEY UPDATE id = id;
