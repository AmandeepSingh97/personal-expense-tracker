require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDb } = require('./db');
const transactionsRouter = require('./routes/transactions');
const tagsRouter = require('./routes/tags');
const categoriesRouter = require('./routes/categories');
const investmentsRouter = require('./routes/investments');
const budgetsRouter = require('./routes/budgets');
const importRouter = require('./routes/import');
const alertsRouter = require('./routes/alerts');
const insightsRouter = require('./routes/insights');
const accountsRouter = require('./routes/accounts');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize DB on startup
getDb();

app.use('/api/transactions', transactionsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/investments', investmentsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/import', importRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/accounts', accountsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
