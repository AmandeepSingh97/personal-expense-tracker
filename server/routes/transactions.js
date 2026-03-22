const express = require('express');
const { getDb } = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();

// period expression for reuse
const PERIOD = periodExpr('date');

// GET /api/transactions  — list with filters
router.get('/', (req, res) => {
  const db = getDb();
  const {
    page = 1,
    limit = 50,
    from,
    to,
    account,
    category,
    sub_category,
    min_amount,
    max_amount,
    search,
    month,           // budget period YYYY-MM (25th–24th)
    tag,             // filter by tag name
    include_transfers = 'false',
  } = req.query;

  const conditions = [];
  const params = [];

  if (month) {
    conditions.push(`(${PERIOD}) = ?`);
    params.push(month);
  } else {
    if (from) { conditions.push('date >= ?'); params.push(from); }
    if (to)   { conditions.push('date <= ?'); params.push(to); }
  }
  if (account)      { conditions.push('account_name = ?'); params.push(account); }
  if (category)     { conditions.push('category = ?'); params.push(category); }
  if (sub_category) { conditions.push('sub_category = ?'); params.push(sub_category); }
  if (min_amount !== undefined) { conditions.push('ABS(amount) >= ?'); params.push(Number(min_amount)); }
  if (max_amount !== undefined) { conditions.push('ABS(amount) <= ?'); params.push(Number(max_amount)); }
  if (search)       { conditions.push('(description LIKE ? OR merchant_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (include_transfers === 'false') { conditions.push('is_transfer = 0'); }

  // Tag filter — join to transaction_tags + tags
  let fromClause = 'FROM transactions';
  if (tag) {
    fromClause = `FROM transactions
      JOIN transaction_tags tt ON tt.transaction_id = transactions.id
      JOIN tags tg ON tg.id = tt.tag_id AND tg.name = ?`;
    params.unshift(tag); // tag param goes first since it's in the JOIN
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as count ${fromClause} ${where}`).get(...params).count;
  const rows  = db.prepare(`SELECT transactions.* ${fromClause} ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), offset);

  res.json({ total, page: Number(page), limit: Number(limit), data: rows });
});

// GET /api/transactions/summary  — totals by category for a budget period
router.get('/summary', (req, res) => {
  const db = getDb();
  const { month } = req.query;

  const periodFilter = month ? `AND (${PERIOD}) = '${month}'` : '';

  const rows = db.prepare(
    `SELECT category, sub_category,
            COUNT(*) as count,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income
     FROM transactions
     WHERE is_transfer = 0 ${periodFilter}
     GROUP BY category, sub_category
     ORDER BY total_spent DESC`
  ).all();

  res.json(rows);
});

// GET /api/transactions/monthly-trend  — last N budget periods
router.get('/monthly-trend', (req, res) => {
  const db = getDb();
  const months = Number(req.query.months || 6);

  const rows = db.prepare(
    `SELECT (${PERIOD}) as month,
            SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income
     FROM transactions
     WHERE is_transfer = 0
       AND date >= date('now', '-${months} months')
     GROUP BY (${PERIOD})
     ORDER BY month ASC`
  ).all();

  res.json(rows);
});

// GET /api/transactions/recurring
router.get('/recurring', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT merchant_name, category, sub_category,
            COUNT(*) as occurrences,
            AVG(ABS(amount)) as avg_amount,
            MAX(date) as last_date
     FROM transactions
     WHERE is_recurring = 1 AND is_transfer = 0
     GROUP BY merchant_name
     ORDER BY avg_amount DESC`
  ).all();
  res.json(rows);
});

// POST /api/transactions  — create a single transaction manually
router.post('/', (req, res) => {
  const db = getDb();
  const {
    date, description, amount, account_name = 'Manual',
    category, sub_category, merchant_name,
    is_recurring = 0, is_investment = 0, is_transfer = 0,
  } = req.body;

  if (!date || !description || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'date, description, amount required' });
  }

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(`${date}|${description}|${amount}|manual|${Date.now()}`)
    .digest('hex');

  const result = db.prepare(`
    INSERT INTO transactions
      (date, description, amount, account_name, category, sub_category, merchant_name,
       is_recurring, is_investment, is_transfer, manually_corrected, dedup_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    date, description, Number(amount), account_name,
    category || null, sub_category || null, merchant_name || null,
    is_recurring ? 1 : 0, is_investment ? 1 : 0, is_transfer ? 1 : 0,
    hash
  );

  const { runAlertEngine } = require('../services/alertEngine');
  runAlertEngine();

  res.json({ id: result.lastInsertRowid, ok: true });
});

// PATCH /api/transactions/:id  — manual category override
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { category, sub_category, merchant_name, is_recurring, save_correction } = req.body;
  const { id } = req.params;

  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!tx) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    `UPDATE transactions SET category=?, sub_category=?, merchant_name=?, is_recurring=?, manually_corrected=1 WHERE id=?`
  ).run(category, sub_category, merchant_name, is_recurring ? 1 : 0, id);

  if (save_correction && tx.description) {
    db.prepare(
      `INSERT INTO category_corrections (description_pattern, correct_category, correct_sub_category)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`
    ).run(tx.description, category, sub_category);
  }

  res.json({ ok: true });
});

// PATCH /api/transactions/bulk/categorize
router.patch('/bulk/categorize', (req, res) => {
  const db = getDb();
  const { ids, category, sub_category } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });

  const stmt = db.prepare(`UPDATE transactions SET category=?, sub_category=?, manually_corrected=1 WHERE id=?`);
  db.transaction(() => ids.forEach((id) => stmt.run(category, sub_category, id)))();

  res.json({ updated: ids.length });
});

// GET /api/transactions/export  — CSV
router.get('/export', (req, res) => {
  const db = getDb();
  const { from, to, account, category, month } = req.query;

  const conditions = ['1=1'];
  const params = [];
  if (month)    { conditions.push(`(${PERIOD}) = ?`); params.push(month); }
  if (from)     { conditions.push('date >= ?'); params.push(from); }
  if (to)       { conditions.push('date <= ?'); params.push(to); }
  if (account)  { conditions.push('account_name = ?'); params.push(account); }
  if (category) { conditions.push('category = ?'); params.push(category); }

  const rows = db.prepare(
    `SELECT date,description,amount,account_name,category,sub_category,merchant_name,is_recurring
     FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC`
  ).all(...params);

  const csv = 'Date,Description,Amount,Account,Category,Sub-Category,Merchant,Recurring\n' +
    rows.map(r =>
      `"${r.date}","${r.description}","${r.amount}","${r.account_name}","${r.category||''}","${r.sub_category||''}","${r.merchant_name||''}","${r.is_recurring ? 'Yes' : 'No'}"`
    ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(csv);
});

module.exports = router;
