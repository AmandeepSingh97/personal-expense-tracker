import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { getMonthlyTrend, getSummary, getTransactions, getAlerts, getBudgetUtilization, getRecurring, getAccountsHistory, getAccountsAnalytics } from '../api';
import {
  formatINR, formatDate, categoryMeta, currentMonth, monthLabel,
  CATEGORY_GROUPS, INVESTMENT_CATEGORIES,
} from '../utils/format';
import AlertBanner from '../components/AlertBanner';
import GroupCard from '../components/GroupCard';
import UncategorizedInbox from '../components/UncategorizedInbox';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatPill({ label, value, sub, positive, neutral }) {
  const valueColor = neutral ? 'text-gray-900 dark:text-white'
    : positive ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400';
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function CashFlowBar({ income, fixed, household, lifestyle, family, invested }) {
  const total = income || 1;
  const segments = [
    { label: 'Fixed', val: fixed,     color: '#6366f1' },
    { label: 'Household', val: household, color: '#f59e0b' },
    { label: 'Lifestyle', val: lifestyle, color: '#ec4899' },
    { label: 'Family',    val: family,    color: '#fb923c' },
    { label: 'Invested',  val: invested,  color: '#10b981' },
  ].filter(s => s.val > 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Where did the money go?</span>
        <span className="text-xs text-gray-500">Income: {formatINR(income)}</span>
      </div>
      {/* Stacked bar */}
      <div className="flex h-5 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.map(s => (
          <div
            key={s.label}
            style={{ width: `${(s.val / total) * 100}%`, backgroundColor: s.color, minWidth: s.val > 0 ? '2px' : '0' }}
            title={`${s.label}: ${formatINR(s.val)}`}
          />
        ))}
        {/* Unaccounted / remaining */}
        {income > 0 && (() => {
          const spent = segments.reduce((s, x) => s + x.val, 0);
          const rem = income - spent;
          if (rem > 0) return (
            <div style={{ flex: 1, backgroundColor: '#e5e7eb' }} title={`Remaining: ${formatINR(rem)}`} />
          );
        })()}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} {formatINR(s.val)}
          </div>
        ))}
        {income > 0 && (() => {
          const spent = segments.reduce((s, x) => s + x.val, 0);
          const rem = income - spent;
          if (rem > 0) return (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <div className="w-2 h-2 rounded-full bg-gray-200" />
              Remaining {formatINR(rem)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatINR(p.value)}</p>
      ))}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard({ onAlertChange }) {
  const [month] = useState(currentMonth());
  const [trend, setTrend]               = useState([]);
  const [summary, setSummary]           = useState([]);
  const [uncategorized, setUncategorized] = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [utilization, setUtilization]   = useState([]);
  const [recurring, setRecurring]       = useState([]);
  const [acctHistory, setAcctHistory]   = useState(null);
  const [acctAnalytics, setAcctAnalytics] = useState([]);
  const [loading, setLoading]           = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [trendData, summaryData, uncatData, alertData, utilData, recurData, histData, analyticsData] = await Promise.all([
        getMonthlyTrend({ months: 6 }),
        getSummary({ month }),
        getTransactions({ month, limit: 20, category: 'Uncategorized', include_transfers: 'false' }),
        getAlerts(),
        getBudgetUtilization({ month }),
        getRecurring(),
        getAccountsHistory({ months: 6 }),
        getAccountsAnalytics({ month }),
      ]);
      setTrend(trendData.map(r => ({ ...r, month: monthLabel(r.month) })));
      setSummary(summaryData);
      setUncategorized(uncatData.data || []);
      setAlerts(alertData);
      setUtilization(utilData);
      setRecurring(recurData);
      setAcctHistory(histData);
      setAcctAnalytics(analyticsData);
      if (onAlertChange) onAlertChange(alertData.length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    window.addEventListener('transactionAdded', load);
    return () => window.removeEventListener('transactionAdded', load);
  }, [month]);

  const handleDismiss = id => {
    const next = id === 'all' ? [] : alerts.filter(a => a.id !== id);
    setAlerts(next);
    if (onAlertChange) onAlertChange(next.length);
  };

  // ── Aggregate by category ─────────────────────────────────────────────────

  const spendMap = {}; // category → total spent this period
  const incomeTotal = summary.reduce((s, r) => s + (r.total_income || 0), 0);

  for (const r of summary) {
    if (!r.category || r.category === 'Transfers') continue;
    spendMap[r.category] = (spendMap[r.category] || 0) + (r.total_spent || 0);
  }

  const utilMap = Object.fromEntries(utilization.map(u => [u.category, u]));

  // ── Build group data ──────────────────────────────────────────────────────

  const groupData = Object.entries(CATEGORY_GROUPS).map(([key, group]) => {
    const cats = group.categories.map(name => ({
      name,
      spent: spendMap[name] || 0,
      budget: utilMap[name]?.monthly_limit || 0,
    }));
    const spent  = cats.reduce((s, c) => s + c.spent, 0);
    const budget = cats.reduce((s, c) => s + c.budget, 0);
    return { key, group, cats, spent, budget };
  });

  const expenseGroups   = groupData; // all groups are expense groups now
  const investmentGroup = null;      // investments have their own page

  const totalExpenses  = expenseGroups.reduce((s, g) => s + g.spent, 0);
  const totalInvested = Array.from(INVESTMENT_CATEGORIES)
    .reduce((s, cat) => s + (spendMap[cat] || 0), 0);
  const savingsRate    = incomeTotal > 0 ? Math.round((totalInvested / incomeTotal) * 100) : null;

  // Map group keys to CashFlowBar props
  const groupSpend = Object.fromEntries(expenseGroups.map(g => [g.key, g.spent]));

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500">{monthLabel(month)}</p>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-blue-500 transition-colors">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Alerts */}
      <AlertBanner alerts={alerts} onDismiss={handleDismiss} />

      {/* Summary pills */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatPill label="Income" value={formatINR(incomeTotal)} sub="this period" neutral />
        <StatPill label="Expenses" value={formatINR(totalExpenses)}
          sub={incomeTotal > 0 ? `${Math.round((totalExpenses / incomeTotal) * 100)}% of income` : null} />
        <StatPill label="Invested" value={formatINR(totalInvested)}
          sub={savingsRate !== null ? `${savingsRate}% savings rate` : null} positive />
        <StatPill
          label="Remaining"
          value={formatINR(Math.max(0, incomeTotal - totalExpenses - totalInvested))}
          sub="unallocated"
          positive={incomeTotal - totalExpenses - totalInvested >= 0}
        />
      </div>

      {/* Cash flow bar */}
      {incomeTotal > 0 && (
        <CashFlowBar
          income={incomeTotal}
          fixed={groupSpend.Fixed || 0}
          household={groupSpend.Household || 0}
          lifestyle={groupSpend.Lifestyle || 0}
          family={groupSpend.Family || 0}
          invested={totalInvested}
        />
      )}

      {/* Uncategorized inbox */}
      {uncategorized.length > 0 && (
        <UncategorizedInbox
          transactions={uncategorized}
          onCategorized={id => {
            setUncategorized(prev => prev.filter(t => t.id !== id));
            load();
          }}
        />
      )}

      {/* Spending trend */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">6-Period Spend Trend</h2>
        {trend.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={45} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="total_spent" name="Spent" stroke="#6366f1" fill="url(#grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Accounts section ─────────────────────────────────────────────── */}
      {acctHistory?.accounts?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Accounts
          </h2>

          {/* Balance trend — multi-line chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Balance Trend</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={acctHistory.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" tickFormatter={p => {
                  const [y, m] = p.split('-');
                  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
                }} tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={48} />
                <Tooltip formatter={(v, name) => [formatINR(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {acctHistory.accounts.map(a => (
                  <Line
                    key={a.name}
                    type="monotone"
                    dataKey={a.name}
                    stroke={a.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-account spend this period */}
          {acctAnalytics.some(a => a.expenses > 0 || a.income > 0) && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
                This Period — by Account
              </h3>
              <div className="space-y-3">
                {acctAnalytics.filter(a => a.expenses > 0 || a.income > 0 || a.invested > 0).map(a => {
                  const total = Math.max(a.expenses + a.invested, a.income, 1);
                  return (
                    <div key={a.account_name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{a.account_name}</span>
                          {a.tags?.slice(0,2).map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">{t}</span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 flex gap-3">
                          {a.income > 0 && <span className="text-green-500">+{formatINR(a.income)}</span>}
                          {a.expenses > 0 && <span className="text-red-500">-{formatINR(a.expenses)}</span>}
                          {a.invested > 0 && <span className="text-teal-500">📈{formatINR(a.invested)}</span>}
                        </div>
                      </div>
                      {/* Stacked bar: income | expenses + invested */}
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex gap-px">
                        {a.income > 0 && <div className="h-full bg-green-400 rounded-l-full" style={{ width: `${(a.income/total)*100}%` }} />}
                        {a.expenses > 0 && <div className="h-full bg-red-400" style={{ width: `${(a.expenses/total)*100}%` }} />}
                        {a.invested > 0 && <div className="h-full bg-teal-400 rounded-r-full" style={{ width: `${(a.invested/total)*100}%` }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expense groups */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Expenses by Group</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {expenseGroups.filter(g => g.spent > 0 || g.budget > 0).map(({ key, group, cats, spent, budget }) => (
            <GroupCard
              key={key}
              groupKey={key}
              group={group}
              spent={spent}
              budget={budget}
              categories={cats}
              utilMap={utilMap}
            />
          ))}
        </div>
      </div>

      {/* Investments — no budget, just a summary pill linking to the Investments page */}
      {totalInvested > 0 && (
        <a href="/investments"
          className="flex items-center justify-between bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors group">
          <div className="flex items-center gap-3">
            <span className="text-xl">📈</span>
            <div>
              <div className="font-semibold text-teal-800 dark:text-teal-300 text-sm">Invested this period</div>
              <div className="text-xs text-teal-600 dark:text-teal-500">SIPs, Emergency Cash, Home Savings — view cumulative →</div>
            </div>
          </div>
          <div className="text-xl font-bold text-teal-700 dark:text-teal-300 group-hover:scale-105 transition-transform">
            {formatINR(totalInvested)}
          </div>
        </a>
      )}

      {/* Recent transactions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Recent Transactions</h2>
        {recurring.length === 0 && summary.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No transactions yet. Import your statement to get started.
          </p>
        ) : (
          <RecentList month={month} />
        )}
      </div>

    </div>
  );
}

function RecentList({ month }) {
  const [txs, setTxs] = useState([]);
  useEffect(() => {
    getTransactions({ month, limit: 10, include_transfers: 'false' })
      .then(d => setTxs(d.data || []));
  }, [month]);

  return (
    <div className="space-y-1">
      {txs.map(tx => {
        const { emoji, color } = categoryMeta(tx.category);
        return (
          <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
            <span className="text-lg w-6 text-center">{emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {tx.merchant_name || tx.description}
              </div>
              <div className="text-xs text-gray-400">{formatDate(tx.date)} · {tx.category || 'Uncategorized'}</div>
            </div>
            <span className={`text-sm font-semibold shrink-0 ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
              {tx.amount < 0 ? '-' : '+'}{formatINR(tx.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
