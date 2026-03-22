import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getSummary, getInsights } from '../api';
import { formatINR, categoryMeta, currentMonth, monthLabel } from '../utils/format';

function prevMonthKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlyReview() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState([]);
  const [prevSummary, setPrevSummary] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const prev = prevMonthKey(month);

  useEffect(() => {
    Promise.all([getSummary({ month }), getSummary({ month: prev })]).then(([cur, prv]) => {
      setSummary(cur);
      setPrevSummary(prv);
    });
    setInsights(null);
  }, [month]);

  const navigate = (dir) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const loadInsights = async () => {
    setLoadingInsights(true);
    try {
      const data = await getInsights(month);
      setInsights(data);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Build comparison data
  const prevMap = Object.fromEntries(
    prevSummary.reduce((acc, r) => {
      if (!r.category) return acc;
      const existing = acc.find(([k]) => k === r.category);
      if (existing) existing[1] += r.total_spent;
      else acc.push([r.category, r.total_spent]);
      return acc;
    }, [])
  );

  const byCategory = summary.reduce((acc, r) => {
    if (!r.category || r.category === 'Income' || r.category === 'Transfers') return acc;
    if (!acc[r.category]) acc[r.category] = 0;
    acc[r.category] += r.total_spent;
    return acc;
  }, {});

  const chartData = Object.entries(byCategory)
    .map(([cat, total]) => ({
      category: cat,
      [monthLabel(month)]: Math.round(total),
      [monthLabel(prev)]: Math.round(prevMap[cat] || 0),
    }))
    .sort((a, b) => b[monthLabel(month)] - a[monthLabel(month)]);

  const totalSpent = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const prevTotal = Object.values(prevMap).reduce((s, v) => s + v, 0);
  const delta = prevTotal > 0 ? Math.round(((totalSpent - prevTotal) / prevTotal) * 100) : null;

  return (
    <div className="p-6">
      {/* Month navigator */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monthly Review</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
            <ChevronLeft size={16} />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white min-w-[120px] text-center">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => navigate(1)}
            disabled={month >= currentMonth()}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatINR(totalSpent)}</div>
          <div className="text-sm text-gray-500">{monthLabel(month)}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-400">{formatINR(prevTotal)}</div>
          <div className="text-sm text-gray-500">{monthLabel(prev)}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${delta > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {delta !== null ? `${delta > 0 ? '+' : ''}${delta}%` : '—'}
          </div>
          <div className="text-sm text-gray-500">vs last month</div>
        </div>
      </div>

      {/* Comparison chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Category Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatINR(v)} />
              <Legend />
              <Bar dataKey={monthLabel(month)} fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey={monthLabel(prev)} fill="#e5e7eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Category</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{monthLabel(month)}</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">{monthLabel(prev)}</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {Object.entries(byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => {
                const { emoji, color } = categoryMeta(cat);
                const p = prevMap[cat] || 0;
                const d = p > 0 ? Math.round(((total - p) / p) * 100) : null;
                return (
                  <tr key={cat}>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <span>{emoji}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{cat}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      {formatINR(total)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatINR(p)}</td>
                    <td className="px-4 py-3 text-right">
                      {d !== null && (
                        <span className={`text-xs font-medium ${d > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {d > 0 ? '+' : ''}{d}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* AI Insights */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-yellow-500" /> AI Insights
          </h2>
          {!insights && (
            <button
              onClick={loadInsights}
              disabled={loadingInsights}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              {loadingInsights ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate Insights
            </button>
          )}
        </div>

        {insights ? (
          <ul className="space-y-2">
            {insights.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-yellow-500 mt-0.5 flex-shrink-0">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        ) : (
          !loadingInsights && (
            <p className="text-sm text-gray-500">
              Click "Generate Insights" for AI-powered analysis of your {monthLabel(month)} spending.
            </p>
          )
        )}

        {loadingInsights && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Analyzing your spending patterns...
          </div>
        )}
      </div>
    </div>
  );
}
