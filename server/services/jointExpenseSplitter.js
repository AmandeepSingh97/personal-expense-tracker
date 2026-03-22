/**
 * Splits the monthly joint-expense transfer (Preet's Axis account) into
 * individual budget-category sub-transactions.
 *
 * Two variants based on transfer amount:
 *
 * ₹76,000  (Sep–Dec 2025)  — included Maid + Cook
 *   Housing      ₹46,500  (Rent 45k + Electricity 1k + Cylinder 500)
 *   Food         ₹10,000  (Groceries)
 *   Housing       ₹3,000  (Maid)          → Housing > Maintenance
 *   Food          ₹3,500  (Cook)          → Food > Cook
 *   Transport     ₹5,000  (Petrol)
 *   Entertainment ₹8,000  (Outing)
 *   Total        ₹76,000
 *
 * ₹69,500  (Jan 2026 onwards)  — Maid + Cook stopped
 *   Housing      ₹46,500
 *   Food         ₹10,000
 *   Transport     ₹5,000
 *   Entertainment ₹8,000
 *   Total        ₹69,500
 */

const crypto = require('crypto');

// Base items always present (Jan 2026 onwards — no Maid/Cook)
const BASE_SPLIT = [
  { category: 'Rent',        sub_category: null,        amount: 45000 },
  { category: 'Electricity', sub_category: null,        amount: 1000  },
  { category: 'Cylinder',    sub_category: null,        amount: 500   },
  { category: 'Groceries',   sub_category: null,        amount: 10000 },
  { category: 'Petrol',      sub_category: null,        amount: 5000  },
  { category: 'Outing',      sub_category: null,        amount: 8000  },
];

// Additional items when Maid + Cook were active (Sep–Dec 2025, total ₹76,000)
const MAID_COOK_SPLIT = [
  { category: 'Maid',        sub_category: null,        amount: 3000  },
  { category: 'Cook',        sub_category: null,        amount: 3500  },
];

const BASE_TOTAL      = BASE_SPLIT.reduce((s, r) => s + r.amount, 0);       // 69,500
const FULL_TOTAL      = BASE_TOTAL + MAID_COOK_SPLIT.reduce((s, r) => s + r.amount, 0); // 76,000

/** Pick the right split config based on the actual transfer amount */
function getSplitConfig(totalAmt) {
  // Allow ±200 tolerance for rounding / minor variation
  if (Math.abs(totalAmt - FULL_TOTAL) <= 200) return [...BASE_SPLIT, ...MAID_COOK_SPLIT];
  if (Math.abs(totalAmt - BASE_TOTAL) <= 200) return BASE_SPLIT;
  // Unknown amount — use base + put remainder in Housing
  return null;
}

// Narration patterns that identify the joint expense transfer
const JOINT_PATTERNS = [
  /Jointexp/i,
  /MonthExp/i,
  /ExpenseOct/i, /ExpenseDec/i, /ExpenseJan/i, /ExpenseSep/i, /ExpenseFeb/i,
  /Rentplusexp/i,
];

function isJointExpense(description) {
  return JOINT_PATTERNS.some(p => p.test(description));
}

const prepareInsert = (db) => db.prepare(`
  INSERT OR IGNORE INTO transactions
    (date, description, amount, account_name, category, sub_category,
     is_recurring, is_transfer, manually_corrected, import_batch_id, dedup_hash)
  VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)
`);

function splitJointExpense(db, tx) {
  const totalAmt = Math.abs(tx.amount);
  const config = getSplitConfig(totalAmt);
  const stmt = prepareInsert(db);

  db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);

  let created = 0;
  const splits = config || BASE_SPLIT;

  for (const split of splits) {
    const amt  = -(split.amount);
    const desc = `[${split.sub_category}] ${tx.description.slice(0, 55)}`;
    const hash = crypto.createHash('sha256').update(`${tx.date}|${desc}|${amt}`).digest('hex');
    stmt.run(tx.date, desc, amt, tx.account_name, split.category, split.sub_category, tx.import_batch_id, hash);
    created++;
  }

  // If amount doesn't match either known config, dump remainder into Housing
  if (!config) {
    const known = splits.reduce((s, r) => s + r.amount, 0);
    if (totalAmt > known + 1) {
      const remainder = Math.round((totalAmt - known) * 100) / 100;
      const desc = `[Rent/Other] ${tx.description.slice(0, 55)}`;
      const hash = crypto.createHash('sha256').update(`${tx.date}|${desc}|${-remainder}`).digest('hex');
      stmt.run(tx.date, desc, -remainder, tx.account_name, 'Housing', 'Maintenance', tx.import_batch_id, hash);
      created++;
    }
  }

  return created;
}

function splitAllJointExpenses(db) {
  const rows = db.prepare(
    `SELECT * FROM transactions WHERE amount < 0 AND manually_corrected = 0`
  ).all();

  let total = 0;
  for (const tx of rows) {
    if (isJointExpense(tx.description)) {
      total += splitJointExpense(db, tx);
    }
  }
  return total;
}

module.exports = {
  isJointExpense, splitJointExpense, splitAllJointExpenses,
  BASE_SPLIT, MAID_COOK_SPLIT, BASE_TOTAL, FULL_TOTAL,
};
