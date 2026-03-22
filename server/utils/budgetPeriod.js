/**
 * Budget period helpers — cycle runs 25th to 24th of next month.
 * Period key is the month the salary lands in (YYYY-MM).
 *
 * e.g. "2025-09" covers Sep 25, 2025 → Oct 24, 2025
 */

/** SQLite CASE expression that maps a date column to its budget period key */
function periodExpr(col) {
  return `CASE WHEN CAST(strftime('%d', ${col}) AS INTEGER) >= 25
    THEN strftime('%Y-%m', ${col})
    ELSE strftime('%Y-%m', date(${col}, '-1 month'))
  END`;
}

/** Date range for a period key */
function periodRange(key) {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-25`;
  // End = 24th of the next calendar month
  const endD = new Date(y, m, 24); // month is 0-indexed, m (1-indexed) = next month
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
