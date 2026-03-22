"""Rule-based transaction categorizer — no API needed."""

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Rule:
    pattern:      re.Pattern
    category:     str
    sub:          Optional[str]  = None
    merchant:     Optional[str]  = None
    recurring:    bool           = False
    is_investment: bool          = False
    is_transfer:  bool           = False


def _r(pat, **kw) -> Rule:
    return Rule(pattern=re.compile(pat, re.IGNORECASE), **kw)


RULES: list[Rule] = [
    # SIPs / Mutual Funds
    _r(r"kotak\s*mu(tu|tua)|ktdirect",            category="SIPs",  sub="Kotak MF",  merchant="Kotak MF",  recurring=True,  is_investment=True),
    _r(r"axis\s*mu(tu|tua)|axdr",                 category="SIPs",  sub="Axis MF",   merchant="Axis MF",   recurring=True,  is_investment=True),
    _r(r"tata\s*mu(tu|tua)|tamlsipa",             category="SIPs",  sub="Tata MF",   merchant="Tata MF",   recurring=True,  is_investment=True),
    _r(r"mirae\s*mf|bd-mirae|ttaf\d",             category="SIPs",  sub="Mirae MF",  merchant="Mirae MF",  recurring=True,  is_investment=True),
    _r(r"pgim\s*india|pm000000",                  category="SIPs",  sub="PGIM MF",   merchant="PGIM MF",   recurring=True,  is_investment=True),
    _r(r"hdfc\s*mutual\s*fund|adcamsicici.*hdfc",  category="SIPs",  sub="HDFC MF",   merchant="HDFC MF",   recurring=True,  is_investment=True),
    _r(r"mutual\s*fund|\bsip\b|systematic\s*inv", category="SIPs",  recurring=True,  is_investment=True),
    _r(r"zerodha|groww|upstox",                   category="SIPs",  sub="Stocks",    recurring=False, is_investment=True),

    # Car Loan
    _r(r"CarEmi\w*|CarFeb\w*|OctCarandSip",       category="Car Loan",       recurring=True),

    # Insurance
    _r(r"Insurance(?:Oct|Nov|Dec|Jan|Feb|Mar)\w*", category="Insurance",     recurring=True),
    _r(r"star\s*health|hdfc\s*ergo|niva\s*bupa",  category="Insurance",     recurring=True),

    # LIC
    _r(r"\blic\b|life\s*insurance\s*corp",        category="LIC",           merchant="LIC",   recurring=True, is_investment=True),

    # PPF
    _r(r"\bppf\b|public\s*provident",             category="PPF",           recurring=True,   is_investment=True),

    # Emergency Cash
    _r(r"EmgSep|EmgHome\w*|Emergency(?:Oct|Nov|Dec|Jan|Feb|Mar)\w*", category="Emergency Cash", recurring=True, is_investment=True),

    # Home Savings
    _r(r"HomeSav\w*|home\s*savings|Investfeb",    category="Home Savings",  recurring=True,   is_investment=True),

    # Holiday
    _r(r"Holiday\w*|VacationJan|TravelSep|Travelsep25|PapaVacation", category="Holiday", recurring=True),
    _r(r"irctc|railway\s*ticket",                 category="Holiday", sub="Train",   merchant="IRCTC", recurring=False),
    _r(r"redbus",                                 category="Holiday", sub="Bus",     merchant="redBus"),
    _r(r"ixigo",                                  category="Holiday", sub="Travel",  merchant="ixigo"),
    _r(r"indigo|air\s*india|spicejet|vistara|go\s*air|akasa", category="Holiday", sub="Flight"),
    _r(r"\boyo\b|makemytrip|goibibo|trivago",     category="Holiday", sub="Hotel"),

    # Send to Parents
    _r(r"parents?\s*transfer|ParentsTransfer|ParentsTic", category="Send to Parents", recurring=True),
    _r(r"GURMEET\s*KA|6394604734",               category="Send to Parents", recurring=True),

    # Preet Badminton
    _r(r"PreetPersonal\w*|Preetpers\w*",          category="Personal Expenses", recurring=True),
    _r(r"decathlon",                              category="Preet Badminton", merchant="Decathlon"),
    _r(r"cult\.?fit|cultfit|badminton",           category="Preet Badminton", recurring=True),
    _r(r"gold.?s\s*gym|anytime\s*fitness",        category="Preet Badminton", sub="Gym", recurring=True),

    # Preet Beauty Products
    _r(r"myntra",   category="Preet Beauty Products", merchant="Myntra"),
    _r(r"nykaa",    category="Preet Beauty Products", merchant="Nykaa"),
    _r(r"\bajio\b", category="Preet Beauty Products", merchant="AJIO"),
    _r(r"lenskart", category="Preet Beauty Products", merchant="Lenskart"),

    # Groceries
    _r(r"bigbasket|bb\s*daily", category="Groceries", merchant="BigBasket"),
    _r(r"blinkit",              category="Groceries", merchant="Blinkit"),
    _r(r"zepto",                category="Groceries", merchant="Zepto"),
    _r(r"jiomart",              category="Groceries", merchant="JioMart"),
    _r(r"grofer|dunzo|swiggy\s*instamart", category="Groceries"),
    _r(r"reliance\s*smart|dmart|spencer",  category="Groceries"),

    # Cylinder
    _r(r"suwa\s*suwa|9591161509", category="Cylinder", merchant="Gas Cylinder", recurring=True),

    # Outing
    _r(r"zomato|eternal\s*li",   category="Personal Expenses", sub="Food Delivery", merchant="Zomato"),
    _r(r"swiggy",                category="Outing",  sub="Food Delivery", merchant="Swiggy"),
    _r(r"dominos|pizza\s*hut|mcdonald|kfc|burger\s*king|haldiram", category="Outing", sub="Dining"),
    _r(r"starbucks",             category="Outing",  sub="Coffee",   merchant="Starbucks"),
    _r(r"pvr|inox|cinepolis",    category="Outing",  sub="Movies"),
    _r(r"bookmyshow",            category="Outing",  sub="Movies",   merchant="BookMyShow"),
    _r(r"district\.movie|orbgen", category="Outing", sub="Movies",   merchant="District"),
    _r(r"[\/\s]movie[\/\s]",     category="Outing",  sub="Movies"),
    _r(r"netflix",               category="Outing",  sub="OTT",      merchant="Netflix",    recurring=True),
    _r(r"amazon\s*prime|prime\s*video", category="Outing", sub="OTT", merchant="Amazon Prime", recurring=True),
    _r(r"hotstar|disney",        category="Outing",  sub="OTT",      merchant="Hotstar",    recurring=True),
    _r(r"zee5|sony\s*liv|jiocinema", category="Outing", sub="OTT",   recurring=True),
    _r(r"spotify",               category="Outing",  sub="OTT",      merchant="Spotify",    recurring=True),
    _r(r"\bola\b",               category="Outing",  sub="Cab",      merchant="Ola"),
    _r(r"\buber\b",              category="Outing",  sub="Cab",      merchant="Uber"),
    _r(r"rapido",                category="Outing",  sub="Cab",      merchant="Rapido"),
    _r(r"metro\s*(card|recharge)|bmtc|dmrc", category="Outing", sub="Metro", merchant="Metro"),

    # Petrol
    _r(r"indian\s*oil|iocl",    category="Petrol",  merchant="Indian Oil"),
    _r(r"bharat\s*petro|bpcl",  category="Petrol",  merchant="BPCL"),
    _r(r"hp\s*petrol|hpcl",     category="Petrol",  merchant="HPCL"),
    _r(r"4s\s*venture",         category="Petrol",  sub="Car Service", merchant="4S Venture"),
    _r(r"nozir\s*ahme|7305458221", category="Petrol", sub="Car Cleaning", merchant="Car Cleaning", recurring=True),

    # Electricity
    _r(r"bescom|tata\s*power|bses|adani\s*electric|msedcl|tneb|electricity", category="Electricity", recurring=True),

    # WiFi
    _r(r"airtel[._-](?:payu|billpay|broadband|fiber)|act\s*broadband|airtel\s*bro", category="WiFi", merchant="Airtel", recurring=True),
    _r(r"jiofiber|jio[\s._-]*fiber",    category="WiFi", merchant="Jio Fiber",  recurring=True),
    _r(r"myjio|reliancejio",            category="Personal Expenses", sub="Mobile Recharge", merchant="Jio", recurring=True),

    # Donation
    _r(r"sri\s*guru\s*s|32971050132243|gurudwara", category="Donation", sub="Gurudwara", merchant="Gurudwara", recurring=True),

    # Personal Expenses
    _r(r"\bamazon\b(?!\s*prime)", category="Personal Expenses", merchant="Amazon"),
    _r(r"flipkart",               category="Personal Expenses", merchant="Flipkart"),
    _r(r"meesho",                 category="Personal Expenses", merchant="Meesho"),
    _r(r"apollo\s*(pharmacy|health)|medplus|netmeds|\b1mg\b|pharmeasy|pharmacy", category="Personal Expenses", sub="Medical"),
    _r(r"practo|doctor|hospital|clinic", category="Personal Expenses", sub="Medical"),
    # Paytm catch-all
    _r(r"paytm(?!.*(?:mutual|sip|insurance|emi|loan))", category="Personal Expenses"),

    # Transfers (true self-transfers)
    _r(r"neft\s*to|imps\s*to|self\s*transfer|own\s*account", category="Transfers", is_transfer=True),

    # Income
    _r(r"salary|sal\s*crd|payroll|stipend|linkedin\s*technology", category="Income", sub="Salary", merchant="LinkedIn", recurring=True),
    _r(r"interest\s*cr(edit)?|int\s*pd|int\s*cr", category="Income", sub="Interest", recurring=True),
    _r(r"\birm\b.*usd|inrem",    category="Income", sub="MSFT Dividend", merchant="Microsoft"),
    _r(r"MsftCash",              category="Transfers", is_transfer=True),
    _r(r"sovereign\s*gold|sgb",  category="Income", sub="SGB Interest"),
    _r(r"\bdividend\b",          category="Income", sub="Dividend"),
    _r(r"cashback|refund|reversal", category="Income", sub="Refund"),
    _r(r"nps\s*trust|nps.*withdrawal", category="Income", sub="NPS"),
]


def categorize(description: str) -> dict:
    """Return categorization dict for a transaction description."""
    for rule in RULES:
        if rule.pattern.search(description):
            return {
                "category":     rule.category,
                "sub_category": rule.sub,
                "merchant_name": rule.merchant,
                "is_recurring": rule.recurring,
                "is_investment": rule.is_investment,
                "is_transfer":  rule.is_transfer,
                "confidence":   0.75,
            }
    return {
        "category": "Uncategorized", "sub_category": None, "merchant_name": None,
        "is_recurring": False, "is_investment": False, "is_transfer": False, "confidence": 0.0,
    }
