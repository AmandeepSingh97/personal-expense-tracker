import React from 'react';
import { formatINR, formatDate, categoryMeta } from '../utils/format';

export default function TransactionRow({ tx, onEdit }) {
  const { emoji, color } = categoryMeta(tx.category);
  const isDebit = tx.amount < 0;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {formatDate(tx.date)}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
          {tx.merchant_name || tx.description}
        </div>
        {tx.merchant_name && tx.description !== tx.merchant_name && (
          <div className="text-xs text-gray-500 truncate max-w-xs">{tx.description}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span>{emoji}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: color + '20', color }}
          >
            {tx.category || 'Uncategorized'}
          </span>
          {tx.sub_category && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{tx.sub_category}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
        {tx.account_name}
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-semibold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {isDebit ? '-' : '+'}{formatINR(tx.amount)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onEdit(tx)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}
