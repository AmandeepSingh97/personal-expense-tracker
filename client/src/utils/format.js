export function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Returns the current budget period key (YYYY-MM).
 *  Budget cycle runs 25th → 24th, so "2025-09" = Sep 25 – Oct 24. */
export function currentMonth() {
  const now = new Date();
  if (now.getDate() >= 25) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/** Human-readable label for a budget period, e.g. "25 Sep – 24 Oct '25" */
export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 25);
  const end   = new Date(y, m, 24);        // m (1-indexed) is next month (0-indexed)
  const fmt = (d, opts) => d.toLocaleDateString('en-IN', opts);
  return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short', year: '2-digit' })}`;
}

export const CATEGORY_META = {
  // ── Budget categories (your exact list) ─────────────────────────────────
  'Rent':                  { emoji: '🏠', color: '#6366f1' },
  'Maid':                  { emoji: '🧹', color: '#8b5cf6' },
  'Cook':                  { emoji: '👨‍🍳', color: '#f97316' },
  'SIPs':                  { emoji: '📈', color: '#14b8a6' },
  'Groceries':             { emoji: '🛒', color: '#f59e0b' },
  'Electricity':           { emoji: '⚡', color: '#eab308' },
  'WiFi':                  { emoji: '📶', color: '#38bdf8' },
  'Outing':                { emoji: '🍽️', color: '#ec4899' },
  'Cylinder':              { emoji: '🔥', color: '#ef4444' },
  'Car Loan':              { emoji: '🚗', color: '#10b981' },
  'Petrol':                { emoji: '⛽', color: '#06b6d4' },
  'PPF':                   { emoji: '🏦', color: '#3b82f6' },
  'Insurance':             { emoji: '🛡️', color: '#84cc16' },
  'Emergency Cash':        { emoji: '🆘', color: '#dc2626' },
  'Holiday':               { emoji: '✈️', color: '#0ea5e9' },
  'Home Savings':          { emoji: '🏡', color: '#22c55e' },
  'Personal Expenses':     { emoji: '👤', color: '#a855f7' },
  'LIC':                   { emoji: '📋', color: '#64748b' },
  'Send to Parents':       { emoji: '👨‍👩‍👧', color: '#fb923c' },
  'Preet Badminton':       { emoji: '🏸', color: '#38bdf8' },
  'Preet Beauty Products': { emoji: '💄', color: '#e879f9' },
  'Donation':              { emoji: '🙏', color: '#f59e0b' },
  // ── System categories ────────────────────────────────────────────────────
  'Salary':                { emoji: '💼', color: '#16a34a' },
  'Income':                { emoji: '💰', color: '#22c55e' },
  'Transfers':             { emoji: '🔁', color: '#94a3b8' },
  'Uncategorized':         { emoji: '❓', color: '#9ca3af' },
};

export function categoryMeta(cat) {
  return CATEGORY_META[cat] || { emoji: '📌', color: '#9ca3af' };
}

export const CATEGORIES = Object.keys(CATEGORY_META);

// Categories that are investments/savings
export const INVESTMENT_CATEGORIES = new Set(['SIPs', 'PPF', 'LIC', 'Home Savings', 'Emergency Cash']);

/**
 * Five spending groups — the story your money tells each month.
 *
 * Fixed      — committed, non-negotiable monthly obligations
 * Household  — necessary running costs of the home
 * Lifestyle  — discretionary, quality-of-life spending
 * Family     — support sent to family
 * Invested   — wealth-building (shown separately, going over is good)
 */
export const CATEGORY_GROUPS = {
  Fixed: {
    label: 'Fixed Costs',
    emoji: '📌',
    color: '#6366f1',
    hint: 'Committed monthly obligations',
    categories: ['Rent', 'Car Loan', 'Insurance', 'WiFi', 'Electricity', 'LIC', 'PPF'],
  },
  Household: {
    label: 'Household',
    emoji: '🏡',
    color: '#f59e0b',
    hint: 'Keeping the home running',
    categories: ['Groceries', 'Petrol', 'Cylinder', 'Maid', 'Cook'],
  },
  Lifestyle: {
    label: 'Lifestyle',
    emoji: '🎯',
    color: '#ec4899',
    hint: 'Discretionary & quality of life',
    categories: ['Outing', 'Personal Expenses', 'Holiday', 'Preet Badminton', 'Preet Beauty Products', 'Donation'],
  },
  Family: {
    label: 'Family',
    emoji: '👨‍👩‍👧',
    color: '#fb923c',
    hint: 'Support sent to family',
    categories: ['Send to Parents'],
  },
  // Note: Investment categories (SIPs, PPF, LIC, Emergency Cash, Home Savings) are NOT
  // in any budget group — they have no monthly limit. They are tracked separately
  // on the Investments page as cumulative totals.
};

/** Returns which group a category belongs to (for display grouping) */
export function categoryGroup(cat) {
  for (const [key, g] of Object.entries(CATEGORY_GROUPS)) {
    if (g.categories.includes(cat)) return key;
  }
  return null;
}
