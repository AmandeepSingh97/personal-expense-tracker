const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// Seed colors — cycle through when creating tags
const COLORS = [
  '#6366f1','#f59e0b','#ec4899','#10b981','#3b82f6',
  '#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb923c',
];

// GET /api/tags  — all tags + spend totals
router.get('/', (req, res) => {
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.*,
           COUNT(tt.transaction_id) as tx_count,
           COALESCE(SUM(CASE WHEN tr.amount < 0 THEN ABS(tr.amount) ELSE 0 END), 0) as total_spent
    FROM tags t
    LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
    LEFT JOIN transactions tr ON tr.id = tt.transaction_id AND tr.is_transfer = 0
    GROUP BY t.id
    ORDER BY tx_count DESC, t.name ASC
  `).all();
  res.json(tags);
});

// POST /api/tags  — create tag
router.post('/', (req, res) => {
  const db = getDb();
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name.trim());
  if (existing) return res.json(existing);

  const count = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
  const tagColor = color || COLORS[count % COLORS.length];

  const result = db.prepare(
    `INSERT INTO tags (name, color) VALUES (?, ?)`
  ).run(name.trim(), tagColor);

  res.json({ id: result.lastInsertRowid, name: name.trim(), color: tagColor });
});

// DELETE /api/tags/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/tags/:id/transactions  — transactions with this tag
router.get('/:id/transactions', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT tr.* FROM transactions tr
    JOIN transaction_tags tt ON tt.transaction_id = tr.id
    WHERE tt.tag_id = ?
    ORDER BY tr.date DESC
  `).all(req.params.id);
  res.json(rows);
});

// GET /api/tags/summary  — total spend per tag (optional period filter)
router.get('/summary/by-period', (req, res) => {
  const db = getDb();
  const { month } = req.query;
  const { periodExpr } = require('../utils/budgetPeriod');
  const PERIOD = periodExpr('tr.date');
  const periodFilter = month ? `AND (${PERIOD}) = '${month}'` : '';

  const rows = db.prepare(`
    SELECT t.id, t.name, t.color,
           COUNT(tt.transaction_id) as tx_count,
           COALESCE(SUM(CASE WHEN tr.amount < 0 THEN ABS(tr.amount) ELSE 0 END), 0) as total_spent
    FROM tags t
    JOIN transaction_tags tt ON tt.tag_id = t.id
    JOIN transactions tr ON tr.id = tt.transaction_id AND tr.is_transfer = 0
    WHERE 1=1 ${periodFilter}
    GROUP BY t.id
    ORDER BY total_spent DESC
  `).all();
  res.json(rows);
});

// ── Per-transaction tag management ──────────────────────────────────────────

// GET /api/tags/for/:txId
router.get('/for/:txId', (req, res) => {
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN transaction_tags tt ON tt.tag_id = t.id
    WHERE tt.transaction_id = ?
  `).all(req.params.txId);
  res.json(tags);
});

// POST /api/tags/for/:txId  — add tag to transaction (creates tag if needed)
router.post('/for/:txId', (req, res) => {
  const db = getDb();
  const { name, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  // Upsert tag
  let tag = db.prepare('SELECT * FROM tags WHERE name = ?').get(name.trim());
  if (!tag) {
    const count = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
    const tagColor = color || COLORS[count % COLORS.length];
    const r = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name.trim(), tagColor);
    tag = { id: r.lastInsertRowid, name: name.trim(), color: tagColor };
  }

  // Link to transaction (ignore if already linked)
  db.prepare(
    'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
  ).run(Number(req.params.txId), tag.id);

  res.json(tag);
});

// DELETE /api/tags/for/:txId/:tagId  — remove tag from transaction
router.delete('/for/:txId/:tagId', (req, res) => {
  const db = getDb();
  db.prepare(
    'DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?'
  ).run(Number(req.params.txId), Number(req.params.tagId));
  res.json({ ok: true });
});

module.exports = router;
