const { categorizeAllRules } = require('./ruleBasedCategorizer');

// Claude is optional — only used when ANTHROPIC_API_KEY is set and valid.
let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {}

const SYSTEM_PROMPT = `You are a financial transaction categorizer for Indian bank statements.

Categorize each transaction into the following taxonomy:
- Housing: Rent, Maintenance, Utilities
- Food: Groceries, Dining Out, Food Delivery, Coffee
- Transport: Fuel, Cab/Auto, Metro, Parking, Car EMI
- Health: Pharmacy, Doctor, Insurance, Gym
- Shopping: Clothing, Electronics, Home Goods, Personal Care
- Entertainment: OTT Subscriptions, Movies, Events
- Education: Courses, Books, School Fees
- Finance: EMI, Loan Repayment, Credit Card Bill, Investments, SIP
- Family: Kids, Parents Transfer, Gifts
- Travel: Flights, Hotels, Holidays
- Transfers: Internal transfers between own accounts (NEFT/IMPS/UPI to self)
- Uncategorized: When genuinely unclear

Indian context: UPI/NEFT/IMPS = payment methods. Swiggy/Zomato = Food Delivery.
Ola/Uber/Rapido = Cab/Auto. BigBasket/Blinkit/Zepto = Groceries.
Netflix/Prime/Hotstar = OTT Subscriptions. SIP/Zerodha/Groww = Finance.
SALARY credit = Income. is_transfer=true only for own-account transfers.
is_recurring=true for subscriptions/EMIs/SIPs/rent.
confidence: 0.0-1.0. merchant_name: clean brand name.
Return ONLY a JSON array, no prose, no markdown.

Output: [{"id":"<id>","category":"<cat>","sub_category":"<sub>","merchant_name":"<merchant>","is_recurring":<bool>,"is_transfer":<bool>,"confidence":<float>}]`;

async function categorizeBatchClaude(client, transactions) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JSON.stringify(transactions.map((t) => ({ id: t.id, description: t.description, amount: t.amount }))),
    }],
  });
  const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(raw);
}

async function categorizeAll(transactions) {
  // Always start with rule-based for speed and reliability
  const ruleResults = categorizeAllRules(transactions);

  // If no API key, return rule-based results immediately
  if (!process.env.ANTHROPIC_API_KEY || !Anthropic) {
    return ruleResults;
  }

  // Use Claude to improve only the ones that rule-based left as Uncategorized
  const uncategorized = transactions.filter((t, i) => ruleResults[i].category === 'Uncategorized');
  if (uncategorized.length === 0) return ruleResults;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const BATCH_SIZE = 50;
  const improved = {};

  for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
    const batch = uncategorized.slice(i, i + BATCH_SIZE);
    try {
      const claudeResults = await categorizeBatchClaude(client, batch);
      claudeResults.forEach((r) => { improved[r.id] = r; });
    } catch (err) {
      // Credit exhausted or other API error — rule-based is fine
      console.warn('Claude categorization skipped:', err.message);
      break;
    }
  }

  // Merge: use Claude result where available, else keep rule-based
  return ruleResults.map((r) => improved[r.id] || r);
}

module.exports = { categorizeAll };
