const { getDb } = require('../db');
const { periodExpr, periodRange, currentPeriod } = require('../utils/budgetPeriod');

const PERIOD = periodExpr('date');

function runAlertEngine(periodKey) {
  const db = getDb();
  const key = periodKey || currentPeriod();
  const { start, end } = periodRange(key);

  const budgets = db.prepare('SELECT * FROM budgets').all();
  const createdAlerts = [];

  for (const budget of budgets) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
         FROM transactions
         WHERE category = ?
           AND date >= ? AND date <= ?
           AND is_transfer = 0
           AND amount < 0`
      )
      .get(budget.category, start, end);

    const spent = row.total;
    const pct = budget.monthly_limit > 0 ? (spent / budget.monthly_limit) * 100 : 0;

    if (pct >= 100) {
      createAlertIfNew(db, 'exceeded', budget.category, key, spent, budget.monthly_limit, createdAlerts);
    } else if (pct >= budget.alert_threshold_pct) {
      createAlertIfNew(db, 'warning', budget.category, key, spent, budget.monthly_limit, createdAlerts);
    }
  }

  return createdAlerts;
}

function createAlertIfNew(db, type, category, periodKey, spent, limit, createdAlerts) {
  const existing = db
    .prepare(`SELECT id FROM alerts WHERE type=? AND category=? AND month_key=? AND dismissed_at IS NULL`)
    .get(type, category, periodKey);

  if (existing) return;

  const pct = Math.round((spent / limit) * 100);
  const message = type === 'exceeded'
    ? `Budget exceeded for ${category}: spent ₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Math.round(limit).toLocaleString('en-IN')} (${pct}%)`
    : `Budget warning for ${category}: ${pct}% used (₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Math.round(limit).toLocaleString('en-IN')})`;

  const result = db
    .prepare(`INSERT INTO alerts (type, category, message, month_key) VALUES (?, ?, ?, ?)`)
    .run(type, category, message, periodKey);

  createdAlerts.push({ id: result.lastInsertRowid, type, category, message });
}

module.exports = { runAlertEngine, getCurrentMonthKey: currentPeriod };
