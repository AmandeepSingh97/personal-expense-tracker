// Rule-based categorizer using Amandeep's personal budget categories.
// Rules are checked in order — first match wins.

const RULES = [

  // ── SIPs / Mutual Fund Investments ─────────────────────────────────────────
  { re: /kotak\s*mu(tu|tu|tua)|ktdirect/i,       category: 'SIPs', sub: 'Kotak MF',   merchant: 'Kotak MF',  recurring: true,  is_investment: true },
  { re: /axis\s*mu(tu|tua)|axdr/i,               category: 'SIPs', sub: 'Axis MF',    merchant: 'Axis MF',   recurring: true,  is_investment: true },
  { re: /tata\s*mu(tu|tua)|tamlsipa/i,           category: 'SIPs', sub: 'Tata MF',    merchant: 'Tata MF',   recurring: true,  is_investment: true },
  { re: /mirae\s*mf|bd-mirae|ttaf\d/i,           category: 'SIPs', sub: 'Mirae MF',   merchant: 'Mirae MF',  recurring: true,  is_investment: true },
  { re: /pgim\s*india|pm000000/i,                category: 'SIPs', sub: 'PGIM MF',    merchant: 'PGIM MF',   recurring: true,  is_investment: true },
  { re: /hdfc\s*mutual\s*fund|adcamsicici.*hdfc/i,category:'SIPs', sub: 'HDFC MF',    merchant: 'HDFC MF',   recurring: true,  is_investment: true },
  { re: /mutual\s*fund|\bsip\b|systematic\s*inv/i,category:'SIPs', sub: null,          merchant: null,        recurring: true,  is_investment: true },
  { re: /zerodha|groww|upstox|kuvera|coin\.zerd/i,category:'SIPs', sub: 'Stocks',      merchant: null,        recurring: false, is_investment: true },

  // ── Car Loan EMI ────────────────────────────────────────────────────────────
  { re: /CarEmi\w*|CarFeb\w*|OctCarandSip|car\s*loan\s*emi/i, category: 'Car Loan', sub: null, merchant: null, recurring: true },

  // ── Insurance ───────────────────────────────────────────────────────────────
  { re: /Insurance(?:Oct|Nov|Dec|Jan|Feb|Mar)\w*/i, category: 'Insurance', sub: null, merchant: null, recurring: true },
  { re: /star\s*health|hdfc\s*ergo|niva\s*bupa|care\s*health|bajaj\s*allianz/i, category: 'Insurance', sub: null, merchant: null, recurring: true },

  // ── LIC (investment) ────────────────────────────────────────────────────────
  { re: /\blic\b|life\s*insurance\s*corp/i,      category: 'LIC',          sub: null, merchant: 'LIC',  recurring: true,  is_investment: true },

  // ── PPF (investment) ────────────────────────────────────────────────────────
  { re: /\bppf\b|public\s*provident/i,           category: 'PPF',          sub: null, merchant: null,   recurring: true,  is_investment: true },

  // ── Emergency Cash (savings) ────────────────────────────────────────────────
  { re: /EmgSep|EmgHome\w*|Emergency(?:Oct|Nov|Dec|Jan|Feb|Mar)\w*/i, category: 'Emergency Cash', sub: null, merchant: null, recurring: true, is_investment: true },

  // ── Home Savings (investment) ────────────────────────────────────────────────
  { re: /HomeSav\w*|home\s*savings|Investfeb/i,  category: 'Home Savings', sub: null, merchant: null,   recurring: true,  is_investment: true },

  // ── Holiday ─────────────────────────────────────────────────────────────────
  { re: /Holiday\w*|VacationJan|TravelSep|Travelsep25|PapaVacation/i, category: 'Holiday', sub: null, merchant: null, recurring: true },
  { re: /irctc|railway\s*ticket/i,               category: 'Holiday',  sub: 'Train',      merchant: 'IRCTC',   recurring: false },
  { re: /redbus/i,                               category: 'Holiday',  sub: 'Bus',        merchant: 'redBus',  recurring: false },
  { re: /ixigo/i,                                category: 'Holiday',  sub: 'Travel',     merchant: 'ixigo',   recurring: false },
  { re: /indigo|air\s*india|spicejet|vistara|go\s*air|akasa/i, category: 'Holiday', sub: 'Flight', merchant: null, recurring: false },
  { re: /\boyo\b|makemytrip|goibibo|trivago|yatra/i, category: 'Holiday', sub: 'Hotel', merchant: null, recurring: false },

  // ── Home Savings ────────────────────────────────────────────────────────────
  { re: /HomeSav\w*|home\s*savings/i,            category: 'Home Savings', sub: null, merchant: null, recurring: true },

  // ── Send to Parents ─────────────────────────────────────────────────────────
  { re: /parents?\s*transfer|send.*parents?|ParentsTransfer/i, category: 'Send to Parents', sub: null, merchant: null, recurring: true },
  { re: /ParentsTic\w*/i,                        category: 'Send to Parents', sub: null, merchant: null, recurring: false },

  // ── Preet Badminton ─────────────────────────────────────────────────────────
  { re: /PreetPersonal\w*|Preetpers\w*/i,        category: 'Personal Expenses', sub: 'Preet', merchant: null, recurring: true },
  // (Preet Personal split is handled by seed, individual badminton/beauty from ICICI:)
  { re: /decathlon/i,                            category: 'Preet Badminton', sub: null, merchant: 'Decathlon',    recurring: false },
  { re: /cult\.?fit|cultfit|badminton|sports\s*acad/i, category: 'Preet Badminton', sub: null, merchant: null,    recurring: true  },
  { re: /gold.?s\s*gym|anytime\s*fitness|gym\s*fee/i,  category: 'Preet Badminton', sub: 'Gym', merchant: null,   recurring: true  },

  // ── Preet Beauty Products ───────────────────────────────────────────────────
  { re: /myntra/i,                               category: 'Preet Beauty Products', sub: null, merchant: 'Myntra',  recurring: false },
  { re: /nykaa/i,                                category: 'Preet Beauty Products', sub: null, merchant: 'Nykaa',   recurring: false },
  { re: /\bajio\b/i,                             category: 'Preet Beauty Products', sub: null, merchant: 'AJIO',    recurring: false },
  { re: /lenskart/i,                             category: 'Preet Beauty Products', sub: null, merchant: 'Lenskart',recurring: false },

  // ── Groceries ───────────────────────────────────────────────────────────────
  { re: /bigbasket|bb\s*daily/i,                 category: 'Groceries', sub: null, merchant: 'BigBasket', recurring: false },
  { re: /blinkit/i,                              category: 'Groceries', sub: null, merchant: 'Blinkit',   recurring: false },
  { re: /zepto/i,                                category: 'Groceries', sub: null, merchant: 'Zepto',     recurring: false },
  { re: /jiomart/i,                              category: 'Groceries', sub: null, merchant: 'JioMart',   recurring: false },
  { re: /grofer|dunzo|swiggy\s*instamart/i,      category: 'Groceries', sub: null, merchant: null,        recurring: false },
  { re: /reliance\s*smart|dmart|spencer/i,       category: 'Groceries', sub: null, merchant: null,        recurring: false },

  // ── Outing (dining, delivery, entertainment, cabs) ─────────────────────────
  { re: /swiggy/i,                               category: 'Outing', sub: 'Food Delivery', merchant: 'Swiggy',     recurring: false },
  { re: /zomato|eternal\s*li/i,                  category: 'Personal Expenses', sub: 'Food Delivery', merchant: 'Zomato', recurring: false },
  { re: /dominos|pizza\s*hut|mcdonald|kfc|burger\s*king|haldiram|subway/i, category: 'Outing', sub: 'Dining', merchant: null, recurring: false },
  { re: /starbucks/i,                            category: 'Outing', sub: 'Coffee',        merchant: 'Starbucks',  recurring: false },
  { re: /cafe\s*coffee|ccd/i,                    category: 'Outing', sub: 'Coffee',        merchant: 'CCD',        recurring: false },
  { re: /barbeque\s*nation/i,                    category: 'Outing', sub: 'Dining',        merchant: 'Barbeque Nation', recurring: false },
  { re: /pvr|inox|cinepolis/i,                   category: 'Outing', sub: 'Movies',        merchant: null,         recurring: false },
  { re: /bookmyshow/i,                           category: 'Outing', sub: 'Movies',        merchant: 'BookMyShow', recurring: false },
  { re: /district\.movie|districtapp|orbgen/i,   category: 'Outing', sub: 'Movies',        merchant: 'District',   recurring: false },
  { re: /\/movie\b|[\/\s]movie[\/\s]/i,          category: 'Outing', sub: 'Movies',        merchant: null,         recurring: false },
  { re: /netflix/i,                              category: 'Outing', sub: 'OTT',           merchant: 'Netflix',    recurring: true  },
  { re: /amazon\s*prime|prime\s*video/i,         category: 'Outing', sub: 'OTT',           merchant: 'Amazon Prime',recurring: true  },
  { re: /hotstar|disney/i,                       category: 'Outing', sub: 'OTT',           merchant: 'Hotstar',    recurring: true  },
  { re: /zee5|sony\s*liv|jiocinema|mxplayer/i,   category: 'Outing', sub: 'OTT',           merchant: null,         recurring: true  },
  { re: /spotify/i,                              category: 'Outing', sub: 'OTT',           merchant: 'Spotify',    recurring: true  },
  { re: /youtube\s*premium/i,                    category: 'Outing', sub: 'OTT',           merchant: 'YouTube Premium', recurring: true },
  { re: /\bola\b/i,                              category: 'Outing', sub: 'Cab',           merchant: 'Ola',        recurring: false },
  { re: /\buber\b/i,                             category: 'Outing', sub: 'Cab',           merchant: 'Uber',       recurring: false },
  { re: /rapido/i,                               category: 'Outing', sub: 'Cab',           merchant: 'Rapido',     recurring: false },
  { re: /metro\s*(card|recharge)|bmtc|dmrc|kmrl/i,category:'Outing', sub: 'Metro',         merchant: 'Metro',      recurring: false },

  // ── Petrol ──────────────────────────────────────────────────────────────────
  { re: /indian\s*oil|iocl/i,                    category: 'Petrol', sub: null, merchant: 'Indian Oil', recurring: false },
  { re: /bharat\s*petro|bpcl/i,                  category: 'Petrol', sub: null, merchant: 'BPCL',       recurring: false },
  { re: /hp\s*petrol|hpcl/i,                     category: 'Petrol', sub: null, merchant: 'HPCL',       recurring: false },
  { re: /shell\s*petrol/i,                       category: 'Petrol', sub: null, merchant: 'Shell',      recurring: false },
  { re: /fuel|petrol\s*pump/i,                   category: 'Petrol', sub: null, merchant: null,         recurring: false },

  // ── Electricity (all utilities) ─────────────────────────────────────────────
  { re: /bescom|tata\s*power|bses|adani\s*electric|msedcl|tneb|electricity/i, category: 'Electricity', sub: null, merchant: null, recurring: true },
  // WiFi bills — airtel.payu / airtel-billpay are actual broadband bills (NOT Airtel Pay gateway)
  { re: /airtel[._-](?:payu|billpay|broadband|fiber)|act\s*broadband|airtel\s*bro/i, category: 'WiFi', sub: null, merchant: 'Airtel', recurring: true },
  { re: /jiofiber|jio[\s._-]*fiber|bsnl\s*broadband/i, category: 'WiFi', sub: null, merchant: 'Jio Fiber', recurring: true },
  { re: /myjio|reliancejio/i,                     category: 'Personal Expenses', sub: 'Mobile Recharge', merchant: 'Jio', recurring: true },
  { re: /piped\s*gas|mahanagar\s*gas|igl\b|mgl\b/i, category: 'Electricity', sub: 'Gas',  merchant: null,     recurring: true  },
  { re: /water\s*bill|bbmp|municipal/i,           category: 'Electricity', sub: 'Water',   merchant: null,     recurring: true  },

  // ── Rent (monthly rent allocation) ─────────────────────────────────────────
  { re: /house\s*rent|\brent\b/i,                category: 'Rent',     sub: null, merchant: null, recurring: true },

  // ── Maid ────────────────────────────────────────────────────────────────────
  // NOZIR AHME = car cleaning (₹900/month)
  { re: /nozir\s*ahme|7305458221/i,              category: 'Petrol',   sub: 'Car Cleaning', merchant: 'Car Cleaning', recurring: true },
  // 4S VENTURE = car service
  { re: /4s\s*venture/i,                         category: 'Petrol',   sub: 'Car Service',  merchant: '4S Venture',  recurring: false },
  { re: /maid\s*salary|house\s*help|house\s*maid/i, category: 'Maid', sub: null, merchant: null,   recurring: true },

  // ── Cylinder ────────────────────────────────────────────────────────────────
  { re: /suwa\s*suwa|9591161509/i,               category: 'Cylinder', sub: null, merchant: 'Gas Cylinder', recurring: true },

  // ── Cook ────────────────────────────────────────────────────────────────────
  // AKKA TIFFI = cook/tiffin (140/month)
  { re: /akka\s*tiffi|tiffin|cook\s*salary/i,    category: 'Cook',     sub: null, merchant: null, recurring: true },

  // ── Personal Expenses (general shopping, misc) ──────────────────────────────
  { re: /\bamazon\b(?!\s*prime)/i,               category: 'Personal Expenses', sub: null, merchant: 'Amazon',    recurring: false },
  { re: /flipkart/i,                             category: 'Personal Expenses', sub: null, merchant: 'Flipkart',  recurring: false },
  { re: /meesho/i,                               category: 'Personal Expenses', sub: null, merchant: 'Meesho',    recurring: false },
  { re: /peter\s*england|raymond|van\s*heusen|lifestyle\s*store/i, category: 'Personal Expenses', sub: null, merchant: null, recurring: false },
  { re: /apollo\s*(pharmacy|health|clinic)|medplus|netmeds|\b1mg\b|pharmeasy|pharmacy/i, category: 'Personal Expenses', sub: 'Medical', merchant: null, recurring: false },
  { re: /practo|doctor|hospital|clinic/i,        category: 'Personal Expenses', sub: 'Medical', merchant: null, recurring: false },
  { re: /savesage|subscription/i,                category: 'Personal Expenses', sub: null, merchant: null, recurring: true  },

  // ── Donation / Gurudwara ────────────────────────────────────────────────────
  { re: /sri\s*guru\s*s|32971050132243|gurudwara|gurdwara/i,  category: 'Donation', sub: 'Gurudwara', merchant: 'Gurudwara', recurring: true },

  // ── Catch-all: Paytm UPI payments not matched above → Personal Expenses ─────
  // (specific rules above take priority; this catches misc Paytm QR / merchant payments)
  { re: /paytm(?!.*(?:mutual|sip|insurance|emi|loan|neft|imps))/i, category: 'Personal Expenses', sub: null, merchant: null, recurring: false },

  // ── True internal transfers (self → self, excluded from totals) ─────────────
  { re: /neft\s*to|imps\s*to|self\s*transfer|own\s*account/i, category: 'Transfers', sub: null, merchant: null, recurring: false, is_transfer: true },

  // ── Income ──────────────────────────────────────────────────────────────────
  { re: /salary|sal\s*crd|payroll|stipend|linkedin\s*technology/i, category: 'Income', sub: 'Salary', merchant: 'LinkedIn', recurring: true },
  { re: /interest\s*cr(edit)?|int\s*pd|int\s*cr/i,  category: 'Income', sub: 'Interest', merchant: null, recurring: true  },
  { re: /sovereign\s*gold|sgb/i,                    category: 'Income', sub: 'SGB Interest', merchant: null, recurring: false },
  // IRM = International Remittance (MSFT dividend converted from USD)
  { re: /\birm\b.*usd|inrem/i,                       category: 'Income', sub: 'MSFT Dividend', merchant: 'Microsoft', recurring: false },
  // MsftCash = transferring dividend proceeds to IndusInd investment account
  { re: /MsftCash/i,                                 category: 'Transfers', sub: null, merchant: null, recurring: false, is_transfer: true },
  { re: /\bdividend\b/i,                             category: 'Income', sub: 'Dividend', merchant: null, recurring: false },
  { re: /cashback|refund|reversal/i,                 category: 'Income', sub: 'Refund',   merchant: null, recurring: false },
  { re: /nps\s*trust|nps.*withdrawal/i,              category: 'Income', sub: 'NPS',      merchant: null, recurring: false },
];

function categorizeOne(id, description) {
  const desc = String(description || '');
  for (const rule of RULES) {
    if (rule.re.test(desc)) {
      return {
        id,
        category:      rule.category,
        sub_category:  rule.sub || null,
        merchant_name: rule.merchant || null,
        is_recurring:  rule.recurring || false,
        is_transfer:   rule.is_transfer || false,
        is_investment: rule.is_investment || false,
        confidence:    0.75,
      };
    }
  }
  return {
    id,
    category:      'Uncategorized',
    sub_category:  null,
    merchant_name: null,
    is_recurring:  false,
    is_transfer:   false,
    is_investment: false,
    confidence:    0,
  };
}

function categorizeAllRules(transactions) {
  return transactions.map((t) => categorizeOne(t.id, t.description));
}

module.exports = { categorizeAllRules, categorizeOne };
