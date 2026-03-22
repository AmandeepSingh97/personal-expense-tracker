import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard,
  List,
  PiggyBank,
  Upload,
  CalendarDays,
  CreditCard,
  Moon,
  Sun,
  Tag,
  TrendingUp,
  Plus,
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import Import from './pages/Import';
import MonthlyReview from './pages/MonthlyReview';
import Accounts from './pages/Accounts';
import Tags from './pages/Tags';
import Investments from './pages/Investments';
import AddTransaction from './components/AddTransaction';
import { getAlerts } from './api';

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions',   icon: List },
  { to: '/budgets',      label: 'Budgets',        icon: PiggyBank },
  { to: '/investments',  label: 'Investments',    icon: TrendingUp },
  { to: '/labels',       label: 'Labels',         icon: Tag },
  { to: '/import',       label: 'Import',         icon: Upload },
  { to: '/review',       label: 'Monthly Review', icon: CalendarDays },
  { to: '/accounts',     label: 'Accounts',       icon: CreditCard },
];

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [alertCount, setAlertCount] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    getAlerts()
      .then((data) => setAlertCount(data.length))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💰</span>
              <span className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
                Expense<br />Tracker
              </span>
            </div>
          </div>
          {/* Quick-add button in sidebar */}
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={16} /> Add Transaction
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
              {label === 'Dashboard' && alertCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setDark((d) => !d)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {dark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/dashboard" element={<Dashboard onAlertChange={setAlertCount} />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/labels" element={<Tags />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review" element={<MonthlyReview />} />
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </main>

      {/* Add Transaction modal */}
      {showAdd && (
        <AddTransaction
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}

      <Toaster
        position="top-right"
        toastOptions={{
          className: 'dark:bg-gray-800 dark:text-white',
          duration: 4000,
        }}
      />
    </div>
  );
}
