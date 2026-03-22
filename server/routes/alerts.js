const express = require('express');
const db = require('../db');
const { runAlertEngine } = require('../services/alertEngine');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await db.query('SELECT * FROM alerts WHERE dismissed_at IS NULL ORDER BY triggered_at DESC'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/dismiss', async (req, res) => {
  try {
    await db.run('UPDATE alerts SET dismissed_at=NOW() WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dismiss-all', async (req, res) => {
  try {
    await db.run('UPDATE alerts SET dismissed_at=NOW() WHERE dismissed_at IS NULL');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/run', async (req, res) => {
  try {
    const created = await runAlertEngine(req.body.month);
    res.json({ created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
