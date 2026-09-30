-- PRD-06 billing ledger (D1)
-- subject_id: logged-in users.id or anonymous cookie id

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE credit_lots (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('daily_grant', 'purchased', 'goodwill')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  -- daily_grant: calendar date Asia/Shanghai YYYY-MM-DD (for INSERT OR IGNORE)
  grant_date TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (remaining <= amount)
);

CREATE UNIQUE INDEX credit_lots_daily_grant_uidx
  ON credit_lots (subject_id, grant_date)
  WHERE kind = 'daily_grant' AND grant_date IS NOT NULL;

CREATE INDEX credit_lots_subject_idx ON credit_lots (subject_id);
CREATE INDEX credit_lots_subject_kind_idx ON credit_lots (subject_id, kind);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  sku TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX subscriptions_user_idx ON subscriptions (user_id);
CREATE INDEX subscriptions_user_status_idx ON subscriptions (user_id, status);

CREATE TABLE subscription_usage (
  user_id TEXT NOT NULL REFERENCES users (id),
  period_yyyy_mm TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, period_yyyy_mm)
);

CREATE TABLE goodwill_grants (
  user_id TEXT NOT NULL REFERENCES users (id),
  period_yyyy_mm TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period_yyyy_mm)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  sku TEXT NOT NULL,
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider_trade_no TEXT,
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX orders_provider_trade_no_uidx
  ON orders (provider_trade_no)
  WHERE provider_trade_no IS NOT NULL;

CREATE INDEX orders_user_idx ON orders (user_id);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_order TEXT,
  ref_ask TEXT,
  lot_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ledger_entries_subject_idx ON ledger_entries (subject_id);
CREATE INDEX ledger_entries_ref_order_idx ON ledger_entries (ref_order);
CREATE INDEX ledger_entries_ref_ask_idx ON ledger_entries (ref_ask);
