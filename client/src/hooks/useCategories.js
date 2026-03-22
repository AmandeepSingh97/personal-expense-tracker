import { useState, useEffect, useCallback } from 'react';
import { getCategories } from '../api';
import { CATEGORY_META } from '../utils/format';

let _cache = null; // module-level cache so all hooks share one fetch
let _listeners = [];

function notify() { _listeners.forEach(fn => fn(_cache)); }

export function invalidateCategoryCache() {
  _cache = null;
  // re-fetch for all mounted hooks
  _listeners.forEach(fn => fn(null));
}

/**
 * Returns { categories, categoryMeta, reload }
 *
 * categories  — full list including custom ones
 * categoryMeta(name) — emoji + color for any category name
 * reload — refetch from server
 */
export function useCategories() {
  const [cats, setCats] = useState(_cache);

  const load = useCallback(async () => {
    try {
      const data = await getCategories();
      _cache = data;
      notify();
      setCats(data);
    } catch {
      // fallback to built-ins
      const fallback = Object.entries(CATEGORY_META).map(([name, m]) => ({ name, ...m, custom: false }));
      setCats(fallback);
    }
  }, []);

  useEffect(() => {
    if (!_cache) load();
    else setCats(_cache);

    const handler = (newData) => { if (newData) setCats(newData); else load(); };
    _listeners.push(handler);
    return () => { _listeners = _listeners.filter(f => f !== handler); };
  }, [load]);

  const meta = useCallback((name) => {
    if (!cats) return CATEGORY_META[name] || { emoji: '📌', color: '#9ca3af' };
    const found = cats.find(c => c.name === name);
    return found ? { emoji: found.emoji, color: found.color } : { emoji: '📌', color: '#9ca3af' };
  }, [cats]);

  const SYSTEM = new Set(['Income', 'Transfers', 'Uncategorized']);
  const expenseList = cats?.filter(c => !SYSTEM.has(c.name)) || [];
  const allList     = cats || [];

  return { categories: expenseList, allCategories: allList, categoryMeta: meta, reload: load };
}
