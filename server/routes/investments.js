const express = require('express');
const db = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    const PERIOD = periodExpr('date');

    const contributed = await db.query(`
      SELECT category, ROUND(SUM(ABS(amount)),2) as total, COUNT(*)::int as count,
             MIN(date) as first_date, MAX(date) as last_date
      FROM transactions
      WHERE is_investment=1 AND amount<0 AND is_transfer=0
      GROUP BY category ORDER BY total DESC`);

    const returns = await db.query(`
      SELECT category, description, ROUND(amount,2) as amount, date
      FROM transactions
      WHERE (category='Income' AND sub_category IN ('MSFT Dividend','NPS','Dividend','SGB Interest'))
         OR (is_investment=1 AND amount>0)
      ORDER BY date DESC`);

    const monthly = await db.query(`
      SELECT (${PERIOD}) as month,
             ROUND(SUM(ABS(amount)),2) as contributed, COUNT(*)::int as count
      FROM transactions
      WHERE is_investment=1 AND amount<0 AND is_transfer=0
      GROUP BY (${PERIOD}) ORDER BY month ASC`);

    const totalContributed = contributed.reduce((s,r) => s + Number(r.total), 0);
    const totalReturns     = returns.reduce((s,r) => s + Math.abs(Number(r.amount)), 0);

    res.json({ contributed, returns, monthly, totalContributed, totalReturns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
