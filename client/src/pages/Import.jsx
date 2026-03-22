import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, FileText, X, CheckCircle, Loader2, FileSearch } from 'lucide-react';
import { previewFile, previewText, importTransactions, getColumnMapping, saveColumnMapping } from '../api';
import ColumnMapper from '../components/ColumnMapper';

const STEPS = { UPLOAD: 'upload', MAPPING: 'mapping', IMPORTING: 'importing', DONE: 'done' };

function isPdf(file) {
  return file && file.name.toLowerCase().endsWith('.pdf');
}

export default function Import() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState('');
  const [accountName, setAccountName] = useState('');
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handlePreview = async () => {
    if (!accountName.trim()) { toast.error('Enter account name first'); return; }
    try {
      let data;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        data = await previewFile(fd);
      } else if (pastedText.trim()) {
        data = await previewText(pastedText);
      } else {
        toast.error('Please upload a file or paste text'); return;
      }

      if (!data.headers || data.headers.length === 0) {
        toast.error('Could not detect columns. Try a different file or paste the data as text.');
        return;
      }

      setPreview(data);

      // For PDFs, the smart parser already produces known column names — auto-fill mapping
      if (data.isPdfParsed) {
        setMapping({
          date: 'Date',
          description: 'Transaction Remarks',
          debit: 'Withdrawal Amount',
          credit: 'Deposit Amount',
        });
      } else {
        const saved = await getColumnMapping(accountName);
        if (saved) setMapping(saved);
      }
      setStep(STEPS.MAPPING);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Preview failed');
    }
  };

  const handleImport = async () => {
    const isValid = mapping.date && mapping.description && (mapping.amount || (mapping.debit && mapping.credit));
    if (!isValid) { toast.error('Complete the column mapping first'); return; }
    setStep(STEPS.IMPORTING);
    try {
      await saveColumnMapping({ account_name: accountName, mapping });
      const fd = new FormData();
      fd.append('account_name', accountName);
      fd.append('mapping', JSON.stringify(mapping));
      if (file) fd.append('file', file);
      else fd.append('text', pastedText);
      const res = await importTransactions(fd);
      setResult(res);
      setStep(STEPS.DONE);
      toast.success(`Imported ${res.inserted} transactions`);
    } catch (err) {
      setStep(STEPS.MAPPING);
      toast.error(err.response?.data?.error || 'Import failed');
    }
  };

  const reset = () => {
    setStep(STEPS.UPLOAD); setFile(null); setPastedText('');
    setPreview(null); setMapping({}); setResult(null);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Import Transactions</h1>

      {/* ── UPLOAD ─────────────────────────────────────────────────────────── */}
      {step === STEPS.UPLOAD && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Name
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Salary, ICICI Credit Card"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className={isPdf(file) ? 'text-red-500' : 'text-blue-500'} size={24} />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mx-auto text-gray-400 mb-3" size={40} />
                <p className="text-gray-600 dark:text-gray-400 font-medium">Drag & drop or click to upload</p>
                <p className="text-sm text-gray-500 mt-1">.xlsx, .xls, .csv, .pdf supported</p>
              </>
            )}
          </div>

          {/* PDF hint */}
          {file && isPdf(file) && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              <FileSearch size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                PDF detected. We'll extract the text and let you map the columns — no AI needed.
                If column detection looks off, copy-paste the statement text into the box below instead.
              </span>
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative text-center">
              <span className="bg-gray-50 dark:bg-gray-950 px-3 text-sm text-gray-500">or paste text</span>
            </div>
          </div>

          <textarea
            rows={6}
            placeholder="Paste CSV / tab-separated data from your bank portal or copied from a PDF..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-none"
          />

          <button
            onClick={handlePreview}
            disabled={!accountName || (!file && !pastedText.trim())}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            Preview & Map Columns
          </button>
        </div>
      )}

      {/* ── MAPPING ────────────────────────────────────────────────────────── */}
      {step === STEPS.MAPPING && preview && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Map Columns</h2>
              <p className="text-sm text-gray-500">{preview.totalRows} rows in <strong>{accountName}</strong></p>
            </div>
            <button onClick={reset} className="text-sm text-gray-500 hover:text-red-500">Start over</button>
          </div>
          <ColumnMapper
            headers={preview.headers}
            preview={preview.preview}
            initialMapping={mapping}
            onChange={setMapping}
          />
          <button
            onClick={handleImport}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            Import & Categorize
          </button>
        </div>
      )}

      {/* ── IMPORTING ──────────────────────────────────────────────────────── */}
      {step === STEPS.IMPORTING && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-blue-500" size={48} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Importing & categorizing...</h2>
          <p className="text-sm text-gray-500">Matching transactions against known merchants.</p>
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────────────────── */}
      {step === STEPS.DONE && result && (
        <div className="flex flex-col items-center py-16 gap-6">
          <CheckCircle className="text-green-500" size={64} />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Import Complete!</h2>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">{result.inserted}</div>
              <div className="text-sm text-gray-500">Imported</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-400">{result.skipped}</div>
              <div className="text-sm text-gray-500">Skipped (dupes)</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">{result.categorized}</div>
              <div className="text-sm text-gray-500">Categorized</div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              View Dashboard
            </button>
            <button
              onClick={reset}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
