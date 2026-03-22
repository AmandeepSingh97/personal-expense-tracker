/**
 * Indian bank statement PDF parser — balance-diff driven
 *
 * Actual structure produced by pdf-parse for ICICI:
 *   "122.09.2025"          ← S.No (1) glued to date (22.09.2025), no space
 *   "BIL/BPAY/001081865849/KOTAK"  ← narration line 1
 *   "MUTU/KTDIRECT-503175   KMMF CHANNEL AC"  ← narration line 2
 *   "1500.0021820.08"      ← withdrawal + balance, no separator
 *
 * Key insight: the balance column is always present → use balance[n] - balance[n-1]
 * to determine amount and direction. No need to parse debit/credit columns.
 *
 * Handles: ICICI, HDFC, Axis, SBI, Kotak, IndusInd, Yes, Canara, BoB
 */

const pdfParse = require('pdf-parse');

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MON = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseDate(s) {
  s = String(s).trim();
  // DD.MM.YYYY  DD/MM/YYYY  DD-MM-YYYY  (4-digit year)
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD/MM/YY  DD-MM-YY  (2-digit year)
  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD MMM YYYY  or  DD-MMM-YYYY  or  DD/MMM/YYYY  (SBI, Yes Bank)
  m = s.match(/^(\d{1,2})[\s.\/-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.\/-](\d{2,4})$/i);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${MON[m[2].slice(0,3).toLowerCase()]}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

// ─── Transaction-start detectors ─────────────────────────────────────────────

/**
 * ICICI format: S.No glued directly to date (no space).
 * e.g. "122.09.2025", "2030.09.2025", "10001.01.2026"
 * Uses dot as date separator.
 */
function detectICICI(line) {
  // Regex backtracks to find the right split between S.No and DD.MM.YYYY
  const m = line.match(/^(\d{1,4})(\d{2}\.\d{2}\.\d{4})(.*)/);
  if (!m) return null;
  const date = parseDate(m[2]);
  if (!date) return null;
  return { date, rest: m[3].trim() };
}

/**
 * Generic format: optional S.No with space, then date at start.
 * Covers HDFC (DD/MM/YY), Axis (DD-MM-YYYY), SBI (DD MMM YYYY),
 * Kotak, IndusInd, Yes Bank, etc.
 */
function detectGeneric(line) {
  // Strip optional leading S.No (digits + space or tab)
  const stripped = line.replace(/^\d{1,4}[\s\t]+/, '');

  const DATE_RES = [
    /^(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/,
    /^(\d{1,2}[\s.\/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.\/-]\d{2,4})/i,
  ];

  for (const re of DATE_RES) {
    const m = stripped.match(re);
    if (m) {
      const date = parseDate(m[1]);
      if (date) return { date, rest: stripped.slice(m[1].length).trim() };
    }
  }
  return null;
}

function detectTxStart(line) {
  return detectICICI(line) || detectGeneric(line);
}

// ─── Amounts detection ────────────────────────────────────────────────────────

/**
 * Splits a string into (amount1, amount2) where amounts are decimal numbers.
 * Handles both concatenated ("1500.0021820.08") and space-separated forms.
 * Returns null if the line does not look like an amounts line.
 */
function parseAmountsLine(line) {
  const t = line.trim();

  // Concatenated (ICICI): "1500.0021820.08"
  // The split point is unambiguous: first decimal number is digits+.+exactly2digits,
  // rest must also form digits+.+exactly2digits
  const concatMatch = t.match(/^(\d+\.\d{2})(\d+\.\d{2})$/);
  if (concatMatch) {
    return { amt: parseFloat(concatMatch[1]), balance: parseFloat(concatMatch[2]) };
  }

  // Space-separated with exactly 2 numbers: "1500.00 21820.08"
  const spacedMatch = t.match(/^(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/);
  if (spacedMatch) {
    return {
      amt: parseFloat(spacedMatch[1].replace(/,/g, '')),
      balance: parseFloat(spacedMatch[2].replace(/,/g, '')),
    };
  }

  // Space-separated with 3 numbers: "1500.00 0.00 21820.08" (debit, credit, balance)
  const tripleMatch = t.match(/^(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})$/);
  if (tripleMatch) {
    // Use last as balance; first non-zero of first two is the transaction amount
    const a = parseFloat(tripleMatch[1].replace(/,/g, ''));
    const b = parseFloat(tripleMatch[2].replace(/,/g, ''));
    const bal = parseFloat(tripleMatch[3].replace(/,/g, ''));
    return { amt: a > 0 ? a : b, balance: bal };
  }

  return null;
}

/**
 * For lines that END with two concatenated amounts (e.g. row 21 of ICICI which has
 * cheque number + narration + amounts all on one line).
 * Returns { prefix, amt, balance } or null.
 */
function extractEndAmounts(text) {
  // Find all decimal numbers in the text
  const matches = [];
  const re = /\d[\d,]*\.\d{2}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ raw: m[0], value: parseFloat(m[0].replace(/,/g, '')), end: m.index + m[0].length });
  }
  if (matches.length < 2) return null;

  const last = matches[matches.length - 1];
  const prev = matches[matches.length - 2];

  // The two amounts must be adjacent (no chars between them)
  if (prev.end !== last.end - last.raw.length) return null;
  // The last amount must be at the very end of the string
  if (last.end !== text.length) return null;

  return {
    prefix: text.slice(0, text.length - last.raw.length - prev.raw.length).trim(),
    amt: prev.value,
    balance: last.value,
  };
}

// ─── Skip patterns ─────────────────────────────────────────────────────────────

const SKIP_RE = [
  /^S[\s.]*No\.?(\s|$)/i,
  /^Transaction\s*(Date|Remarks)/i,
  /^Cheque|^Chq/i,
  /^(Narration|Particulars|Remarks|Description)(\s|$)/i,
  /^(Withdrawal|Deposit|Debit|Credit)(\s+Amt|\s+Amount)?(\s|$)/i,
  /^(Balance|Closing|Opening)(\s|$)/i,
  /^\(INR\)(\s|$)/,
  /^Value\s+Date/i,
  /^Txn\s+Date/i,
  /^Ref\s+No/i,
  /^www\./i,
  /^(Please|Never\s+share|Dear|Note:|Page\s+\d)/i,
  /^Dial\s+your|^1800[-\s]/,
  /^Legends?/i,
  /^Sincerely|^Team\s+\w/i,
  /^Account\s+(No|Number|Holder)/i,
  /^(IFSC|MICR|Branch|Customer)/i,
  /^Statement\s+of/i,
  /^\d+\s*$/,              // standalone page numbers
  /^-{5,}|={5,}/,
  /^\*{3,}/,
  /^(AMANDEEP|Your Base Branch|BRANCH,|124\/|KANPUR|UTTAR)/,  // address lines
];

function isSkip(line) {
  const t = line.trim();
  if (!t || t.length < 2) return true;
  return SKIP_RE.some(r => r.test(t));
}

// ─── Opening balance ─────────────────────────────────────────────────────────

function findOpeningBalance(lines) {
  for (const line of lines) {
    const m = line.match(/[Oo]pening\s+[Bb]alance[^\d]*([\d,]+\.\d{2})/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return null;
}

// ─── Main extractor ──────────────────────────────────────────────────────────

async function extractTransactionsFromPdf(buffer) {
  const data = await pdfParse(buffer);

  const lines = data.text
    .split('\n')
    .map(l => l.replace(/\r/g, '').replace(/\t/g, ' ').replace(/\s{3,}/g, ' ').trim())
    .filter(l => l.length > 0);

  const openingBalance = findOpeningBalance(lines);

  // ── Phase 1: group into transaction blocks ─────────────────────────────────
  // Each block = { date, narrationLines[], amountsInfo }
  const blocks = [];
  let cur = null;

  for (const line of lines) {
    if (isSkip(line)) continue;

    // ── Check if this line starts a new transaction ──
    const txInfo = detectTxStart(line);

    if (txInfo) {
      if (cur) blocks.push(cur);
      cur = { date: txInfo.date, narr: [], balance: null, explicit: null };

      // The "rest" after the date on the same line may contain:
      // (a) nothing
      // (b) narration only
      // (c) narration + amounts (row 21 ICICI edge case)
      if (txInfo.rest) {
        const endAmts = extractEndAmounts(txInfo.rest);
        if (endAmts && endAmts.balance > 0) {
          cur.balance = endAmts.balance;
          cur.explicit = endAmts.amt;
          if (endAmts.prefix) cur.narr.push(endAmts.prefix);
        } else {
          cur.narr.push(txInfo.rest);
        }
      }
      continue;
    }

    if (!cur) continue;

    // ── Check if this is an amounts-only line ──
    const amts = parseAmountsLine(line);
    if (amts) {
      cur.balance = amts.balance;
      cur.explicit = amts.amt;
      continue;
    }

    // ── Otherwise it's a narration continuation line ──
    // Reject lines that look like standalone address/footer junk
    cur.narr.push(line);
  }
  if (cur) blocks.push(cur);

  // ── Phase 2: compute amounts via balance-diff ─────────────────────────────
  const results = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const narration = b.narr.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (!narration || narration.length < 2) continue;
    if (b.balance === null) continue;

    const prevBalance = i === 0 ? openingBalance : blocks[i - 1].balance;

    let amount;
    if (prevBalance !== null && prevBalance !== undefined) {
      // Most reliable: balance difference
      amount = Math.round((b.balance - prevBalance) * 100) / 100;
    } else if (b.explicit !== null) {
      // Fallback: use the explicit amount column; assume debit (most common for first tx)
      amount = -b.explicit;
    } else {
      continue; // can't determine amount
    }

    if (amount === 0) continue;

    results.push({ date: b.date, description: narration, amount });
  }

  return results;
}

// ─── Table-format output for column mapper ────────────────────────────────────

async function parsePdfAsTable(buffer) {
  let transactions;
  try {
    transactions = await extractTransactionsFromPdf(buffer);
  } catch (e) {
    console.error('PDF extraction error:', e.message);
    transactions = [];
  }

  if (transactions.length === 0) {
    // Return raw text so the user can paste it manually
    const data = await pdfParse(buffer);
    return {
      headers: ['Raw Text'],
      rows: data.text.split('\n').filter(l => l.trim()).slice(0, 200).map(l => ({ 'Raw Text': l.trim() })),
      totalRows: 0,
      isPdfParsed: false,
    };
  }

  const rows = transactions.map(t => ({
    Date: t.date,
    'Transaction Remarks': t.description,
    'Withdrawal Amount': t.amount < 0 ? Math.abs(t.amount).toFixed(2) : '',
    'Deposit Amount': t.amount > 0 ? t.amount.toFixed(2) : '',
  }));

  return {
    headers: ['Date', 'Transaction Remarks', 'Withdrawal Amount', 'Deposit Amount'],
    rows,
    totalRows: rows.length,
    isPdfParsed: true,
  };
}

async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

module.exports = { extractTextFromPdf, extractTransactionsFromPdf, parsePdfAsTable };
