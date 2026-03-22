const db = require('../db');
const { periodRange, currentPeriod } = require('../utils/budgetPeriod');

async function runAlertEngine(periodKey) {
  const key = periodKey || currentPeriod();
  const { start, end } = periodRange(key);
  const budgets = await db.query('SELECT * FROM budgets');
  const created = [];

  for (const budget of budgets) {
    const row = await db.queryOne(`
      SELECT COALESCE(SUM(ABS(amount)),0) AS total
      FROM transactions
      WHERE category=? AND date>=? AND date<=? AND is_transfer=0 AND amount<0`,
      [budget.category, start, end]);

    const spent = Number(row.total);
    const pct   = budget.monthly_limit > 0 ? (spent / budget.monthly_limit) * 100 : 0;

    if (pct >= 100) await createAlertIfNew('exceeded', budget.category, key, spent, budget.monthly_limit, created);
    else if (pct >= budget.alert_threshold_pct) await createAlertIfNew('warning', budget.category, key, spent, budget.monthly_limit, created);
  }
  return created;
}

async function createAlertIfNew(type, category, periodKey, spent, limit, created) {
  const existing = await db.queryOne(
    `SELECT id FROM alerts WHERE type=? AND category=? AND month_key=? AND dismissed_at IS NULL`,
    [type, category, periodKey]);
  if (existing) return;

  const pct = Math.round((spent / limit) * 100);
  const message = type === 'exceeded'
    ? `Budget exceeded for ${category}: spent ₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Math.round(limit).toLocaleString('en-IN')} (${pct}%)`
    : `Budget warning for ${category}: ${pct}% used (₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Math.round(limit).toLocaleString('en-IN')})`;

  const result = await db.run(
    `INSERT INTO alerts (type,category,message,month_key) VALUES (?,?,?,?) RETURNING id`,
    [type, category, message, periodKey]);

  created.push({ id: result.lastInsertRowid, type, category, message });
}

module.exports = { runAlertEngine, getCurrentMonthKey: currentPeriod };
