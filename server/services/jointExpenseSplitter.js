const crypto = require('crypto');
const db = require('../db');

const BASE_SPLIT = [
  { category: 'Rent',        sub_category: null, amount: 45000 },
  { category: 'Electricity', sub_category: null, amount: 1000  },
  { category: 'Cylinder',    sub_category: null, amount: 500   },
  { category: 'Groceries',   sub_category: null, amount: 10000 },
  { category: 'Petrol',      sub_category: null, amount: 5000  },
  { category: 'Outing',      sub_category: null, amount: 8000  },
];

const MAID_COOK_SPLIT = [
  { category: 'Maid', sub_category: null, amount: 3000 },
  { category: 'Cook', sub_category: null, amount: 3500 },
];

const BASE_TOTAL = BASE_SPLIT.reduce((s, r) => s + r.amount, 0);       // 69,500
const FULL_TOTAL = BASE_TOTAL + MAID_COOK_SPLIT.reduce((s,r) => s + r.amount, 0); // 76,000

function getSplitConfig(totalAmt) {
  if (Math.abs(totalAmt - FULL_TOTAL) <= 200) return [...BASE_SPLIT, ...MAID_COOK_SPLIT];
  if (Math.abs(totalAmt - BASE_TOTAL) <= 200)  return BASE_SPLIT;
  return null;
}

const JOINT_PATTERNS = [/Jointexp/i, /MonthExp/i, /ExpenseOct/i, /ExpenseDec/i, /ExpenseJan/i, /ExpenseSep/i, /ExpenseFeb/i, /Rentplusexp/i];

function isJointExpense(description) {
  return JOINT_PATTERNS.some(p => p.test(description));
}

async function splitJointExpense(tx) {
  const totalAmt = Math.abs(tx.amount);
  const config = getSplitConfig(totalAmt) || BASE_SPLIT;

  await db.run('DELETE FROM transactions WHERE id=?', [tx.id]);

  let created = 0;
  for (const split of config) {
    const amt  = -(split.amount);
    const desc = `[${split.category}] ${tx.description.slice(0, 55)}`;
    const hash = crypto.createHash('sha256').update(`${tx.date}|${desc}|${amt}`).digest('hex');
    await db.run(`
      INSERT INTO transactions (date,description,amount,account_name,category,sub_category,is_recurring,is_transfer,manually_corrected,import_batch_id,dedup_hash)
      VALUES (?,?,?,?,?,?,1,0,1,?,?) ON CONFLICT(dedup_hash) DO NOTHING`,
      [tx.date, desc, amt, tx.account_name, split.category, split.sub_category, tx.import_batch_id, hash]);
    created++;
  }

  if (!getSplitConfig(totalAmt)) {
    const known = config.reduce((s,r) => s + r.amount, 0);
    if (totalAmt > known + 1) {
      const remainder = Math.round((totalAmt - known) * 100) / 100;
      const desc = `[Housing] ${tx.description.slice(0, 55)}`;
      const hash = crypto.createHash('sha256').update(`${tx.date}|${desc}|${-remainder}`).digest('hex');
      await db.run(`
        INSERT INTO transactions (date,description,amount,account_name,category,sub_category,is_recurring,is_transfer,manually_corrected,import_batch_id,dedup_hash)
        VALUES (?,?,?,?,'Housing',null,1,0,1,?,?) ON CONFLICT(dedup_hash) DO NOTHING`,
        [tx.date, desc, -remainder, tx.account_name, tx.import_batch_id, hash]);
      created++;
    }
  }
  return created;
}

async function splitAllJointExpenses() {
  const rows = await db.query('SELECT * FROM transactions WHERE amount<0 AND manually_corrected=0');
  let total = 0;
  for (const tx of rows) {
    if (isJointExpense(tx.description)) total += await splitJointExpense(tx);
  }
  return total;
}

module.exports = { isJointExpense, splitJointExpense, splitAllJointExpenses, BASE_SPLIT, MAID_COOK_SPLIT, BASE_TOTAL, FULL_TOTAL };
