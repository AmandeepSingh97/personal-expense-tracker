-- Run this in your Supabase project → SQL Editor → New Query

CREATE TABLE IF NOT EXISTS import_batches (
  id           BIGSERIAL PRIMARY KEY,
  filename     TEXT NOT NULL,
  account_name TEXT NOT NULL,
  row_count    INTEGER NOT NULL DEFAULT 0,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                BIGSERIAL PRIMARY KEY,
  date              TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC NOT NULL,
  account_name      TEXT NOT NULL,
  category          TEXT,
  sub_category      TEXT,
  merchant_name     TEXT,
  is_recurring      INTEGER NOT NULL DEFAULT 0,
  is_transfer       INTEGER NOT NULL DEFAULT 0,
  is_investment     INTEGER NOT NULL DEFAULT 0,
  confidence_score  NUMERIC,
  manually_corrected INTEGER NOT NULL DEFAULT 0,
  raw_text          TEXT,
  import_batch_id   BIGINT REFERENCES import_batches(id),
  dedup_hash        TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_account  ON transactions(account_name);

CREATE TABLE IF NOT EXISTS budgets (
  id                  BIGSERIAL PRIMARY KEY,
  category            TEXT NOT NULL UNIQUE,
  monthly_limit       NUMERIC NOT NULL,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL,
  category     TEXT,
  message      TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  month_key    TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed_at);

CREATE TABLE IF NOT EXISTS category_corrections (
  id                   BIGSERIAL PRIMARY KEY,
  description_pattern  TEXT NOT NULL,
  correct_category     TEXT NOT NULL,
  correct_sub_category TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_column_mappings (
  id           BIGSERIAL PRIMARY KEY,
  account_name TEXT NOT NULL UNIQUE,
  mapping      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  bank            TEXT,
  account_type    TEXT NOT NULL DEFAULT 'savings',
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  opening_date    TEXT NOT NULL DEFAULT CURRENT_DATE::text,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  is_active       INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  tags            JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_categories (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  emoji      TEXT NOT NULL DEFAULT '📌',
  color      TEXT NOT NULL DEFAULT '#9ca3af',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_txn ON transaction_tags(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

CREATE TABLE IF NOT EXISTS savings_goals (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  target_amount   NUMERIC NOT NULL,
  current_amount  NUMERIC NOT NULL DEFAULT 0,
  deadline        TEXT,
  category        TEXT,
  monthly_target  NUMERIC DEFAULT 0,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id              BIGSERIAL PRIMARY KEY,
  date            TEXT NOT NULL,
  description     TEXT NOT NULL,
  total_amount    NUMERIC NOT NULL,
  paid_by         TEXT NOT NULL DEFAULT 'Amandeep',
  aman_share      NUMERIC NOT NULL,
  preet_share     NUMERIC NOT NULL,
  is_settlement   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id                      BIGSERIAL PRIMARY KEY,
  parent_transaction_id   BIGINT NOT NULL,
  category                TEXT NOT NULL,
  sub_category            TEXT,
  amount                  NUMERIC NOT NULL,
  description             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
