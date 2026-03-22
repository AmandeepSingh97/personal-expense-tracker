const XLSX = require('xlsx');
const Papa = require('papaparse');

function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => String(h).trim());
  const dataRows = rows.slice(1).map((row) =>
    headers.reduce((obj, h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
      return obj;
    }, {})
  );

  return { headers, rows: dataRows };
}

function parseCsv(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    trimHeaders: true,
  });

  const headers = result.meta.fields || [];
  return { headers, rows: result.data };
}

function parseText(text) {
  // Try CSV first, then fall back to tab-separated
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const result = Papa.parse(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  });

  return { headers: result.meta.fields || [], rows: result.data };
}

module.exports = { parseExcel, parseCsv, parseText };
