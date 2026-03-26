const express = require('express');
const db = require('../db');

const router = express.Router();

const BUILTIN = [
  { name: 'Rent',                  emoji: '🏠', color: '#6366f1', custom: false },
  { name: 'Maid',                  emoji: '🧹', color: '#8b5cf6', custom: false },
  { name: 'Cook',                  emoji: '👨‍🍳', color: '#f97316', custom: false },
  { name: 'SIPs',                  emoji: '📈', color: '#14b8a6', custom: false },
  { name: 'Groceries',             emoji: '🛒', color: '#f59e0b', custom: false },
  { name: 'Electricity',           emoji: '⚡', color: '#eab308', custom: false },
  { name: 'WiFi',                  emoji: '📶', color: '#38bdf8', custom: false },
  { name: 'Outing',                emoji: '🍽️', color: '#ec4899', custom: false },
  { name: 'Cylinder',              emoji: '🔥', color: '#ef4444', custom: false },
  { name: 'Car Loan',              emoji: '🚗', color: '#10b981', custom: false },
  { name: 'Petrol',                emoji: '⛽', color: '#06b6d4', custom: false },
  { name: 'PPF',                   emoji: '🏦', color: '#3b82f6', custom: false },
  { name: 'Insurance',             emoji: '🛡️', color: '#84cc16', custom: false },
  { name: 'Emergency Cash',        emoji: '🆘', color: '#dc2626', custom: false },
  { name: 'Holiday',               emoji: '✈️', color: '#0ea5e9', custom: false },
  { name: 'Home Savings',          emoji: '🏡', color: '#22c55e', custom: false },
  { name: 'Personal Expenses',     emoji: '👤', color: '#a855f7', custom: false },
  { name: 'LIC',                   emoji: '📋', color: '#64748b', custom: false },
  { name: 'Send to Parents',       emoji: '👨‍👩‍👧', color: '#fb923c', custom: false },
  { name: 'Preet Badminton',       emoji: '🏸', color: '#38bdf8', custom: false },
  { name: 'Preet Beauty Products', emoji: '💄', color: '#e879f9', custom: false },
  { name: 'Donation',              emoji: '🙏', color: '#f59e0b', custom: false },
  { name: 'Salary',                emoji: '💼', color: '#16a34a', custom: false },
  { name: 'Income',                emoji: '💰', color: '#22c55e', custom: false },
  { name: 'Transfers',             emoji: '🔁', color: '#94a3b8', custom: false },
  { name: 'Uncategorized',         emoji: '❓', color: '#9ca3af', custom: false },
];

router.get('/', async (req, res) => {
  try {
    const custom = (await db.query('SELECT * FROM custom_categories ORDER BY created_at')).map(c => ({ ...c, custom: true }));
    res.json([...BUILTIN, ...custom]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, emoji = '📌', color = '#9ca3af' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (BUILTIN.find(b => b.name.toLowerCase() === name.toLowerCase()))
      return res.status(400).json({ error: 'Built-in category already exists' });

    const existing = await db.queryOne('SELECT * FROM custom_categories WHERE name = ?', [name.trim()]);
    if (existing) return res.json({ ...existing, custom: true });

    const result = await db.run(
      'INSERT INTO custom_categories (name, emoji, color) VALUES (?,?,?) RETURNING id',
      [name.trim(), emoji, color]);
    res.json({ id: result.lastInsertRowid, name: name.trim(), emoji, color, custom: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (BUILTIN.find(b => b.name === name)) return res.status(400).json({ error: 'Cannot delete built-in categories' });
    await db.run('DELETE FROM custom_categories WHERE name = ?', [name]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
