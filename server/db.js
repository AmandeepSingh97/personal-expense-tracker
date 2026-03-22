const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'expense_tracker.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  // Add is_investment column if upgrading an existing DB
  try { db.exec(`ALTER TABLE transactions ADD COLUMN is_investment INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  // Add tags column to accounts if upgrading
  try { db.exec(`ALTER TABLE accounts ADD COLUMN tags TEXT DEFAULT '[]'`); } catch (_) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      account_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      account_name TEXT NOT NULL,
      category TEXT,
      sub_category TEXT,
      merchant_name TEXT,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      is_transfer INTEGER NOT NULL DEFAULT 0,
      confidence_score REAL,
      manually_corrected INTEGER NOT NULL DEFAULT 0,
      is_investment INTEGER NOT NULL DEFAULT 0,
      raw_text TEXT,
      import_batch_id INTEGER REFERENCES import_batches(id),
      dedup_hash TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_name);

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      monthly_limit REAL NOT NULL,
      alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT,
      message TEXT NOT NULL,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
      dismissed_at TEXT,
      month_key TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed_at);

    CREATE TABLE IF NOT EXISTS category_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description_pattern TEXT NOT NULL,
      correct_category TEXT NOT NULL,
      correct_sub_category TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_column_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL UNIQUE,
      mapping JSON NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL UNIQUE,
      bank         TEXT,
      account_type TEXT NOT NULL DEFAULT 'savings',  -- savings | current | credit | investment
      opening_balance REAL NOT NULL DEFAULT 0,
      opening_date TEXT NOT NULL DEFAULT (date('now')),
      color        TEXT NOT NULL DEFAULT '#6366f1',
      is_active    INTEGER NOT NULL DEFAULT 1,
      notes        TEXT,
      tags         TEXT DEFAULT '[]',   -- JSON array of tag strings e.g. ["salary","joint"]
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS custom_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL DEFAULT '📌',
      color TEXT NOT NULL DEFAULT '#9ca3af',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (transaction_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transaction_tags_txn ON transaction_tags(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);
  `);
}

module.exports = { getDb };
