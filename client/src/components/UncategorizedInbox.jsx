import React, { useState } from 'react';
import { Tag, ChevronRight, Check } from 'lucide-react';
import { updateTransaction } from '../api';
import { formatINR, formatDate, categoryMeta, CATEGORIES } from '../utils/format';
import toast from 'react-hot-toast';

// Most likely categories for quick-tagging (ordered by frequency)
const QUICK_CATS = [
  'Personal Expenses', 'Outing', 'Groceries', 'Petrol',
  'Holiday', 'SIPs', 'Send to Parents', 'Donation',
];

export default function UncategorizedInbox({ transactions, onCategorized }) {
  const [tagging, setTagging] = useState({}); // id → chosen category

  const handleTag = async (tx, category) => {
    setTagging(t => ({ ...t, [tx.id]: category }));
    try {
      await updateTransaction(tx.id, { category, sub_category: null, save_correction: true });
      toast.success(`Tagged as ${category}`);
      onCategorized(tx.id);
    } catch {
      toast.error('Failed to tag');
      setTagging(t => { const n = {...t}; delete n[tx.id]; return n; });
    }
  };

  if (!transactions?.length) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-amber-600 dark:text-amber-400" />
          <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
            {transactions.length} transactions need tagging
          </span>
        </div>
        <a href="/transactions?category=Uncategorized"
          className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 hover:underline">
          View all <ChevronRight size={12} />
        </a>
      </div>

      <div className="space-y-2">
        {transactions.slice(0, 5).map(tx => (
          <div key={tx.id} className={`bg-white dark:bg-gray-900 rounded-lg p-3 transition-opacity ${tagging[tx.id] ? 'opacity-40' : ''}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {tx.merchant_name || tx.description.slice(0, 55)}
                </div>
                <div className="text-xs text-gray-500">{formatDate(tx.date)}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {tx.amount < 0 ? '-' : '+'}{formatINR(tx.amount)}
              </span>
            </div>
            {/* Quick-tag chips */}
            {!tagging[tx.id] ? (
              <div className="flex flex-wrap gap-1">
                {QUICK_CATS.map(cat => {
                  const { emoji, color } = categoryMeta(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => handleTag(tx, cat)}
                      className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
                      style={{ borderColor: color + '60', color, backgroundColor: color + '15' }}
                    >
                      {emoji} {cat}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <Check size={12} /> Tagged as {tagging[tx.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
