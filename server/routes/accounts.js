const express = require('express');
const db = require('../db');
const { periodExpr, periodRange } = require('../utils/budgetPeriod');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const accounts = await db.query('SELECT * FROM accounts WHERE is_active=1 ORDER BY created_at');
    const enriched = await Promise.all(accounts.map(async a => {
      const txRow = await db.queryOne(`SELECT COALESCE(SUM(amount),0) as tx_total, COUNT(*)::int as tx_count FROM transactions WHERE account_name=? AND is_transfer=0`, [a.name]);
      return { ...a, tags: a.tags || [], current_balance: Math.round((Number(a.opening_balance) + Number(txRow.tx_total)) * 100) / 100, tx_count: txRow.tx_count };
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, bank, account_type='savings', opening_balance=0, opening_date, color='#6366f1', notes, tags=[] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const existing = await db.queryOne('SELECT id FROM accounts WHERE name=?', [name.trim()]);
    if (existing) return res.status(400).json({ error: 'Account already exists' });
    const result = await db.run(
      `INSERT INTO accounts (name,bank,account_type,opening_balance,opening_date,color,notes,tags) VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
      [name.trim(), bank||null, account_type, Number(opening_balance),
       opening_date||new Date().toISOString().split('T')[0], color, notes||null, JSON.stringify(tags)]);
    res.json({ id: result.lastInsertRowid, ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, bank, account_type, opening_balance, opening_date, color, notes, is_active, tags } = req.body;
    const acct = await db.queryOne('SELECT * FROM accounts WHERE id=?', [req.params.id]);
    if (!acct) return res.status(404).json({ error: 'Not found' });
    await db.run(`UPDATE accounts SET name=?,bank=?,account_type=?,opening_balance=?,opening_date=?,color=?,notes=?,is_active=?,tags=? WHERE id=?`,
      [name??acct.name, bank??acct.bank, account_type??acct.account_type,
       opening_balance!==undefined?Number(opening_balance):acct.opening_balance,
       opening_date??acct.opening_date, color??acct.color, notes??acct.notes,
       is_active!==undefined?(is_active?1:0):acct.is_active,
       tags!==undefined?JSON.stringify(tags):JSON.stringify(acct.tags||[]),
       req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('UPDATE accounts SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const accounts = await db.query('SELECT * FROM accounts WHERE is_active=1');
    let netWorth = 0;
    const breakdown = await Promise.all(accounts.map(async a => {
      const txRow = await db.queryOne('SELECT COALESCE(SUM(amount),0) as tx_total FROM transactions WHERE account_name=?', [a.name]);
      const bal = Math.round((Number(a.opening_balance) + Number(txRow.tx_total)) * 100) / 100;
      netWorth += bal;
      return { ...a, current_balance: bal };
    }));
    res.json({ netWorth: Math.round(netWorth * 100) / 100, accounts: breakdown });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history', async (req, res) => {
  try {
    const months = Number(req.query.months || 6);
    const accounts = await db.query('SELECT * FROM accounts WHERE is_active=1');
    if (!accounts.length) return res.json({ periods: [], accounts: [], history: [] });

    const periods = [];
    const now = new Date();
    let cur = now.getDate() >= 25
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    for (let i = 0; i < months; i++) {
      periods.unshift(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
      cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1);
    }

    const history = await Promise.all(periods.map(async period => {
      const { end } = periodRange(period);
      const row = { period };
      for (const acct of accounts) {
        const txRow = await db.queryOne('SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE account_name=? AND date<=?', [acct.name, end]);
        row[acct.name] = Math.round((Number(acct.opening_balance) + Number(txRow.total)) * 100) / 100;
      }
      return row;
    }));

    res.json({ periods, accounts: accounts.map(a => ({ name:a.name, color:a.color, account_type:a.account_type, tags:a.tags||[] })), history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics', async (req, res) => {
  try {
    const { month } = req.query;
    const PERIOD = periodExpr('date');
    const periodFilter = month ? `AND (${PERIOD})='${month}'` : '';
    const rows = await db.query(`
      SELECT account_name,
             ROUND(SUM(CASE WHEN amount<0 AND is_transfer=0 AND is_investment=0 THEN ABS(amount) ELSE 0 END),0) as expenses,
             ROUND(SUM(CASE WHEN amount>0 AND is_transfer=0 THEN amount ELSE 0 END),0) as income,
             ROUND(SUM(CASE WHEN is_investment=1 THEN ABS(amount) ELSE 0 END),0) as invested,
             COUNT(*)::int as tx_count
      FROM transactions WHERE 1=1 ${periodFilter}
      GROUP BY account_name ORDER BY expenses DESC`);

    const accounts = await db.query('SELECT * FROM accounts WHERE is_active=1');
    const acctMap = Object.fromEntries(accounts.map(a => [a.name, a]));
    res.json(rows.map(r => ({ ...r, color: acctMap[r.account_name]?.color||'#9ca3af', tags: acctMap[r.account_name]?.tags||[], account_type: acctMap[r.account_name]?.account_type||'savings' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/batches', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT 50'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
