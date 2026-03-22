import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatINR, categoryMeta } from '../utils/format';
import BudgetBar from './BudgetBar';

export default function CategoryCard({ category, totalSpent, totalPrev, budget, pct, count }) {
  const { emoji, color } = categoryMeta(category);
  const delta = totalPrev > 0 ? Math.round(((totalSpent - totalPrev) / totalPrev) * 100) : null;
  const isUp = delta > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <span className="font-semibold text-gray-900 dark:text-white text-sm">{category}</span>
        </div>
        {delta !== null && (
          <div className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-red-500' : 'text-green-500'}`}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(delta)}%
          </div>
        )}
      </div>

      <div className="mb-2">
        <span className="text-xl font-bold text-gray-900 dark:text-white">{formatINR(totalSpent)}</span>
        {totalPrev > 0 && (
          <span className="ml-2 text-xs text-gray-500">vs {formatINR(totalPrev)}</span>
        )}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{count} transactions</div>

      {budget && (
        <BudgetBar pct={pct} />
      )}
    </div>
  );
}
