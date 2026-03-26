/**
 * AddTransaction — fast manual transaction entry.
 *
 * Flow: Amount → Category → Description (optional) → Save
 * Keyboard: Enter advances steps, Escape closes.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { createTransaction, getAccounts, createCategory } from '../api';
import { categoryMeta, INVESTMENT_CATEGORIES, CATEGORY_GROUPS } from '../utils/format';
import { useCategories, invalidateCategoryCache } from '../hooks/useCategories';

// Quick date helpers
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Ordered list of expense categories for the picker (investments last)
const EXPENSE_GROUP_ORDER = ['Fixed', 'Household', 'Lifestyle', 'Family'];

export default function AddTransaction({ onClose, onSaved }) {
  const { categories } = useCategories();

  const [step, setStep]         = useState('amount');   // amount → category → details
  const [sign, setSign]         = useState(-1);         // -1 = expense, +1 = income, 0 = investment
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate]         = useState(today());
  const [account, setAccount]   = useState('Manual');
  const [isRecurring, setIsRecurring] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const amountRef = useRef();
  const descRef   = useRef();

  // Load accounts for the picker
  useEffect(() => {
    getAccounts().then(list => {
      setAccounts(list);
      if (list.length > 0) setAccount(list[0].name); // default to first account
    }).catch(() => {});
  }, []);

  // Auto-focus amount on open
  useEffect(() => { setTimeout(() => amountRef.current?.focus(), 80); }, []);
  useEffect(() => { if (step === 'details') setTimeout(() => descRef.current?.focus(), 80); }, [step]);

  const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;
  const isInvestment = sign === 0;
  const finalAmount = isInvestment ? -amount : sign * amount; // investments are outflows
  const isIncome = sign === 1;

  // Group categories for the picker
  const grouped = EXPENSE_GROUP_ORDER.map(key => ({
    key,
    group: CATEGORY_GROUPS[key],
    cats: (CATEGORY_GROUPS[key]?.categories || [])
      .map(name => categories.find(c => c.name === name))
      .filter(Boolean),
  })).filter(g => g.cats.length > 0);

  // Custom categories not in any group
  const groupedNames = new Set(EXPENSE_GROUP_ORDER.flatMap(k => CATEGORY_GROUPS[k]?.categories || []));
  const customCats = categories.filter(c => c.custom && !groupedNames.has(c.name));
  const investmentCats = categories.filter(c => INVESTMENT_CATEGORIES.has(c.name));

  const handleAmountNext = () => {
    if (!amount) { toast.error('Enter an amount'); return; }
    setStep('category');
  };

  const handleCategoryPick = (cat) => {
    setCategory(cat);
    setStep('details');
  };

  const handleSave = async () => {
    if (!amount) { toast.error('Enter an amount'); return; }
    if (!category) { toast.error('Pick a category'); return; }
    setSaving(true);
    try {
      const isSalary = category === 'Salary';
      const saveAmount = isSalary ? Math.abs(amount) : finalAmount;
      await createTransaction({
        date,
        description: description.trim() || category,
        amount: saveAmount,
        account_name: account,
        category,
        is_recurring: isRecurring ? 1 : 0,
        is_investment: (isInvestment || INVESTMENT_CATEGORIES.has(category)) ? 1 : 0,
      });
      toast.success('Transaction added');
      window.dispatchEvent(new Event('transactionAdded')); // notify all pages to refresh
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') {
      if (step === 'amount') handleAmountNext();
      else if (step === 'details') handleSave();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onKeyDown={handleKeyDown}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">Add Transaction</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* ── Step 1: Amount ──────────────────────────────────────────── */}
          {step === 'amount' && (
            <div className="space-y-4">
              {/* Expense / Income / Investment toggle */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <button onClick={() => setSign(-1)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${sign === -1 ? 'bg-red-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <Minus size={13} /> Expense
                </button>
                <button onClick={() => setSign(1)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${sign === 1 ? 'bg-green-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <Plus size={13} /> Income
                </button>
                <button onClick={() => setSign(0)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${sign === 0 ? 'bg-teal-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  📈 Invest
                </button>
              </div>

              {/* Amount input */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">₹</span>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  className="w-full pl-10 pr-4 py-4 text-3xl font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Date quick-select */}
              <div className="flex gap-2">
                {[['Today', today()], ['Yesterday', yesterday()]].map(([label, val]) => (
                  <button key={label} onClick={() => setDate(val)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${date === val ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    {label}
                  </button>
                ))}
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="flex-1 py-2 px-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <button onClick={handleAmountNext} disabled={!amount}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors">
                Next — Pick Category
              </button>
            </div>
          )}

          {/* ── Step 2: Category picker ──────────────────────────────────── */}
          {step === 'category' && (
            <div className="space-y-3">
              {/* Amount recap */}
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5">
                <span className="text-sm text-gray-500">{fmtDate(date)}</span>
                <span className={`text-xl font-bold ${isIncome ? 'text-green-600' : isInvestment ? 'text-teal-600' : 'text-red-500'}`}>
                  {isIncome ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
                  {isInvestment && <span className="text-sm ml-1 font-normal">invested</span>}
                </span>
                <button onClick={() => setStep('amount')} className="text-xs text-blue-500 hover:underline">change</button>
              </div>

              {/* Category grid — grouped */}
              <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {grouped.map(({ key, group, cats }) => (
                  <div key={key}>
                    <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1.5 px-0.5">
                      {group?.emoji} {group?.label}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {cats.map(c => {
                        const { emoji, color } = categoryMeta(c.name);
                        return (
                          <button key={c.name} onClick={() => handleCategoryPick(c.name)}
                            className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all hover:scale-105 active:scale-95"
                            style={{ borderColor: color + '40', backgroundColor: color + '12' }}>
                            <span className="text-xl">{emoji}</span>
                            <span className="text-xs font-medium text-center leading-tight" style={{ color }}>
                              {c.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Investments */}
                {investmentCats.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 px-0.5">📈 Investments</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {investmentCats.map(c => {
                        const { emoji, color } = categoryMeta(c.name);
                        return (
                          <button key={c.name} onClick={() => handleCategoryPick(c.name)}
                            className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all hover:scale-105"
                            style={{ borderColor: color + '40', backgroundColor: color + '12' }}>
                            <span className="text-xl">{emoji}</span>
                            <span className="text-xs font-medium text-center leading-tight" style={{ color }}>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Custom */}
                {customCats.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1.5 px-0.5">📌 Custom</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {customCats.map(c => {
                        const { emoji, color } = categoryMeta(c.name);
                        return (
                          <button key={c.name} onClick={() => handleCategoryPick(c.name)}
                            className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all hover:scale-105"
                            style={{ borderColor: color + '40', backgroundColor: color + '12' }}>
                            <span className="text-xl">{emoji}</span>
                            <span className="text-xs font-medium text-center leading-tight" style={{ color }}>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* + New Category */}
                {!showNewCat ? (
                  <button onClick={() => setShowNewCat(true)}
                    className="w-full py-2 mt-1 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 transition-colors">
                    + New Category
                  </button>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Category name"
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && newCatName.trim()) {
                          e.stopPropagation();
                          try {
                            await createCategory({ name: newCatName.trim() });
                            invalidateCategoryCache();
                            setNewCatName('');
                            setShowNewCat(false);
                            toast.success(`Created "${newCatName.trim()}"`);
                          } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
                        }
                        if (e.key === 'Escape') { setShowNewCat(false); setNewCatName(''); }
                      }}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={async () => {
                      if (!newCatName.trim()) return;
                      try {
                        await createCategory({ name: newCatName.trim() });
                        invalidateCategoryCache();
                        setNewCatName('');
                        setShowNewCat(false);
                        toast.success(`Created "${newCatName.trim()}"`);
                      } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
                    }} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                      Add
                    </button>
                    <button onClick={() => { setShowNewCat(false); setNewCatName(''); }}
                      className="px-2 py-2 text-gray-400 hover:text-gray-600 text-sm">
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <button onClick={() => setStep('amount')} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 3: Details + Save ────────────────────────────────────── */}
          {step === 'details' && (
            <div className="space-y-3">
              {/* Summary recap */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                <span className="text-2xl">{categoryMeta(category).emoji}</span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white">{category}</div>
                  <div className="text-xs text-gray-400">{fmtDate(date)}</div>
                </div>
                <span className={`text-xl font-bold ${isIncome ? 'text-green-600' : isInvestment ? 'text-teal-600' : 'text-red-500'}`}>
                  {isIncome ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
                  {isInvestment && <span className="text-sm ml-1 font-normal">invested</span>}
                </span>
                <button onClick={() => setStep('category')} className="text-xs text-blue-500 hover:underline ml-1">change</button>
              </div>

              {/* Description */}
              <input
                ref={descRef}
                type="text"
                placeholder="Description / merchant (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Account selector — always visible */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block">From account</label>
                {accounts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <button key={a.name} onClick={() => setAccount(a.name)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-medium transition-all ${account === a.name ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        {a.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="text" value={account} onChange={e => setAccount(e.target.value)} placeholder="Account name"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
                )}
              </div>

              {/* More options toggle */}
              <button onClick={() => setShowDetails(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                More options
              </button>

              {showDetails && (
                <div className="pl-1">
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="rounded" />
                    Mark as recurring monthly
                  </label>
                </div>
              )}

              {/* Save */}
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-base">
                <Check size={18} />
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>

              <button onClick={() => setStep('category')} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
