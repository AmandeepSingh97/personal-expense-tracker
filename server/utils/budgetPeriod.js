/**
 * Budget period helpers — cycle runs 25th to 24th of next month.
 * Period key is the month the salary lands in (YYYY-MM).
 *
 * PostgreSQL date functions used (not SQLite strftime).
 */

/** PostgreSQL CASE expression that maps a date column to its budget period key */
function periodExpr(col) {
  return `CASE
    WHEN EXTRACT(DAY FROM ${col}::date)::int >= 25
      THEN TO_CHAR(${col}::date, 'YYYY-MM')
      ELSE TO_CHAR(${col}::date - INTERVAL '1 month', 'YYYY-MM')
  END`;
}

/** Date range for a period key */
function periodRange(key) {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-25`;
  const endD = new Date(y, m, 24);
  const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-24`;
  return { start, end };
}

/** Current period key based on today's date */
function currentPeriod() {
  const now = new Date();
  if (now.getDate() >= 25) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { periodExpr, periodRange, currentPeriod };
