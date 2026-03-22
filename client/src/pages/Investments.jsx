import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, ArrowDownLeft, PiggyBank, RefreshCw } from 'lucide-react';
import { formatINR, formatDate, monthLabel, categoryMeta } from '../utils/format';
import axios from 'axios';

const getInvestments = () => axios.get('/api/investments/summary').then(r => r.data);

const INVEST_COLORS = {
  'SIPs':           '#14b8a6',
  'Emergency Cash': '#dc2626',
  'Home Savings':   '#22c55e',
  'PPF':            '#3b82f6',
  'LIC':            '#64748b',
};

const CHART_COLORS = ['#14b8a6','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444'];

function StatBox({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-teal-600">{formatINR(payload[0].value)} contributed</p>
    </div>
  );
};

export default function Investments() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await getInvestments()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <RefreshCw size={24} className="animate-spin text-teal-500" />
    </div>
  );

  if (!data) return null;

  const { contributed, returns, monthly, totalContributed, totalReturns } = data;
  const chartData = monthly.map(m => ({ month: monthLabel(m.month), contributed: m.contributed }));

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Investments</h1>
          <p className="text-sm text-gray-500">Cumulative view — money building wealth over time</p>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-teal-500">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatBox label="Total Contributed" value={formatINR(totalContributed)}
          sub="across all investment types" icon={PiggyBank} color="bg-teal-500" />
        <StatBox label="Returns Received" value={formatINR(totalReturns)}
          sub="dividends, NPS, redemptions" icon={TrendingUp} color="bg-emerald-500" />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-xs text-gray-500 mb-1">Net Invested</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatINR(totalContributed - totalReturns)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">contributed minus returns received</div>
          <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            Current market value may differ. This shows cost basis only.
          </div>
        </div>
      </div>

      {/* Monthly contribution chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Monthly Contributions</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={45} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="contributed" radius={[4,4,0,0]}>
                {chartData.map((_, i) => <Cell key={i} fill="#14b8a6" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By investment type */}
      {contributed.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">By Investment Type</h2>
          <div className="space-y-3">
            {contributed.map((c, i) => {
              const { emoji } = categoryMeta(c.category);
              const color = INVEST_COLORS[c.category] || CHART_COLORS[i % CHART_COLORS.length];
              const pct = totalContributed > 0 ? Math.round((c.total / totalContributed) * 100) : 0;
              return (
                <div key={c.category}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span>{emoji}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.category}</span>
                      <span className="text-xs text-gray-400">{c.count} contributions</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatINR(c.total)}</span>
                      <span className="text-xs text-gray-400 ml-2">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Returns & redemptions */}
      {returns.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 flex items-center gap-2">
            <ArrowDownLeft size={15} className="text-emerald-500" />
            Returns & Redemptions
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Money that came back from investments — dividends, NPS withdrawals, fund redemptions
          </p>
          <div className="space-y-2">
            {returns.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                    {r.description?.slice(0, 60)}
                  </div>
                  <div className="text-xs text-gray-400">{formatDate(r.date)} · {r.category}</div>
                </div>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 ml-4">
                  +{formatINR(Math.abs(r.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {contributed.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <PiggyBank size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No investment transactions yet</p>
          <p className="text-sm mt-1">Import your bank statement to see your SIPs, PPF, and savings here.</p>
        </div>
      )}
    </div>
  );
}
