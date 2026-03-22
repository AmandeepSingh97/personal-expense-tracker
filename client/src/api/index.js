import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Transactions
export const getTransactions = (params) => api.get('/transactions', { params }).then((r) => r.data);
export const getSummary = (params) => api.get('/transactions/summary', { params }).then((r) => r.data);
export const getMonthlyTrend = (params) => api.get('/transactions/monthly-trend', { params }).then((r) => r.data);
export const getRecurring = () => api.get('/transactions/recurring').then((r) => r.data);
export const createTransaction = (data) => api.post('/transactions', data).then((r) => r.data);
export const updateTransaction = (id, data) => api.patch(`/transactions/${id}`, data).then((r) => r.data);
export const bulkCategorize = (data) => api.patch('/transactions/bulk/categorize', data).then((r) => r.data);
export const getExportUrl = (params) => {
  const qs = new URLSearchParams(params).toString();
  return `/api/transactions/export?${qs}`;
};

// Budgets
export const getBudgets = () => api.get('/budgets').then((r) => r.data);
export const getBudgetUtilization = (params) =>
  api.get('/budgets/utilization/current', { params }).then((r) => r.data);
export const upsertBudget = (category, data) => api.put(`/budgets/${category}`, data).then((r) => r.data);
export const deleteBudget = (category) => api.delete(`/budgets/${category}`).then((r) => r.data);

// Alerts
export const getAlerts = () => api.get('/alerts').then((r) => r.data);
export const dismissAlert = (id) => api.post(`/alerts/${id}/dismiss`).then((r) => r.data);
export const dismissAllAlerts = () => api.post('/alerts/dismiss-all').then((r) => r.data);

// Import
export const previewFile = (formData) =>
  api.post('/import/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const previewText = (text) => api.post('/import/preview', { text }).then((r) => r.data);
export const importTransactions = (formData) =>
  api.post('/import/transactions', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const getColumnMapping = (accountName) =>
  api.get(`/import/column-mapping/${encodeURIComponent(accountName)}`).then((r) => r.data);
export const saveColumnMapping = (data) => api.post('/import/column-mapping', data).then((r) => r.data);

// Insights
export const getInsights = (month) => api.get(`/insights/${month}`).then((r) => r.data);

// Accounts
export const getAccounts = () => api.get('/accounts').then((r) => r.data);
export const getAccountsSummary = () => api.get('/accounts/summary').then((r) => r.data);
export const getAccountsHistory = (params) => api.get('/accounts/history', { params }).then((r) => r.data);
export const getAccountsAnalytics = (params) => api.get('/accounts/analytics', { params }).then((r) => r.data);
export const createAccount = (data) => api.post('/accounts', data).then((r) => r.data);
export const updateAccount = (id, data) => api.patch(`/accounts/${id}`, data).then((r) => r.data);
export const deleteAccount = (id) => api.delete(`/accounts/${id}`).then((r) => r.data);
export const getImportBatches = () => api.get('/accounts/batches').then((r) => r.data);

// Categories (dynamic — built-in + custom)
export const getCategories = () => api.get('/categories').then((r) => r.data);
export const createCategory = (data) => api.post('/categories', data).then((r) => r.data);
export const deleteCategory = (name) => api.delete(`/categories/${encodeURIComponent(name)}`).then((r) => r.data);

// Tags
export const getTags = () => api.get('/tags').then((r) => r.data);
export const createTag = (data) => api.post('/tags', data).then((r) => r.data);
export const deleteTag = (id) => api.delete(`/tags/${id}`).then((r) => r.data);
export const getTagsForTx = (txId) => api.get(`/tags/for/${txId}`).then((r) => r.data);
export const addTagToTx = (txId, data) => api.post(`/tags/for/${txId}`, data).then((r) => r.data);
export const removeTagFromTx = (txId, tagId) => api.delete(`/tags/for/${txId}/${tagId}`).then((r) => r.data);
export const getTagSummary = (params) => api.get('/tags/summary/by-period', { params }).then((r) => r.data);
