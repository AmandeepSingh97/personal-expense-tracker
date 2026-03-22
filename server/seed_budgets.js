/**
 * Seed budgets + categorize family allocation transfers as EXPENSES
 * (not transfers — money is spent the moment it leaves the account)
 *
 * Run: node server/seed_budgets.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('./db');
const { splitAllJointExpenses } = require('./services/jointExpenseSplitter');

const db = getDb();

// ─── 1. Budgets (your exact categories) ──────────────────────────────────────
const budgets = [
  { category: 'Rent',                  monthly_limit: 45000 },
  { category: 'Maid',                  monthly_limit: 0     },  // currently paused
  { category: 'Cook',                  monthly_limit: 0     },  // currently paused
  // SIPs / PPF / LIC / Emergency Cash / Home Savings are INVESTMENTS — no budget limits.
  // They are tracked separately in the Investments page (cumulative view).
  { category: 'Groceries',             monthly_limit: 10000 },
  { category: 'Electricity',           monthly_limit: 1000  },
  { category: 'WiFi',                  monthly_limit: 3000  },  // Airtel broadband ~₹2,806/mo
  { category: 'Outing',                monthly_limit: 8000  },
  { category: 'Cylinder',              monthly_limit: 500   },
  { category: 'Car Loan',              monthly_limit: 46000 },
  { category: 'Petrol',                monthly_limit: 5000  },
  { category: 'Insurance',             monthly_limit: 6000  },
  { category: 'Emergency Cash',        monthly_limit: 0     },  // investment — tracked separately
  { category: 'Holiday',               monthly_limit: 10000 },
  { category: 'Home Savings',          monthly_limit: 0     },  // investment — tracked separately
  { category: 'Personal Expenses',     monthly_limit: 20000 },
  { category: 'Send to Parents',       monthly_limit: 20000 },
  { category: 'Preet Badminton',       monthly_limit: 3000  },
  { category: 'Preet Beauty Products', monthly_limit: 2000  },
  { category: 'Donation',              monthly_limit: 1100  },  // Gurudwara ₹1,100/month
];

const upsert = db.prepare(`
  INSERT INTO budgets (category, monthly_limit, alert_threshold_pct, updated_at)
  VALUES (?, ?, 80, datetime('now'))
  ON CONFLICT(category) DO UPDATE SET
    monthly_limit = excluded.monthly_limit,
    alert_threshold_pct = 80,
    updated_at = excluded.updated_at
`);

console.log('── Budgets ──────────────────────────────────────');
let budgetCount = 0;
for (const b of budgets) {
  upsert.run(b.category, b.monthly_limit);
  budgetCount++;
  console.log(`  ${b.category.padEnd(15)} ₹${b.monthly_limit.toLocaleString('en-IN').padStart(8)}`);
}
console.log(`  ✓ ${budgetCount} budgets set\n`);

// ─── 2. Categorize single-purpose transfers as expenses ───────────────────────
// These go to ONE account for ONE purpose, so one category maps cleanly.

const SINGLE_RULES = [
  // Holiday fund → Aman's Indusind
  { pattern: '%Holiday%',        category: 'Holiday',          sub: null, recurring: 1 },
  { pattern: '%VacationJan%',    category: 'Holiday',          sub: null, recurring: 0 },
  { pattern: '%TravelSep%',      category: 'Holiday',          sub: null, recurring: 0 },
  { pattern: '%Travelsep25%',    category: 'Holiday',          sub: null, recurring: 0 },
  { pattern: '%PapaVacation%',   category: 'Holiday',          sub: null, recurring: 0 },

  // Car Loan EMI → Preet's HDFC
  { pattern: '%CarEmi%',         category: 'Car Loan',         sub: null, recurring: 1 },
  { pattern: '%CarFeb%',         category: 'Car Loan',         sub: null, recurring: 1 },
  { pattern: '%OctCarandSip%',   category: 'Car Loan',         sub: null, recurring: 0 },

  // Emergency Cash → Canara
  { pattern: '%EmgSep%',         category: 'Emergency Cash',   sub: null, recurring: 0 },
  { pattern: '%EmgHome%',        category: 'Emergency Cash',   sub: null, recurring: 1 },
  { pattern: '%EmergencyOct%',   category: 'Emergency Cash',   sub: null, recurring: 1 },
  { pattern: '%EmergencyNov%',   category: 'Emergency Cash',   sub: null, recurring: 1 },
  { pattern: '%EmergencyJan%',   category: 'Emergency Cash',   sub: null, recurring: 1 },
  { pattern: '%Emghomefeb%',     category: 'Emergency Cash',   sub: null, recurring: 1 },

  // Insurance → Kotak
  { pattern: '%InsuranceOct%',   category: 'Insurance',        sub: null, recurring: 1 },
  { pattern: '%InsuranceNov%',   category: 'Insurance',        sub: null, recurring: 1 },
  { pattern: '%InsuranceDec%',   category: 'Insurance',        sub: null, recurring: 1 },
  { pattern: '%InsuranceJan%',   category: 'Insurance',        sub: null, recurring: 1 },
  { pattern: '%InsuranceFeb%',   category: 'Insurance',        sub: null, recurring: 1 },

  // Preet Personal → BOB (covers Badminton + Beauty + Personal)
  // This gets further split in seed step 3 below
  { pattern: '%PreetPersonal%',  category: 'Personal Expenses',sub: null, recurring: 1 },
  { pattern: '%Preetpers%',      category: 'Personal Expenses',sub: null, recurring: 1 },

  // Preet SIP → HDFC
  { pattern: '%SipPsnl%',        category: 'SIPs',             sub: null, recurring: 1, investment: 1 },
  { pattern: '%PersSip%',        category: 'SIPs',             sub: null, recurring: 1, investment: 1 },
  { pattern: '%PreetSIP%',       category: 'SIPs',             sub: null, recurring: 1, investment: 1 },
  { pattern: '%PreetSip%',       category: 'SIPs',             sub: null, recurring: 1, investment: 1 },

  // Aman SIP + Personal → Kotak
  { pattern: '%LGIPO%',          category: 'SIPs',             sub: null, recurring: 1, investment: 1 },
  { pattern: '%Investfeb%',      category: 'Home Savings',     sub: null, recurring: 0, investment: 1 },

  // Emergency Cash → Canara (mark as investment/savings)
  // already handled above but add investment flag
  { pattern: '%EmgSep%',         category: 'Emergency Cash',   sub: null, recurring: 0, investment: 1 },

  // Parents — GURMEET KA is the UPI contact for parents
  { pattern: '%ParentsTic%',     category: 'Send to Parents',  sub: null, recurring: 0 },
  { pattern: '%GURMEET KA%',     category: 'Send to Parents',  sub: null, recurring: 1 },
  { pattern: '%6394604734%',     category: 'Send to Parents',  sub: null, recurring: 1 },
];

const markExpense = db.prepare(`
  UPDATE transactions
  SET is_transfer = 0,
      is_investment = ?,
      category = ?,
      sub_category = ?,
      is_recurring = ?,
      manually_corrected = 1
  WHERE description LIKE ?
    AND manually_corrected = 0
`);

// Also un-mark previously marked ones (in case script is re-run)
db.prepare(`UPDATE transactions SET manually_corrected = 0 WHERE is_transfer = 1 AND category = 'Transfers'`).run();

console.log('── Single-purpose transfer categorization ───────');
let singleCount = 0;
for (const r of SINGLE_RULES) {
  const res = markExpense.run(r.investment || 0, r.category, r.sub, r.recurring, r.pattern);
  if (res.changes > 0) {
    console.log(`  ${res.changes} txn(s) → ${r.category}/${r.sub}: ${r.pattern}`);
    singleCount += res.changes;
  }
}
console.log(`  ✓ ${singleCount} single-purpose transfers categorized\n`);

// ─── 2b. One-off corrections ──────────────────────────────────────────────────
// ₹22,000 credit from Harpreet K = car savings returned — mark as Transfer (income, not expense)
db.prepare(`
  UPDATE transactions SET is_transfer=1, category='Transfers', manually_corrected=1
  WHERE description LIKE '%harpreetkaur11%'
    AND amount > 0
    AND manually_corrected = 0
`).run();

// GURMEET KA = send to parents
db.prepare(`
  UPDATE transactions SET category='Send to Parents', is_investment=0, manually_corrected=1
  WHERE (description LIKE '%GURMEET KA%' OR description LIKE '%6394604734%')
    AND amount < 0
    AND manually_corrected = 0
`).run();

// ─── 3. Re-categorize all auto-categorized transactions with new rules ────────
const { categorizeAllRules } = require('./services/ruleBasedCategorizer');
const uncorrected = db.prepare(
  `SELECT id, description, amount FROM transactions WHERE manually_corrected = 0`
).all();

const updateCat = db.prepare(
  `UPDATE transactions SET category=?, sub_category=?, merchant_name=?, is_recurring=?, is_transfer=?, is_investment=?, manually_corrected=0 WHERE id=?`
);

const results = categorizeAllRules(uncorrected);
let recatCount = 0;
for (const r of results) {
  updateCat.run(r.category, r.sub_category, r.merchant_name, r.is_recurring ? 1 : 0, r.is_transfer ? 1 : 0, r.is_investment ? 1 : 0, r.id);
  recatCount++;
}
console.log(`── Recategorization ─────────────────────────────`);
console.log(`  ✓ ${recatCount} transactions re-categorized with new rules\n`);

// ─── 4. Split joint expense transfer into per-category sub-transactions ──────
console.log('── Joint expense splitting ───────────────────────');
const splitCount = splitAllJointExpenses(db);
console.log(`  ✓ ${splitCount} sub-transactions created\n`);

// ─── 5. Summary ───────────────────────────────────────────────────────────────
const totals = db.prepare(`
  SELECT category, ROUND(SUM(ABS(amount)),0) as spent, COUNT(*) as txns
  FROM transactions
  WHERE is_transfer = 0 AND amount < 0
  GROUP BY category ORDER BY spent DESC
`).all();

console.log('── Total spend by category (all months) ─────────');
let grand = 0;
for (const r of totals) {
  console.log(`  ${(r.category||'?').padEnd(15)} ₹${r.spent.toLocaleString('en-IN').padStart(10)}  (${r.txns} txns)`);
  grand += r.spent;
}
console.log(`  ${'TOTAL'.padEnd(15)} ₹${grand.toLocaleString('en-IN').padStart(10)}`);
const xfr = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE is_transfer=1`).get().c;
console.log(`\n  Excluded (is_transfer): ${xfr} transactions`);
