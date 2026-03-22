import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, CreditCard, Building, TrendingUp, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../api';
import { formatINR, formatDate } from '../utils/format';

const ACCOUNT_TYPES = [
  { value: 'savings',    label: 'Savings',     icon: '🏦', desc: 'Salary, personal savings' },
  { value: 'current',   label: 'Current',     icon: '🏢', desc: 'Business / current account' },
  { value: 'credit',    label: 'Credit Card', icon: '💳', desc: 'Credit card (balance = amount owed)' },
  { value: 'investment',label: 'Investment',  icon: '📈', desc: 'Demat, mutual fund account' },
  { value: 'cash',      label: 'Cash',        icon: '💵', desc: 'Physical cash wallet' },
];

const COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b','#ec4899',
  '#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb923c',
];

// Suggested accounts for quick onboarding
const SUGGESTIONS = [
  { name: 'ICICI Savings',     bank: 'ICICI Bank',   account_type: 'savings',  color: '#f97316' },
  { name: 'HDFC Credit Card',  bank: 'HDFC Bank',    account_type: 'credit',   color: '#e11d48' },
  { name: 'Axis Joint Account',bank: 'Axis Bank',    account_type: 'savings',  color: '#8b5cf6' },
  { name: 'Kotak Savings',     bank: 'Kotak Bank',   account_type: 'savings',  color: '#ef4444' },
  { name: 'Indusind Savings',  bank: 'IndusInd Bank',account_type: 'savings',  color: '#0ea5e9' },
  { name: 'Canara Savings',    bank: 'Canara Bank',  account_type: 'savings',  color: '#22c55e' },
];

function AccountTypeIcon({ type, size = 18 }) {
  const icons = { savings: Wallet, current: Building, credit: CreditCard, investment: TrendingUp, cash: Wallet };
  const Icon = icons[type] || Wallet;
  return <Icon size={size} />;
}

function BalanceDisplay({ account }) {
  const bal = account.current_balance ?? account.opening_balance;
  const isCredit = account.account_type === 'credit';

  if (isCredit) {
    return (
      <div>
        <div className={`text-xl font-bold ${bal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {bal >= 0 ? `+${formatINR(bal)}` : `-${formatINR(Math.abs(bal))}`}
        </div>
        <div className="text-xs text-gray-400">
          {bal < 0 ? 'amount owed' : 'credit balance'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`text-xl font-bold ${bal >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
        {formatINR(bal)}
      </div>
      <div className="text-xs text-gray-400">current balance</div>
    </div>
  );
}

function AccountForm({ initial, onSave, onCancel, showSuggestions = false, existingNames = [] }) {
  const [form, setForm] = useState(initial || {
    name: '', bank: '', account_type: 'savings',
    opening_balance: '', opening_date: new Date().toISOString().split('T')[0],
    color: COLORS[0], notes: '', tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fillSuggestion = (s) => {
    setForm(f => ({ ...f, ...s, opening_balance: f.opening_balance, opening_date: f.opening_date, tags: f.tags }));
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Account name required'); return; }
    if (form.opening_balance === '' || isNaN(Number(form.opening_balance))) {
      toast.error('Enter a valid opening balance'); return;
    }
    if (!initial && existingNames.includes(form.name.trim())) {
      toast.error('Account name already exists'); return;
    }
    onSave({ ...form, opening_balance: Number(form.opening_balance) });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4">
      {/* Quick suggestions for new accounts */}
      {showSuggestions && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Quick select</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.filter(s => !existingNames.includes(s.name)).map(s => (
              <button key={s.name} onClick={() => fillSuggestion(s)}
                className={`text-xs px-3 py-1.5 rounded-full border-2 transition-colors ${form.name === s.name ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Account Name *</label>
          <input autoFocus type="text" placeholder="e.g. ICICI Savings, Preet HDFC"
            value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Bank */}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Bank</label>
          <input type="text" placeholder="e.g. ICICI Bank"
            value={form.bank} onChange={e => set('bank', e.target.value)}
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none" />
        </div>

        {/* Type */}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Account Type</label>
          <select value={form.account_type} onChange={e => set('account_type', e.target.value)}
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>

        {/* Opening balance */}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Opening Balance (₹) *
            {form.account_type === 'credit' && <span className="ml-1 text-gray-400">— enter negative if you owe</span>}
          </label>
          <input type="number" placeholder={form.account_type === 'credit' ? '-15000' : '23040'}
            value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)}
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* As of date */}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Balance as of</label>
          <input type="date" value={form.opening_date} onChange={e => set('opening_date', e.target.value)}
            className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">Color</label>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button key={c} onClick={() => set('color', c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{ backgroundColor: c, borderColor: form.color === c ? 'white' : 'transparent', boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none' }} />
          ))}
        </div>
      </div>

      {/* Account Tags */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
          Account Tags — what does this account do?
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(form.tags || []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
              {tag}
              <button onClick={() => set('tags', form.tags.filter(t => t !== tag))} className="hover:opacity-70">×</button>
            </span>
          ))}
        </div>
        {/* Preset tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {['salary account','spending account','savings account','holiday fund','Preet spend','joint expenses','car loan','emergency fund','investment']
            .filter(t => !(form.tags || []).includes(t))
            .map(t => (
              <button key={t} onClick={() => set('tags', [...(form.tags || []), t])}
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                + {t}
              </button>
            ))}
        </div>
        {/* Custom tag input */}
        <div className="flex gap-2">
          <input type="text" placeholder="Custom tag…" value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tagInput.trim()) {
                set('tags', [...(form.tags || []), tagInput.trim()]);
                setTagInput('');
              }
            }}
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <button
            onClick={() => { if (tagInput.trim()) { set('tags', [...(form.tags || []), tagInput.trim()]); setTagInput(''); } }}
            className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600">
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Notes (optional)</label>
        <input type="text" placeholder="e.g. Preet's account, joint expenses"
          value={form.notes} onChange={e => set('notes', e.target.value)}
          className="w-full mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none" />
      </div>

      {/* Type hint */}
      {form.account_type && (
        <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          {ACCOUNT_TYPES.find(t => t.value === form.account_type)?.desc}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">
          <Check size={15} /> {initial ? 'Save Changes' : 'Add Account'}
        </button>
        <button onClick={onCancel}
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
}

function AccountCard({ account, onEdit, onDelete }) {
  const bal = account.current_balance ?? account.opening_balance;
  const isCredit = account.account_type === 'credit';
  const typeInfo = ACCOUNT_TYPES.find(t => t.value === account.account_type);

  // Progress bar: for credit cards show utilization, for savings show vs opening
  const balDelta = bal - account.opening_balance;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow">
      {/* Color bar */}
      <div className="h-1.5" style={{ backgroundColor: account.color }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm"
              style={{ backgroundColor: account.color }}>
              <AccountTypeIcon type={account.account_type} size={16} />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white text-sm">{account.name}</div>
              {account.bank && <div className="text-xs text-gray-400">{account.bank}</div>}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(account)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(account)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Balance */}
        <BalanceDisplay account={account} />

        {/* Delta since opening */}
        {account.tx_count > 0 && (
          <div className={`text-xs mt-1 ${balDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {balDelta >= 0 ? '+' : ''}{formatINR(balDelta)} since {formatDate(account.opening_date)}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="text-sm">{typeInfo?.icon}</span>
            {typeInfo?.label}
          </div>
          <div className="text-xs text-gray-400">
            {account.tx_count > 0 ? `${account.tx_count} transactions` : 'No transactions yet'}
          </div>
        </div>

        {/* Account tags */}
        {account.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {account.tags.map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        )}
        {account.notes && (
          <div className="mt-1.5 text-xs text-gray-400 italic truncate">{account.notes}</div>
        )}
      </div>
    </div>
  );
}

export default function Accounts() {
  const [accounts, setAccounts]   = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editAcct, setEditAcct]   = useState(null);
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    setLoading(true);
    try { setAccounts(await getAccounts()); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    window.addEventListener('transactionAdded', load);
    return () => window.removeEventListener('transactionAdded', load);
  }, []);

  const handleCreate = async (form) => {
    try {
      await createAccount(form);
      toast.success(`Account "${form.name}" added`);
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleUpdate = async (form) => {
    try {
      await updateAccount(editAcct.id, form);
      toast.success('Account updated');
      setEditAcct(null);
      load();
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (account) => {
    if (!confirm(`Remove "${account.name}"? Transactions will be kept.`)) return;
    try {
      await deleteAccount(account.id);
      toast.success('Account removed');
      load();
    } catch { toast.error('Failed'); }
  };

  // Net worth
  const netWorth = accounts.reduce((s, a) => s + (a.current_balance ?? a.opening_balance), 0);
  const existingNames = accounts.map(a => a.name);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Accounts</h1>
          {accounts.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              Net worth: <span className={`font-semibold ${netWorth >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatINR(netWorth)}</span>
            </p>
          )}
        </div>
        <button onClick={() => { setShowForm(true); setEditAcct(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">
          <Plus size={15} /> Add Account
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6">
          <AccountForm
            showSuggestions
            existingNames={existingNames}
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Edit form */}
      {editAcct && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Edit "{editAcct.name}"</h2>
          <AccountForm
            initial={editAcct}
            existingNames={existingNames.filter(n => n !== editAcct.name)}
            onSave={handleUpdate}
            onCancel={() => setEditAcct(null)}
          />
        </div>
      )}

      {/* Empty state / onboarding */}
      {!loading && accounts.length === 0 && !showForm && (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="text-4xl mb-4">🏦</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Set up your accounts</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Add your bank accounts with their current balance. The app will track your balance as you add transactions.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {SUGGESTIONS.slice(0, 4).map(s => (
              <span key={s.name} className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400">
                {s.name}
              </span>
            ))}
          </div>
          <button onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">
            Add your first account
          </button>
        </div>
      )}

      {/* Account cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(a => (
            <div key={a.id} className="group">
              <AccountCard
                account={a}
                onEdit={acct => { setEditAcct(acct); setShowForm(false); }}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
