"""Category metadata and budget groups."""

CATEGORY_META: dict[str, dict] = {
    "Rent":                  {"emoji": "🏠", "color": "#6366f1"},
    "Maid":                  {"emoji": "🧹", "color": "#8b5cf6"},
    "Cook":                  {"emoji": "👨‍🍳", "color": "#f97316"},
    "SIPs":                  {"emoji": "📈", "color": "#14b8a6"},
    "Groceries":             {"emoji": "🛒", "color": "#f59e0b"},
    "Electricity":           {"emoji": "⚡", "color": "#eab308"},
    "WiFi":                  {"emoji": "📶", "color": "#38bdf8"},
    "Outing":                {"emoji": "🍽️", "color": "#ec4899"},
    "Cylinder":              {"emoji": "🔥", "color": "#ef4444"},
    "Car Loan":              {"emoji": "🚗", "color": "#10b981"},
    "Petrol":                {"emoji": "⛽", "color": "#06b6d4"},
    "PPF":                   {"emoji": "🏦", "color": "#3b82f6"},
    "Insurance":             {"emoji": "🛡️", "color": "#84cc16"},
    "Emergency Cash":        {"emoji": "🆘", "color": "#dc2626"},
    "Holiday":               {"emoji": "✈️", "color": "#0ea5e9"},
    "Home Savings":          {"emoji": "🏡", "color": "#22c55e"},
    "Personal Expenses":     {"emoji": "👤", "color": "#a855f7"},
    "LIC":                   {"emoji": "📋", "color": "#64748b"},
    "Send to Parents":       {"emoji": "👨‍👩‍👧", "color": "#fb923c"},
    "Preet Badminton":       {"emoji": "🏸", "color": "#38bdf8"},
    "Preet Beauty Products": {"emoji": "💄", "color": "#e879f9"},
    "Donation":              {"emoji": "🙏", "color": "#f59e0b"},
    "Income":                {"emoji": "💰", "color": "#22c55e"},
    "Transfers":             {"emoji": "🔁", "color": "#94a3b8"},
    "Uncategorized":         {"emoji": "❓", "color": "#9ca3af"},
}

INVESTMENT_CATEGORIES = {"SIPs", "PPF", "LIC", "Home Savings", "Emergency Cash"}

CATEGORY_GROUPS = {
    "Fixed": {
        "label": "Fixed Costs", "emoji": "📌", "color": "#6366f1",
        "hint": "Committed monthly obligations",
        "categories": ["Rent", "Car Loan", "Insurance", "WiFi", "Electricity", "LIC", "PPF"],
    },
    "Household": {
        "label": "Household", "emoji": "🏡", "color": "#f59e0b",
        "hint": "Keeping the home running",
        "categories": ["Groceries", "Petrol", "Cylinder", "Maid", "Cook"],
    },
    "Lifestyle": {
        "label": "Lifestyle", "emoji": "🎯", "color": "#ec4899",
        "hint": "Discretionary & quality of life",
        "categories": ["Outing", "Personal Expenses", "Holiday", "Preet Badminton",
                        "Preet Beauty Products", "Donation"],
    },
    "Family": {
        "label": "Family", "emoji": "👨‍👩‍👧", "color": "#fb923c",
        "hint": "Support sent to family",
        "categories": ["Send to Parents"],
    },
}

EXPENSE_CATEGORIES = [
    c for c in CATEGORY_META
    if c not in {"Income", "Transfers", "Uncategorized"} | INVESTMENT_CATEGORIES
]

ALL_BUDGET_CATEGORIES = [
    c for c in CATEGORY_META
    if c not in {"Income", "Transfers", "Uncategorized"}
]


def cat_emoji(name: str) -> str:
    return CATEGORY_META.get(name, {}).get("emoji", "📌")


def cat_color(name: str) -> str:
    return CATEGORY_META.get(name, {}).get("color", "#9ca3af")
