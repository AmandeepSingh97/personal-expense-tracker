const express = require('express');
const { getDb } = require('../db');
const { periodExpr, currentPeriod } = require('../utils/budgetPeriod');

const PERIOD = periodExpr('date');

const router = express.Router();

// GET /api/budgets
router.get('/', (req, res) => {
  const db = getDb();
  const budgets = db.prepare('SELECT * FROM budgets ORDER BY category').all();
  res.json(budgets);
});

// PUT /api/budgets/:category  — upsert
router.put('/:category', (req, res) => {
  const db = getDb();
  const { category } = req.params;
  const { monthly_limit, alert_threshold_pct = 80 } = req.body;

  if (monthly_limit === undefined) return res.status(400).json({ error: 'monthly_limit required' });

  db.prepare(
    `INSERT INTO budgets (category, monthly_limit, alert_threshold_pct, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(category) DO UPDATE SET
       monthly_limit=excluded.monthly_limit,
       alert_threshold_pct=excluded.alert_threshold_pct,
       updated_at=excluded.updated_at`
  ).run(category, monthly_limit, alert_threshold_pct);

  res.json({ ok: true });
});

// DELETE /api/budgets/:category
router.delete('/:category', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM budgets WHERE category = ?').run(req.params.category);
  res.json({ ok: true });
});

// GET /api/budgets/utilization  — current month spend vs budget
router.get('/utilization/current', (req, res) => {
  const db = getDb();
  const { month } = req.query;

  const monthFilter = month || currentPeriod();

  const budgets = db.prepare('SELECT * FROM budgets').all();
  const utilization = budgets.map((b) => {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)), 0) as spent
         FROM transactions
         WHERE category = ?
           AND (${PERIOD}) = ?
           AND is_transfer = 0
           AND amount < 0`
      )
      .get(b.category, monthFilter);

    const spent = row.spent;
    const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
    return {
      ...b,
      spent,
      pct: Math.round(pct),
      status: pct >= 100 ? 'exceeded' : pct >= b.alert_threshold_pct ? 'warning' : 'ok',
    };
  });

  res.json(utilization);
});

module.exports = router;
