import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatINR, categoryMeta } from '../utils/format';

function MiniBar({ pct, color }) {
  const c = Math.min(pct, 100);
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : color;
  return (
    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c}%`, backgroundColor: barColor }} />
    </div>
  );
}

export default function GroupCard({ groupKey, group, spent, budget, categories, utilMap }) {
  const [expanded, setExpanded] = useState(false);
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const status = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok';
  const isInvestment = groupKey === 'Invested';

  const statusColor = isInvestment
    ? 'text-emerald-600 dark:text-emerald-400'
    : status === 'exceeded' ? 'text-red-500' : status === 'warning' ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{group.emoji}</span>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white text-sm">{group.label}</div>
              <div className="text-xs text-gray-400">{group.hint}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-gray-900 dark:text-white">{formatINR(spent)}</div>
            {budget > 0 && (
              <div className={`text-xs ${statusColor}`}>
                {isInvestment
                  ? `of ${formatINR(budget)} goal`
                  : `${pct}% of ${formatINR(budget)}`}
              </div>
            )}
          </div>
        </div>
        {!isInvestment && budget > 0 && <MiniBar pct={pct} color={group.color} />}
        {isInvestment && (
          <div className="mt-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
        <div className="flex items-center justify-end mt-1.5">
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
          {categories
            .filter(c => c.spent > 0 || c.budget > 0)
            .sort((a, b) => b.spent - a.spent)
            .map(c => {
              const { emoji, color } = categoryMeta(c.name);
              const cpct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : null;
              return (
                <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-base w-5">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{formatINR(c.spent)}</span>
                    </div>
                    {c.budget > 0 && (
                      <div className="mt-0.5">
                        <MiniBar pct={cpct} color={color} />
                      </div>
                    )}
                    {c.budget === 0 && c.spent > 0 && (
                      <div className="text-xs text-gray-400">no budget set</div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
