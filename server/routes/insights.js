const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const PERIOD = periodExpr('date');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/insights/:month  — AI-generated monthly insights
router.get('/:month', async (req, res) => {
  const db = getDb();
  const { month } = req.params; // YYYY-MM

  // Get current month aggregates
  const current = db
    .prepare(
      `SELECT category,
              ROUND(SUM(ABS(amount)), 2) as total,
              COUNT(*) as count
       FROM transactions
       WHERE (${PERIOD}) = ?
         AND is_transfer = 0
         AND amount < 0
       GROUP BY category
       ORDER BY total DESC`
    )
    .all(month);

  // Get previous month
  const [year, mon] = month.split('-').map(Number);
  const prevDate = new Date(year, mon - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const previous = db
    .prepare(
      `SELECT category, ROUND(SUM(ABS(amount)), 2) as total
       FROM transactions
       WHERE (${PERIOD}) = ?
         AND is_transfer = 0
         AND amount < 0
       GROUP BY category`
    )
    .all(prevMonth);

  const prevMap = Object.fromEntries(previous.map((r) => [r.category, r.total]));

  const enriched = current.map((r) => ({
    ...r,
    prev_total: prevMap[r.category] || 0,
    delta_pct: prevMap[r.category]
      ? Math.round(((r.total - prevMap[r.category]) / prevMap[r.category]) * 100)
      : null,
  }));

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ month, insights: ['Add ANTHROPIC_API_KEY to .env to enable AI insights.'], data: enriched });
  }

  try {
    const prompt = `You are a personal finance advisor. Analyze the following spending data for ${month} and provide 4-5 concise, actionable insights in plain text bullet points. Focus on notable changes, overspending risks, and positive patterns. Keep each bullet to 1-2 sentences.

Spending data (amounts in INR):
${JSON.stringify(enriched, null, 2)}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const insights = text
      .split('\n')
      .map((l) => l.replace(/^[\-\*•]\s*/, '').trim())
      .filter(Boolean);

    res.json({ month, insights, data: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
