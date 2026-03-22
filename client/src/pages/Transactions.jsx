import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Download, X, Check, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTransactions, updateTransaction, bulkCategorize, getExportUrl, getTags, getTagsForTx } from '../api';
import { formatINR, formatDate, categoryMeta } from '../utils/format';
import { useCategories } from '../hooks/useCategories';
import TagInput from '../components/TagInput';

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditModal({ tx, allTags, categories, onClose, onSave, onTagChange }) {
  const [form, setForm]   = useState({
    category: tx.category || '',
    sub_category: tx.sub_category || '',
    merchant_name: tx.merchant_name || '',
    is_recurring: !!tx.is_recurring,
    save_correction: true,
  });
  const [txTags, setTxTags] = useState([]);

  useEffect(() => {
    getTagsForTx(tx.id).then(setTxTags).catch(() => {});
  }, [tx.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Edit Transaction</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{tx.description}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, sub_category: '' })}
              className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
              <option value="">— select —</option>
              {categories.map(c =>
                <option key={c.name} value={c.name}>{c.emoji} {c.name}{c.custom ? ' ★' : ''}</option>
              )}
            </select>
          </div>

          {/* Sub-category / sub-tag */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Sub-tag</label>
            <input type="text" placeholder="e.g. Food Delivery, Car Service, Movies…"
              value={form.sub_category}
              onChange={e => setForm({ ...form, sub_category: e.target.value })}
              className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>

          {/* Merchant */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Merchant</label>
            <input type="text" value={form.merchant_name}
              onChange={e => setForm({ ...form, merchant_name: e.target.value })}
              className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>

          {/* Labels / Tags */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1.5">
              <Tag size={11} /> Labels
            </label>
            <TagInput
              txId={tx.id}
              existingTags={txTags}
              allTags={allTags}
              onChange={() => {
                getTagsForTx(tx.id).then(setTxTags);
                onTagChange?.();
              }}
            />
            <p className="text-xs text-gray-400 mt-1">e.g. Preet, Aman, Goa Trip, Anniversary</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.is_recurring}
              onChange={e => setForm({ ...form, is_recurring: e.target.checked })} className="rounded" />
            Recurring monthly
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={form.save_correction}
              onChange={e => setForm({ ...form, save_correction: e.target.checked })} className="rounded" />
            Remember this category for future imports
          </label>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Close
          </button>
          <button onClick={() => onSave(tx.id, form)}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            Save Category
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const { categories } = useCategories();
  const [txs, setTxs]       = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [filters, setFilters] = useState({
    search: '', category: '', from: '', to: '',
    tag: searchParams.get('tag') || '',  // pre-fill from URL ?tag=
  });
  const [editTx, setEditTx] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkCat, setBulkCat]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [allTags, setAllTags]   = useState([]);
  const [txTags, setTxTags]     = useState({}); // id → [tags]
  const LIMIT = 50;

  // Load all tags once for autocomplete
  useEffect(() => { getTags().then(setAllTags).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT, include_transfers: 'false', ...filters };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const data = await getTransactions(params);
      setTxs(data.data);
      setTotal(data.total);

      // Fetch tags for visible transactions
      const tagMap = {};
      await Promise.all(data.data.map(async tx => {
        try { tagMap[tx.id] = await getTagsForTx(tx.id); } catch { tagMap[tx.id] = []; }
      }));
      setTxTags(tagMap);
    } finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = async (id, form) => {
    try {
      await updateTransaction(id, form);
      toast.success('Saved');
      window.dispatchEvent(new Event('transactionAdded'));
      load();
    } catch { toast.error('Failed'); }
  };

  const handleBulk = async () => {
    if (!bulkCat || !selected.size) return;
    try {
      await bulkCategorize({ ids: [...selected], category: bulkCat });
      toast.success(`Updated ${selected.size} transactions`);
      setSelected(new Set()); setBulkCat(''); load();
    } catch { toast.error('Failed'); }
  };

  const setFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(1); };
  const clearFilters = () => { setFilters({ search: '', category: '', from: '', to: '', tag: '' }); setPage(1); };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <a href={getExportUrl(filters)} download
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Download size={15} /> Export
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-4 flex flex-wrap gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-40">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input type="text" placeholder="Search…" value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="flex-1 text-sm bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400" />
        </div>
        {/* Category */}
        <select value={filters.category} onChange={e => setFilter('category', e.target.value)}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
        </select>
        {/* Tag filter */}
        <select value={filters.tag} onChange={e => setFilter('tag', e.target.value)}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="">All Labels</option>
          {allTags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {/* Dates */}
        <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
        <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-red-500 flex items-center gap-1">
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{selected.size} selected</span>
          <select value={bulkCat} onChange={e => setBulkCat(e.target.value)}
            className="text-sm border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="">Set category…</option>
            {categories.map(c =>
              <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
            )}
          </select>
          <button onClick={handleBulk} disabled={!bulkCat}
            className="flex items-center gap-1 text-sm px-3 py-1 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            <Check size={13} /> Apply
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500">Cancel</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" className="rounded"
                  checked={selected.size === txs.length && txs.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(txs.map(t => t.id)) : new Set())} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Category · Sub-tag · Labels</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Amount</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                </td></tr>
              ))
            ) : txs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                No transactions found.
              </td></tr>
            ) : (
              txs.map(tx => {
                const { emoji, color } = categoryMeta(tx.category);
                const tags = txTags[tx.id] || [];
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded"
                        checked={selected.has(tx.id)}
                        onChange={() => {
                          const s = new Set(selected);
                          s.has(tx.id) ? s.delete(tx.id) : s.add(tx.id);
                          setSelected(s);
                        }} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {tx.merchant_name || tx.description}
                      </div>
                      {tx.merchant_name && tx.description !== tx.merchant_name && (
                        <div className="text-xs text-gray-400 truncate max-w-[200px]">{tx.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Category chip */}
                        {tx.category && tx.category !== 'Uncategorized' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: color + '20', color }}>
                            {emoji} {tx.category}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            ❓ Uncategorized
                          </span>
                        )}
                        {/* Sub-tag chip */}
                        {tx.sub_category && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {tx.sub_category}
                          </span>
                        )}
                        {/* Label tags */}
                        <TagInput
                          txId={tx.id}
                          existingTags={tags}
                          allTags={allTags}
                          onChange={() => {
                            getTags().then(setAllTags);
                            getTagsForTx(tx.id).then(t => setTxTags(prev => ({ ...prev, [tx.id]: t })));
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {tx.amount < 0 ? '-' : '+'}{formatINR(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditTx(tx)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Showing {(page-1)*LIMIT+1}–{Math.min(page*LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page===1} onClick={() => setPage(p => p-1)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Prev</button>
            <button disabled={page*LIMIT>=total} onClick={() => setPage(p => p+1)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {editTx && (
        <EditModal
          tx={editTx}
          allTags={allTags}
          categories={categories}
          onClose={() => setEditTx(null)}
          onSave={(id, form) => { handleEdit(id, form); setEditTx(null); }}
          onTagChange={() => getTags().then(setAllTags)}
        />
      )}
    </div>
  );
}
