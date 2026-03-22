import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Tag, ChevronRight, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTags, createTag, deleteTag, getTagSummary } from '../api';
import { formatINR, currentMonth, monthLabel } from '../utils/format';
import { useNavigate } from 'react-router-dom';

const PRESET_COLORS = [
  '#6366f1','#ec4899','#10b981','#f59e0b','#3b82f6',
  '#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb923c',
  '#64748b','#0d9488','#7c3aed','#be185d','#15803d',
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: value === c ? 'white' : 'transparent',
            boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

export default function Tags() {
  const navigate     = useNavigate();
  const [tags, setTags]       = useState([]);
  const [summary, setSummary] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const month = currentMonth();

  const load = async () => {
    const [t, s] = await Promise.all([getTags(), getTagSummary({ month })]);
    setTags(t);
    setSummary(s);
  };

  useEffect(() => { load(); }, []);

  const summaryMap = Object.fromEntries(summary.map(s => [s.id, s]));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createTag({ name: newName.trim(), color: newColor });
      toast.success(`Tag "${newName.trim()}" created`);
      setNewName(''); setNewColor(PRESET_COLORS[0]); setCreating(false);
      load();
    } catch { toast.error('Failed to create tag'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all transactions.`)) return;
    try {
      await deleteTag(tag.id);
      toast.success('Tag deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Tag size={22} /> Labels
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cross-cutting labels — tag transactions across categories (Preet, Goa Trip, Medical…)
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> New Label
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Create label</p>
          <div className="flex gap-3 items-start">
            {/* Color preview */}
            <div className="w-8 h-8 rounded-full shrink-0 mt-1 border-2 border-white dark:border-gray-800 shadow"
              style={{ backgroundColor: newColor }} />
            <div className="flex-1">
              <input
                autoFocus
                type="text"
                placeholder="Label name (e.g. Goa Trip, Medical, Preet)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleCreate} disabled={!newName.trim() || loading}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm">
              <Check size={14} /> Create
            </button>
            <button onClick={() => { setCreating(false); setNewName(''); }}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tag list */}
      {tags.length === 0 ? (
        <div className="text-center py-16">
          <Tag size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">No labels yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create labels like <strong>Preet</strong>, <strong>Goa Trip</strong>, or <strong>Medical</strong> to tag transactions across categories.
          </p>
          <button onClick={() => setCreating(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Create your first label
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Current period summary header */}
          {summary.length > 0 && (
            <p className="text-xs text-gray-400 mb-3">Showing spend for {monthLabel(month)}</p>
          )}

          {tags.map(tag => {
            const s = summaryMap[tag.id];
            return (
              <div key={tag.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center gap-4 group hover:shadow-sm transition-shadow">
                {/* Color dot */}
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{tag.name}</span>
                    {tag.tx_count > 0 && (
                      <span className="text-xs text-gray-400">{tag.tx_count} transactions</span>
                    )}
                  </div>
                  {s?.total_spent > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatINR(s.total_spent)} spent this period
                      {s.tx_count > 0 && ` · ${s.tx_count} txns`}
                    </div>
                  )}
                  {(!s || s.total_spent === 0) && tag.tx_count === 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">No transactions yet</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {tag.tx_count > 0 && (
                    <button
                      onClick={() => navigate(`/transactions?tag=${encodeURIComponent(tag.name)}`)}
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View <ChevronRight size={12} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(tag)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Tag chip preview */}
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                  style={{ backgroundColor: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}40` }}
                >
                  {tag.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
