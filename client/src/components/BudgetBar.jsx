import React from 'react';

export default function BudgetBar({ pct, showLabel = true }) {
  const clamped = Math.min(pct, 100);
  const color =
    pct >= 100
      ? 'bg-red-500'
      : pct >= 80
      ? 'bg-yellow-400'
      : 'bg-green-500';

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          <span>{pct}% used</span>
          {pct >= 100 && <span className="text-red-500 font-medium">Exceeded!</span>}
          {pct >= 80 && pct < 100 && <span className="text-yellow-500 font-medium">Near limit</span>}
        </div>
      )}
    </div>
  );
}
