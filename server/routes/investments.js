const express = require('express');
const { getDb } = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();
const PERIOD = periodExpr('date');

// GET /api/investments/summary
// Returns cumulative contributions, returns, and monthly trend.
router.get('/summary', (req, res) => {
  const db = getDb();

  // Cumulative contributions (money that went INTO investments)
  const contributed = db.prepare(`
    SELECT category,
           ROUND(SUM(ABS(amount)), 2) as total,
           COUNT(*) as count,
           MIN(date) as first_date,
           MAX(date) as last_date
    FROM transactions
    WHERE is_investment = 1 AND amount < 0 AND is_transfer = 0
    GROUP BY category
    ORDER BY total DESC
  `).all();

  // Returns received (dividends, NPS withdrawal, redemptions coming BACK as income)
  const returns = db.prepare(`
    SELECT category, description,
           ROUND(amount, 2) as amount,
           date
    FROM transactions
    WHERE (category IN ('Income') AND sub_category IN ('MSFT Dividend','NPS','Dividend','SGB Interest'))
       OR (is_investment = 1 AND amount > 0)
    ORDER BY date DESC
  `).all();

  // Monthly contributions trend
  const monthly = db.prepare(`
    SELECT (${PERIOD}) as month,
           ROUND(SUM(ABS(amount)), 2) as contributed,
           COUNT(*) as count
    FROM transactions
    WHERE is_investment = 1 AND amount < 0 AND is_transfer = 0
    GROUP BY (${PERIOD})
    ORDER BY month ASC
  `).all();

  // Total numbers
  const totalContributed = contributed.reduce((s, r) => s + r.total, 0);
  const totalReturns     = returns.reduce((s, r) => s + Math.abs(r.amount), 0);

  res.json({ contributed, returns, monthly, totalContributed, totalReturns });
});

module.exports = router;
