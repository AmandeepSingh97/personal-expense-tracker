const express = require('express');
const db = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();
const COLORS = ['#6366f1','#f59e0b','#ec4899','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb923c'];

router.get('/', async (req, res) => {
  try {
    const tags = await db.query(`
      SELECT t.*, COUNT(tt.transaction_id)::int as tx_count,
             COALESCE(SUM(CASE WHEN tr.amount<0 THEN ABS(tr.amount) ELSE 0 END),0) as total_spent
      FROM tags t
      LEFT JOIN transaction_tags tt ON tt.tag_id=t.id
      LEFT JOIN transactions tr ON tr.id=tt.transaction_id AND tr.is_transfer=0
      GROUP BY t.id ORDER BY tx_count DESC, t.name ASC`);
    res.json(tags);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const existing = await db.queryOne('SELECT * FROM tags WHERE LOWER(name)=LOWER(?)', [name.trim()]);
    if (existing) return res.json(existing);
    const count = await db.queryOne('SELECT COUNT(*)::int as c FROM tags');
    const tagColor = color || COLORS[count.c % COLORS.length];
    const result = await db.run('INSERT INTO tags (name,color) VALUES (?,?) RETURNING id', [name.trim(), tagColor]);
    res.json({ id: result.lastInsertRowid, name: name.trim(), color: tagColor });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM tags WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary/by-period', async (req, res) => {
  try {
    const { month } = req.query;
    const PERIOD = periodExpr('tr.date');
    const periodFilter = month ? `AND (${PERIOD})='${month}'` : '';
    const rows = await db.query(`
      SELECT t.id, t.name, t.color, COUNT(tt.transaction_id)::int as tx_count,
             COALESCE(SUM(CASE WHEN tr.amount<0 THEN ABS(tr.amount) ELSE 0 END),0) as total_spent
      FROM tags t
      JOIN transaction_tags tt ON tt.tag_id=t.id
      JOIN transactions tr ON tr.id=tt.transaction_id AND tr.is_transfer=0
      WHERE 1=1 ${periodFilter}
      GROUP BY t.id ORDER BY total_spent DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/for/:txId', async (req, res) => {
  try {
    const tags = await db.query(`SELECT t.* FROM tags t JOIN transaction_tags tt ON tt.tag_id=t.id WHERE tt.transaction_id=?`, [req.params.txId]);
    res.json(tags);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/for/:txId', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    let tag = await db.queryOne('SELECT * FROM tags WHERE LOWER(name)=LOWER(?)', [name.trim()]);
    if (!tag) {
      const count = await db.queryOne('SELECT COUNT(*)::int as c FROM tags');
      const tagColor = color || COLORS[count.c % COLORS.length];
      const r = await db.run('INSERT INTO tags (name,color) VALUES (?,?) RETURNING id', [name.trim(), tagColor]);
      tag = { id: r.lastInsertRowid, name: name.trim(), color: tagColor };
    }
    await db.run('INSERT INTO transaction_tags (transaction_id,tag_id) VALUES (?,?) ON CONFLICT DO NOTHING', [Number(req.params.txId), tag.id]);
    res.json(tag);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/for/:txId/:tagId', async (req, res) => {
  try {
    await db.run('DELETE FROM transaction_tags WHERE transaction_id=? AND tag_id=?', [Number(req.params.txId), Number(req.params.tagId)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
