import React, { useState } from 'react';

const REQUIRED_FIELDS = ['date', 'description'];
const OPTIONAL_FIELDS = [
  { key: 'amount', label: 'Amount (single column)' },
  { key: 'debit', label: 'Debit column' },
  { key: 'credit', label: 'Credit column' },
];

export default function ColumnMapper({ headers, preview, initialMapping, onChange }) {
  const [mapping, setMapping] = useState(
    initialMapping || { date: '', description: '', amount: '', debit: '', credit: '' }
  );

  const update = (field, value) => {
    const next = { ...mapping, [field]: value };
    setMapping(next);
    onChange(next);
  };

  const isValid =
    mapping.date &&
    mapping.description &&
    (mapping.amount || (mapping.debit && mapping.credit));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Map your file columns to the required fields. Use either a single <strong>Amount</strong> column,
        or separate <strong>Debit</strong> and <strong>Credit</strong> columns.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {REQUIRED_FIELDS.map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
              {field} <span className="text-red-500">*</span>
            </label>
            <select
              value={mapping[field]}
              onChange={(e) => update(field, e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">— select column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}

        {OPTIONAL_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {label}
            </label>
            <select
              value={mapping[key]}
              onChange={(e) => update(key, e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">— not used —</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Preview Table */}
      {preview && preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="text-xs w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    {h}
                    {Object.entries(mapping).some(([, v]) => v === h) && (
                      <span className="ml-1 text-blue-500">
                        ({Object.entries(mapping).find(([, v]) => v === h)?.[0]})
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                  {headers.map((h) => (
                    <td key={h} className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                      {String(row[h] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isValid && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Please map Date, Description, and at least one amount column.
        </p>
      )}
    </div>
  );
}
