# Personal Expense Tracker

A full-stack personal finance tool that uses AI to automatically categorize your bank transactions.

## Features

- **Import**: Drag-and-drop `.xlsx`, `.xls`, `.csv` files or paste text from your bank portal
- **AI Categorization**: Claude API categorizes every transaction automatically (Food, Transport, Housing, etc.)
- **Dashboard**: Spending trends, category breakdown, recurring expenses
- **Budgets**: Set monthly limits per category with 80%/100% alerts
- **Transactions**: Filter, search, bulk-edit, export to CSV
- **Monthly Review**: Side-by-side comparison with AI-generated insights
- **Accounts**: Track multiple bank accounts

## Setup

### 1. Clone and install

```bash
cd expense-tracker
npm install
npm run install:all
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

Get your API key at [console.anthropic.com](https://console.anthropic.com).

### 3. Run

```bash
npm run dev
```

Opens:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Quick Start with Sample Data

1. Go to **Import** page
2. Upload `sample-data/sample_transactions.csv`
3. Set Account Name: `HDFC Salary`
4. Map columns:
   - Date → `Date`
   - Description → `Description`
   - Debit → `Debit`
   - Credit → `Credit`
5. Click **Import & Categorize with AI**

## Importing Your Bank Statement

Most Indian banks let you download statements as Excel/CSV from net banking:

| Bank | How to download |
|------|----------------|
| HDFC | Net Banking → Accounts → Statement → Excel |
| ICICI | Net Banking → Account Statement → Download |
| Axis | Net Banking → Accounts → e-Statement |
| SBI | YONO App → Account → Statement → Download |
| Kotak | Net Banking → Account → Statement |

**Column mapping tips:**
- HDFC usually has `Date`, `Narration`, `Debit Amount`, `Credit Amount`
- ICICI usually has `Transaction Date`, `Transaction Remarks`, `Withdrawal Amt`, `Deposit Amt`
- The app remembers your column mapping per account name for future imports

## PDF Statements

PDF statements are not directly supported. To use them:
1. Open the PDF in your browser
2. Select all text (Ctrl+A) and copy
3. Paste into the text area on the Import page

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + Recharts
- **Backend**: Node.js + Express
- **Database**: SQLite (stored locally as `server/expense_tracker.db`)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **File Parsing**: SheetJS (Excel), PapaParse (CSV)

## Project Structure

```
expense-tracker/
├── client/          # React frontend (Vite)
├── server/          # Express backend
│   ├── routes/      # API endpoints
│   ├── services/    # Claude API, file parsing, alert engine
│   └── db.js        # SQLite schema + migrations
├── sample-data/     # Sample Indian bank transactions
└── .env             # Your API keys (not committed)
```
