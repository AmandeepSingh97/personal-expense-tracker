const express = require('express');
const { getDb } = require('../db');
const { runAlertEngine } = require('../services/alertEngine');

const router = express.Router();

// GET /api/alerts  — active (undismissed) alerts
router.get('/', (req, res) => {
  const db = getDb();
  const alerts = db
    .prepare(
      `SELECT * FROM alerts
       WHERE dismissed_at IS NULL
       ORDER BY triggered_at DESC`
    )
    .all();
  res.json(alerts);
});

// POST /api/alerts/:id/dismiss
router.post('/:id/dismiss', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE alerts SET dismissed_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// POST /api/alerts/dismiss-all
router.post('/dismiss-all', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE alerts SET dismissed_at = datetime('now') WHERE dismissed_at IS NULL`).run();
  res.json({ ok: true });
});

// POST /api/alerts/run  — manually trigger alert engine
router.post('/run', (req, res) => {
  const created = runAlertEngine(req.body.month);
  res.json({ created });
});

module.exports = router;
