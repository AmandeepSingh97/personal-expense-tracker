const express  = require('express');
const multer   = require('multer');
const crypto   = require('crypto');
const path     = require('path');
const db       = require('../db');
const { parseExcel, parseCsv, parseText } = require('../services/fileParser');
const { categorizeAll }       = require('../services/categorizer');
const { runAlertEngine }      = require('../services/alertEngine');
const { parsePdfAsTable }     = require('../services/pdfExtractor');
const { splitAllJointExpenses } = require('../services/jointExpenseSplitter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function dedupHash(date, description, amount) {
  return crypto.createHash('sha256').update(`${date}|${description}|${amount}`).digest('hex');
}

function normalizeDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  const str = String(raw).trim();
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

function normalizeAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const num = parseFloat(String(raw).replace(/[,\s₹]/g, '').trim());
  return isNaN(num) ? null : num;
}

async function parseFileOrText(file, text) {
  if (file) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') return parsePdfAsTable(file.buffer);
    if (ext === '.csv') return parseCsv(file.buffer.toString('utf-8'));
    if (['.xlsx', '.xls'].includes(ext)) return parseExcel(file.buffer);
    throw new Error('Unsupported file type');
  }
  if (text) return parseText(text);
  throw new Error('No file or text provided');
}

// POST /api/import/preview
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    const parsed = await parseFileOrText(req.file, req.body.text);
    res.json({ headers: parsed.headers, preview: parsed.rows.slice(0,5), totalRows: parsed.rows.length, isPdfParsed: parsed.isPdfParsed });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/import/column-mapping/:accountName
router.get('/column-mapping/:accountName', async (req, res) => {
  try {
    const row = await db.queryOne('SELECT mapping FROM account_column_mappings WHERE account_name=?', [req.params.accountName]);
    res.json(row ? row.mapping : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import/column-mapping
router.post('/column-mapping', async (req, res) => {
  try {
    const { account_name, mapping } = req.body;
    if (!account_name || !mapping) return res.status(400).json({ error: 'Missing fields' });
    await db.run(`
      INSERT INTO account_column_mappings (account_name, mapping, updated_at)
      VALUES (?, ?, NOW())
      ON CONFLICT(account_name) DO UPDATE SET mapping=EXCLUDED.mapping, updated_at=EXCLUDED.updated_at`,
      [account_name, JSON.stringify(mapping)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import/transactions — full import pipeline
router.post('/transactions', upload.single('file'), async (req, res) => {
  try {
    const { account_name, mapping: mappingRaw, text } = req.body;
    if (!account_name) return res.status(400).json({ error: 'account_name required' });

    const mapping = typeof mappingRaw === 'string' ? JSON.parse(mappingRaw) : mappingRaw;
    const parsed  = await parseFileOrText(req.file, text);
    const filename = req.file ? req.file.originalname : 'pasted_text';

    // Build normalized rows
    const normalized = [];
    for (const row of parsed.rows) {
      const date        = normalizeDate(row[mapping.date]);
      const description = String(row[mapping.description] || '').trim();
      let amount;
      if (mapping.amount) {
        amount = normalizeAmount(row[mapping.amount]);
      } else if (mapping.debit && mapping.credit) {
        const debit  = normalizeAmount(row[mapping.debit])  || 0;
        const credit = normalizeAmount(row[mapping.credit]) || 0;
        amount = credit - debit;
      }
      if (!date || !description || amount === null || amount === undefined) continue;
      normalized.push({ date, description, amount, raw_text: JSON.stringify(row) });
    }

    // Create import batch
    const batchResult = await db.run(
      `INSERT INTO import_batches (filename, account_name, row_count) VALUES (?,?,?) RETURNING id`,
      [filename, account_name, normalized.length]);
    const batchId = batchResult.lastInsertRowid;

    // Insert non-duplicate transactions
    let inserted = 0;
    const toInsert = [];
    for (const row of normalized) {
      const hash   = dedupHash(row.date, row.description, row.amount);
      const result = await db.run(`
        INSERT INTO transactions (date,description,amount,account_name,import_batch_id,dedup_hash,raw_text)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(dedup_hash) DO NOTHING RETURNING id`,
        [row.date, row.description, row.amount, account_name, batchId, hash, row.raw_text]);
      if (result.changes > 0) {
        inserted++;
        toInsert.push({ id: result.lastInsertRowid, description: row.description, amount: row.amount });
      }
    }

    // Apply known corrections first
    const corrections = await db.query('SELECT * FROM category_corrections');
    for (const corr of corrections) {
      const pattern = corr.description_pattern.toLowerCase();
      const affected = toInsert.filter(t => t.description.toLowerCase().includes(pattern));
      for (const tx of affected) {
        await db.run(`UPDATE transactions SET category=?,sub_category=?,manually_corrected=1 WHERE id=?`,
          [corr.correct_category, corr.correct_sub_category, tx.id]);
        const idx = toInsert.indexOf(tx);
        if (idx !== -1) toInsert.splice(idx, 1);
      }
    }

    // Categorize with rules (+ Claude if available)
    let categorized = 0;
    if (toInsert.length > 0) {
      const results = await categorizeAll(toInsert);
      for (const r of results) {
        await db.run(`UPDATE transactions SET category=?,sub_category=?,merchant_name=?,is_recurring=?,is_transfer=?,is_investment=?,confidence_score=? WHERE id=?`,
          [r.category, r.sub_category, r.merchant_name, r.is_recurring?1:0, r.is_transfer?1:0, r.is_investment?1:0, r.confidence, r.id]);
        if (r.category !== 'Uncategorized') categorized++;
      }
    }

    // Split joint expenses
    const splits = await splitAllJointExpenses();
    if (splits > 0) categorized += splits;

    await runAlertEngine();

    res.json({ batchId, totalParsed: normalized.length, inserted, skipped: normalized.length - inserted, categorized });
  } catch (e) {
    console.error('Import error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
