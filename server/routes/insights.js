const express  = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');
const { periodExpr } = require('../utils/budgetPeriod');

const router = express.Router();
const PERIOD = periodExpr('date');

router.get('/:month', async (req, res) => {
  try {
    const { month } = req.params;

    const current = await db.query(`
      SELECT category, ROUND(SUM(ABS(amount)),2) as total, COUNT(*)::int as count
      FROM transactions WHERE (${PERIOD})=? AND is_transfer=0 AND amount<0
      GROUP BY category ORDER BY total DESC`, [month]);

    const [y, mon] = month.split('-').map(Number);
    const prevDate = new Date(y, mon - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;

    const previous = await db.query(`
      SELECT category, ROUND(SUM(ABS(amount)),2) as total
      FROM transactions WHERE (${PERIOD})=? AND is_transfer=0 AND amount<0
      GROUP BY category`, [prevMonth]);

    const prevMap = Object.fromEntries(previous.map(r => [r.category, Number(r.total)]));
    const enriched = current.map(r => ({
      ...r, total: Number(r.total),
      prev_total: prevMap[r.category] || 0,
      delta_pct: prevMap[r.category] ? Math.round(((Number(r.total) - prevMap[r.category]) / prevMap[r.category]) * 100) : null,
    }));

    if (!process.env.ANTHROPIC_API_KEY)
      return res.json({ month, insights: ['Add ANTHROPIC_API_KEY to .env to enable AI insights.'], data: enriched });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1024,
      messages: [{ role: 'user', content: `You are a personal finance advisor. Analyze spending for ${month} and provide 4-5 concise bullet points. Data (INR):\n${JSON.stringify(enriched, null, 2)}` }],
    });
    const insights = response.content[0].text.split('\n').map(l => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean);
    res.json({ month, insights, data: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
