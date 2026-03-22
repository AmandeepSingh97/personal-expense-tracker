import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { getBudgets, getBudgetUtilization, upsertBudget, deleteBudget, createCategory, deleteCategory } from '../api';
import { formatINR, currentMonth, CATEGORY_GROUPS } from '../utils/format';
import { useCategories, invalidateCategoryCache } from '../hooks/useCategories';

const EMOJI_OPTIONS = ['🏠','🚗','🍔','✈️','💊','🎓','🎬','💳','🛍️','👨‍👩‍👧','🌍','🔁','📌','🎯','💡','🏋️','🐾','🎁','🎵','📱','🍷','☕','🎮','🛒','⚡','🔧','💼','🌱'];
const COLOR_OPTIONS = ['#6366f1','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb923c','#64748b','#0d9488','#be185d','#15803d','#7c3aed'];

function BudgetBar({ pct, color }) {
  const c = Math.min(pct, 100);
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : color;
  return (
    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c}%`, backgroundColor: barColor }} />
    </div>
  );
}

function EditInline({ budget, onSave, onCancel }) {
  const [limit, setLimit] = useState(String(budget.monthly_limit));
  const [pct, setPct] = useState(budget.alert_threshold_pct);
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-gray-400 text-sm">₹</span>
      <input
        type="number" value={limit} onChange={e => setLimit(e.target.value)}
        className="w-28 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        placeholder="Monthly limit"
      />
      <span className="text-gray-400 text-xs">alert at</span>
      <input
        type="number" value={pct} onChange={e => setPct(Number(e.target.value))} min={1} max={100}
        className="w-16 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />
      <span className="text-gray-400 text-xs">%</span>
      <button onClick={() => onSave(Number(limit), pct)} className="p-1 text-green-500 hover:text-green-700"><Check size={14} /></button>
      <button onClick={onCancel} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
    </div>
  );
}

function BudgetRow({ budget, util, onEdit, onDelete, isEditing, onSave, onCancelEdit, catMeta }) {
  const { emoji, color } = catMeta(budget.category);
  const spent = util?.spent || 0;
  const pct = util?.pct || 0;
  const isInvGroup = Object.keys(CATEGORY_GROUPS).find(k => CATEGORY_GROUPS[k].categories.includes(budget.category)) === 'Invested';

  return (
    <div className="py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{emoji}</span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{budget.category}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatINR(spent)}</span>
            {budget.monthly_limit > 0 && (
              <span className="text-xs text-gray-400 ml-1">/ {formatINR(budget.monthly_limit)}</span>
            )}
          </div>
          <button onClick={() => onEdit(budget)} className="p-1 text-gray-300 hover:text-blue-500"><Edit2 size={13} /></button>
          <button onClick={() => onDelete(budget.category)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
      </div>
      {budget.monthly_limit > 0 && !isEditing && (
        <div className="mt-1.5">
          <BudgetBar pct={pct} color={color} />
        </div>
      )}
      {budget.monthly_limit === 0 && !isEditing && (
        <div className="text-xs text-gray-400 mt-0.5">No budget set — click ✏️ to add</div>
      )}
      {isEditing && (
        <EditInline
          budget={budget}
          onSave={(limit, p) => onSave(budget.category, limit, p)}
          onCancel={onCancelEdit}
        />
      )}
    </div>
  );
}

export default function Budgets() {
  const [budgets, setBudgets]         = useState([]);
  const [utilization, setUtilization] = useState([]);
  const [editing, setEditing]         = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [newCat, setNewCat]           = useState('');
  const [newLimit, setNewLimit]       = useState('');
  // Custom category creation
  const [showNewCat, setShowNewCat]   = useState(false);
  const [ncName, setNcName]           = useState('');
  const [ncEmoji, setNcEmoji]         = useState('📌');
  const [ncColor, setNcColor]         = useState('#6366f1');
  const { categories, allCategories, categoryMeta: catMeta, reload: reloadCats } = useCategories();
  const month = currentMonth();

  const load = async () => {
    const [b, u] = await Promise.all([getBudgets(), getBudgetUtilization({ month })]);
    setBudgets(b);
    setUtilization(u);
  };

  useEffect(() => { load(); }, []);

  const utilMap = Object.fromEntries(utilization.map(u => [u.category, u]));

  const handleSave = async (category, limit, pct) => {
    try {
      await upsertBudget(category, { monthly_limit: limit, alert_threshold_pct: pct });
      toast.success('Budget saved');
      setEditing(null);
      load();
    } catch { toast.error('Save failed'); }
  };

  const handleDelete = async cat => {
    if (!confirm(`Remove budget for ${cat}?`)) return;
    await deleteBudget(cat);
    toast.success('Removed');
    load();
  };

  const handleAdd = async () => {
    if (!newCat || !newLimit) return;
    try {
      await upsertBudget(newCat, { monthly_limit: Number(newLimit), alert_threshold_pct: 80 });
      toast.success('Budget added');
      setShowAdd(false); setNewCat(''); setNewLimit('');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleCreateCategory = async () => {
    if (!ncName.trim()) return;
    try {
      await createCategory({ name: ncName.trim(), emoji: ncEmoji, color: ncColor });
      invalidateCategoryCache();
      reloadCats();
      toast.success(`Category "${ncName.trim()}" created`);
      setShowNewCat(false); setNcName(''); setNcEmoji('📌'); setNcColor('#6366f1');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleDeleteCategory = async (catName) => {
    const isCustom = allCategories.find(c => c.name === catName && c.custom);
    if (!isCustom) { toast.error('Built-in categories cannot be deleted'); return; }
    if (!confirm(`Delete category "${catName}"?`)) return;
    try {
      await deleteCategory(catName);
      invalidateCategoryCache();
      reloadCats();
      toast.success('Category deleted');
    } catch { toast.error('Failed'); }
  };

  // ── Build grouped budget view ────────────────────────────────────────────
  const budgetMap = Object.fromEntries(budgets.map(b => [b.category, b]));

  const totalBudget  = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent   = utilization.reduce((s, u) => s + u.spent, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budgets</h1>
          <p className="text-sm text-gray-500">
            {formatINR(totalSpent)} spent of {formatINR(totalBudget)} budgeted
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowNewCat(s => !s); setShowAdd(false); }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium">
            <Sparkles size={14} /> New Category
          </button>
          <button onClick={() => { setShowAdd(s => !s); setShowNewCat(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            <Plus size={14} /> Add Budget
          </button>
        </div>
      </div>

      {/* Create custom category */}
      {showNewCat && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">New Category</p>
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl shrink-0"
              style={{ backgroundColor: ncColor + '20', border: `2px solid ${ncColor}40` }}>
              {ncEmoji}
            </div>
            <div className="flex-1 space-y-3">
              {/* Name */}
              <input autoFocus type="text" placeholder="Category name (e.g. Weekend Fun, Pet Care)"
                value={ncName} onChange={e => setNcName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); if (e.key === 'Escape') setShowNewCat(false); }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
              {/* Emoji picker */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Pick an emoji</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} onClick={() => setNcEmoji(e)}
                      className={`w-8 h-8 text-lg rounded-lg flex items-center justify-center transition-colors ${ncEmoji === e ? 'bg-purple-100 dark:bg-purple-900/40 ring-2 ring-purple-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              {/* Color picker */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Pick a color</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} onClick={() => setNcColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: ncColor === c ? 'white' : 'transparent', boxShadow: ncColor === c ? `0 0 0 2px ${c}` : 'none' }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreateCategory} disabled={!ncName.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm">
              <Check size={14} /> Create
            </button>
            <button onClick={() => setShowNewCat(false)}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add new */}
      {showAdd && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Category</label>
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              className="mt-1 block border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
              <option value="">— select —</option>
              {categories.map(c => (
                <option key={c.name} value={c.name}>{c.emoji} {c.name}{c.custom ? ' ★' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Monthly limit (₹)</label>
            <input type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="e.g. 5000"
              className="mt-1 block w-32 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <button onClick={handleAdd} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            <Check size={14} /> Save
          </button>
          <button onClick={() => setShowAdd(false)} className="flex items-center gap-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      {/* Grouped budget sections */}
      <div className="space-y-6">
        {Object.entries(CATEGORY_GROUPS).map(([key, group]) => {
          const groupBudgets = group.categories
            .map(cat => budgetMap[cat])
            .filter(Boolean);
          if (groupBudgets.length === 0) return null;

          const groupSpent  = groupBudgets.reduce((s, b) => s + (utilMap[b.category]?.spent || 0), 0);
          const groupBudget = groupBudgets.reduce((s, b) => s + b.monthly_limit, 0);
          const groupPct    = groupBudget > 0 ? Math.round((groupSpent / groupBudget) * 100) : 0;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>{group.emoji}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group.label}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {formatINR(groupSpent)}
                  {groupBudget > 0 && <> of {formatINR(groupBudget)} · {groupPct}%</>}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 divide-y divide-gray-50 dark:divide-gray-800">
                {groupBudgets.map(b => (
                  <BudgetRow
                    key={b.category}
                    budget={b}
                    util={utilMap[b.category]}
                    onEdit={b => setEditing(b.category)}
                    onDelete={handleDelete}
                    isEditing={editing === b.category}
                    onSave={handleSave}
                    onCancelEdit={() => setEditing(null)}
                    catMeta={catMeta}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Custom categories not in any group */}
        {(() => {
          const groupedCats = new Set(Object.values(CATEGORY_GROUPS).flatMap(g => g.categories));
          const customBudgets = budgets.filter(b => {
            const cat = allCategories.find(c => c.name === b.category);
            return cat?.custom && !groupedCats.has(b.category);
          });
          if (customBudgets.length === 0) return null;
          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span>📌</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custom</span>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 divide-y divide-gray-50 dark:divide-gray-800">
                {customBudgets.map(b => (
                  <BudgetRow
                    key={b.category}
                    budget={b}
                    util={utilMap[b.category]}
                    onEdit={b => setEditing(b.category)}
                    onDelete={async (cat) => { await handleDelete(cat); await handleDeleteCategory(cat); }}
                    isEditing={editing === b.category}
                    onSave={handleSave}
                    onCancelEdit={() => setEditing(null)}
                    catMeta={catMeta}
                  />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
