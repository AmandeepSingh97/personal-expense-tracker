const express = require('express');
const db = require('../db');
const { periodExpr, currentPeriod } = require('../utils/budgetPeriod');

const router = express.Router();
const PERIOD = periodExpr('date');

router.get('/', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM budgets ORDER BY category'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:category', async (req, res) => {
  try {
    const { monthly_limit, alert_threshold_pct = 80 } = req.body;
    if (monthly_limit === undefined) return res.status(400).json({ error: 'monthly_limit required' });
    await db.run(`
      INSERT INTO budgets (category, monthly_limit, alert_threshold_pct, updated_at)
      VALUES (?,?,?,NOW())
      ON CONFLICT(category) DO UPDATE SET
        monthly_limit=EXCLUDED.monthly_limit,
        alert_threshold_pct=EXCLUDED.alert_threshold_pct,
        updated_at=EXCLUDED.updated_at`,
      [req.params.category, monthly_limit, alert_threshold_pct]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:category', async (req, res) => {
  try {
    await db.run('DELETE FROM budgets WHERE category = ?', [req.params.category]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/utilization/current', async (req, res) => {
  try {
    const monthFilter = req.query.month || currentPeriod();
    const budgets = await db.query('SELECT * FROM budgets');
    const utilization = await Promise.all(budgets.map(async b => {
      const row = await db.queryOne(`
        SELECT COALESCE(SUM(ABS(amount)),0) as spent
        FROM transactions
        WHERE category=? AND (${PERIOD})=? AND is_transfer=0 AND amount<0`,
        [b.category, monthFilter]);
      const spent = Number(row.spent);
      const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
      return { ...b, spent, pct: Math.round(pct), status: pct>=100?'exceeded':pct>=b.alert_threshold_pct?'warning':'ok' };
    }));
    res.json(utilization);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
