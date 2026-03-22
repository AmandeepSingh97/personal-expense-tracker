const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();
const PERIOD = periodExpr('date');

// POST /api/transactions  — create single transaction manually
router.post('/', async (req, res) => {
  try {
    const {
      date, description, amount, account_name = 'Manual',
      category, sub_category, merchant_name,
      is_recurring = 0, is_investment = 0, is_transfer = 0,
    } = req.body;

    if (!date || !description || amount === undefined || amount === null)
      return res.status(400).json({ error: 'date, description, amount required' });

    const hash = crypto.createHash('sha256')
      .update(`${date}|${description}|${amount}|manual|${Date.now()}`).digest('hex');

    const result = await db.run(`
      INSERT INTO transactions
        (date,description,amount,account_name,category,sub_category,merchant_name,
         is_recurring,is_investment,is_transfer,manually_corrected,dedup_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?) RETURNING id`,
      [date, description, Number(amount), account_name,
       category||null, sub_category||null, merchant_name||null,
       is_recurring?1:0, is_investment?1:0, is_transfer?1:0, hash]);

    const { runAlertEngine } = require('../services/alertEngine');
    await runAlertEngine();

    res.json({ id: result.lastInsertRowid, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 50, from, to, account, category, sub_category,
      min_amount, max_amount, search, month, tag, include_transfers = 'false',
    } = req.query;

    const conditions = [];
    const params = [];

    if (month)       { conditions.push(`(${PERIOD}) = ?`);  params.push(month); }
    else {
      if (from)      { conditions.push('date >= ?');         params.push(from); }
      if (to)        { conditions.push('date <= ?');         params.push(to); }
    }
    if (account)     { conditions.push('account_name = ?'); params.push(account); }
    if (category)    { conditions.push('category = ?');     params.push(category); }
    if (sub_category){ conditions.push('sub_category = ?'); params.push(sub_category); }
    if (min_amount !== undefined) { conditions.push('ABS(amount) >= ?'); params.push(Number(min_amount)); }
    if (max_amount !== undefined) { conditions.push('ABS(amount) <= ?'); params.push(Number(max_amount)); }
    if (search)      { conditions.push('(description ILIKE ? OR merchant_name ILIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (include_transfers === 'false') { conditions.push('is_transfer = 0'); }

    let fromClause = 'FROM transactions';
    if (tag) {
      fromClause = `FROM transactions
        JOIN transaction_tags tt ON tt.transaction_id = transactions.id
        JOIN tags tg ON tg.id = tt.tag_id AND tg.name = ?`;
      params.unshift(tag);
    }

    const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countRow = await db.queryOne(`SELECT COUNT(*) as count ${fromClause} ${where}`, params);
    const rows     = await db.query(
      `SELECT transactions.* ${fromClause} ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]);

    res.json({ total: Number(countRow.count), page: Number(page), limit: Number(limit), data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions/summary
router.get('/summary', async (req, res) => {
  try {
    const { month } = req.query;
    const periodFilter = month ? `AND (${PERIOD}) = '${month}'` : '';
    const rows = await db.query(`
      SELECT category, sub_category,
             COUNT(*)::int as count,
             SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent,
             SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income
      FROM transactions
      WHERE is_transfer = 0 ${periodFilter}
      GROUP BY category, sub_category
      ORDER BY total_spent DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions/monthly-trend
router.get('/monthly-trend', async (req, res) => {
  try {
    const months = Number(req.query.months || 6);
    const rows = await db.query(`
      SELECT (${PERIOD}) as month,
             SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent,
             SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income
      FROM transactions
      WHERE is_transfer = 0
        AND date::date >= (CURRENT_DATE - INTERVAL '${months} months')
      GROUP BY (${PERIOD})
      ORDER BY month ASC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions/recurring
router.get('/recurring', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT merchant_name, category, sub_category,
             COUNT(*)::int as occurrences,
             AVG(ABS(amount)) as avg_amount,
             MAX(date) as last_date
      FROM transactions
      WHERE is_recurring = 1 AND is_transfer = 0
      GROUP BY merchant_name, category, sub_category
      ORDER BY avg_amount DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/transactions/:id
router.patch('/:id', async (req, res) => {
  try {
    const { category, sub_category, merchant_name, is_recurring, save_correction } = req.body;
    const { id } = req.params;

    const tx = await db.queryOne('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!tx) return res.status(404).json({ error: 'Not found' });

    await db.run(`UPDATE transactions SET category=?,sub_category=?,merchant_name=?,is_recurring=?,manually_corrected=1 WHERE id=?`,
      [category, sub_category, merchant_name, is_recurring?1:0, id]);

    if (save_correction && tx.description) {
      await db.run(`INSERT INTO category_corrections (description_pattern,correct_category,correct_sub_category) VALUES (?,?,?) ON CONFLICT DO NOTHING`,
        [tx.description, category, sub_category]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/transactions/bulk/categorize
router.patch('/bulk/categorize', async (req, res) => {
  try {
    const { ids, category, sub_category } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    await Promise.all(ids.map(id =>
      db.run('UPDATE transactions SET category=?,sub_category=?,manually_corrected=1 WHERE id=?', [category, sub_category, id])
    ));
    res.json({ updated: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/transactions/export
router.get('/export', async (req, res) => {
  try {
    const { from, to, account, category, month } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (month)    { conditions.push(`(${PERIOD}) = ?`); params.push(month); }
    if (from)     { conditions.push('date >= ?'); params.push(from); }
    if (to)       { conditions.push('date <= ?'); params.push(to); }
    if (account)  { conditions.push('account_name = ?'); params.push(account); }
    if (category) { conditions.push('category = ?'); params.push(category); }

    const rows = await db.query(
      `SELECT date,description,amount,account_name,category,sub_category,merchant_name,is_recurring FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC`,
      params);

    const csv = 'Date,Description,Amount,Account,Category,Sub-Category,Merchant,Recurring\n' +
      rows.map(r => `"${r.date}","${r.description}","${r.amount}","${r.account_name}","${r.category||''}","${r.sub_category||''}","${r.merchant_name||''}","${r.is_recurring?'Yes':'No'}"`).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
