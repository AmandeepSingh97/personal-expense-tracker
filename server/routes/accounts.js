const express = require('express');
const { getDb } = require('../db');
const { periodExpr, periodRange } = require('../utils/budgetPeriod');

const router = express.Router();

// Compute current balance = opening_balance + sum of all transactions for this account
function getBalance(db, accountName) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as tx_total
    FROM transactions
    WHERE account_name = ? AND is_transfer = 0
  `).get(accountName);

  const acct = db.prepare(`SELECT opening_balance FROM accounts WHERE name = ?`).get(accountName);
  if (!acct) return null;
  return Math.round((acct.opening_balance + row.tx_total) * 100) / 100;
}

// GET /api/accounts  — all accounts with current balance
router.get('/', (req, res) => {
  const db = getDb();
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at`).all();

  const enriched = accounts.map(a => {
    const txRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as tx_total, COUNT(*) as tx_count
      FROM transactions WHERE account_name = ? AND is_transfer = 0
    `).get(a.name);

    const current_balance = Math.round((a.opening_balance + txRow.tx_total) * 100) / 100;
    return { ...a, tags: JSON.parse(a.tags || '[]'), current_balance, tx_count: txRow.tx_count };
  });

  res.json(enriched);
});

// POST /api/accounts  — create account
router.post('/', (req, res) => {
  const db = getDb();
  const { name, bank, account_type = 'savings', opening_balance = 0, opening_date, color = '#6366f1', notes, tags = [] } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(name.trim());
  if (existing) return res.status(400).json({ error: 'Account already exists' });

  const result = db.prepare(`
    INSERT INTO accounts (name, bank, account_type, opening_balance, opening_date, color, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(), bank || null, account_type,
    Number(opening_balance),
    opening_date || new Date().toISOString().split('T')[0],
    color, notes || null, JSON.stringify(tags)
  );

  res.json({ id: result.lastInsertRowid, ok: true });
});

// PATCH /api/accounts/:id  — update account
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { name, bank, account_type, opening_balance, opening_date, color, notes, is_active, tags } = req.body;

  const acct = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!acct) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE accounts SET
      name = ?, bank = ?, account_type = ?,
      opening_balance = ?, opening_date = ?,
      color = ?, notes = ?, is_active = ?, tags = ?
    WHERE id = ?
  `).run(
    name ?? acct.name, bank ?? acct.bank, account_type ?? acct.account_type,
    opening_balance !== undefined ? Number(opening_balance) : acct.opening_balance,
    opening_date ?? acct.opening_date,
    color ?? acct.color, notes ?? acct.notes,
    is_active !== undefined ? (is_active ? 1 : 0) : acct.is_active,
    tags !== undefined ? JSON.stringify(tags) : acct.tags,
    req.params.id
  );
  res.json({ ok: true });
});

// DELETE /api/accounts/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE accounts SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/accounts/summary  — net worth + per-account balances
router.get('/summary', (req, res) => {
  const db = getDb();
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1`).all();

  let netWorth = 0;
  const breakdown = accounts.map(a => {
    const txRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as tx_total
      FROM transactions WHERE account_name = ?
    `).get(a.name);
    const bal = Math.round((a.opening_balance + txRow.tx_total) * 100) / 100;
    if (a.account_type !== 'credit') netWorth += bal;
    else netWorth += bal; // credit card balances are negative, so they reduce net worth
    return { ...a, current_balance: bal };
  });

  res.json({ netWorth: Math.round(netWorth * 100) / 100, accounts: breakdown });
});

// GET /api/accounts/history  — balance trend per account over last N periods
// Returns data suitable for a multi-line balance chart.
router.get('/history', (req, res) => {
  const db = getDb();
  const months = Number(req.query.months || 6);
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1`).all();

  if (accounts.length === 0) return res.json([]);

  // Generate the last N period keys (YYYY-MM, 25th-based)
  const periods = [];
  const now = new Date();
  let cur = now.getDate() >= 25
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  for (let i = 0; i < months; i++) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    periods.unshift(key);
    cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
  }

  const PERIOD = periodExpr('date');

  // For each account × period, compute the cumulative balance up to end of that period
  const result = [];
  for (const period of periods) {
    const { end } = periodRange(period);
    const row = { period };

    for (const acct of accounts) {
      const txRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE account_name = ? AND date <= ?
      `).get(acct.name, end);

      row[acct.name] = Math.round((acct.opening_balance + txRow.total) * 100) / 100;
    }
    result.push(row);
  }

  res.json({ periods, accounts: accounts.map(a => ({
    name: a.name, color: a.color, account_type: a.account_type, tags: JSON.parse(a.tags || '[]'),
  })), history: result });
});

// GET /api/accounts/analytics  — per-account spend breakdown for a period
router.get('/analytics', (req, res) => {
  const db = getDb();
  const { month } = req.query;
  const PERIOD = periodExpr('date');
  const periodFilter = month ? `AND (${PERIOD}) = '${month}'` : '';

  const rows = db.prepare(`
    SELECT account_name,
           ROUND(SUM(CASE WHEN amount < 0 AND is_transfer = 0 AND is_investment = 0 THEN ABS(amount) ELSE 0 END), 0) as expenses,
           ROUND(SUM(CASE WHEN amount > 0 AND is_transfer = 0 THEN amount ELSE 0 END), 0) as income,
           ROUND(SUM(CASE WHEN is_investment = 1 THEN ABS(amount) ELSE 0 END), 0) as invested,
           COUNT(*) as tx_count
    FROM transactions
    WHERE 1=1 ${periodFilter}
    GROUP BY account_name
    ORDER BY expenses DESC
  `).all();

  // Enrich with account metadata
  const accounts = db.prepare(`SELECT * FROM accounts WHERE is_active = 1`).all();
  const acctMap = Object.fromEntries(accounts.map(a => [a.name, a]));

  const enriched = rows.map(r => ({
    ...r,
    color: acctMap[r.account_name]?.color || '#9ca3af',
    tags: JSON.parse(acctMap[r.account_name]?.tags || '[]'),
    account_type: acctMap[r.account_name]?.account_type || 'savings',
  }));

  res.json(enriched);
});

// GET /api/accounts/batches  — import history (kept for backward compat)
router.get('/batches', (req, res) => {
  const db = getDb();
  const batches = db.prepare('SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT 50').all();
  res.json(batches);
});

module.exports = router;
