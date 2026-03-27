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
    "Salary":                {"emoji": "💼", "color": "#16a34a"},
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

SYSTEM_CATEGORIES = {"Salary", "Income", "Transfers", "Uncategorized"}

EXPENSE_CATEGORIES = [
    c for c in CATEGORY_META
    if c not in SYSTEM_CATEGORIES | INVESTMENT_CATEGORIES
]

ALL_BUDGET_CATEGORIES = [
    c for c in CATEGORY_META
    if c not in SYSTEM_CATEGORIES
]

# All categories usable in dropdowns (budget + system)
ALL_CATEGORIES = [c for c in CATEGORY_META if c != "Uncategorized"]


def cat_emoji(name: str) -> str:
    meta = CATEGORY_META.get(name)
    if meta:
        return meta["emoji"]
    # Check custom categories
    for c in get_custom_categories():
        if c["name"] == name:
            return c.get("emoji", "📌")
    return "📌"


def cat_color(name: str) -> str:
    meta = CATEGORY_META.get(name)
    if meta:
        return meta["color"]
    for c in get_custom_categories():
        if c["name"] == name:
            return c.get("color", "#9ca3af")
    return "#9ca3af"


# ── Custom categories (stored in Supabase) ─────────────────────────────────

def get_custom_categories() -> list[dict]:
    """Fetch custom categories from DB."""
    from utils.db import select
    return select("custom_categories", columns="id,name,emoji,color")


def get_all_category_names() -> list[str]:
    """Built-in budget + investment + custom category names (for dropdowns)."""
    custom = [c["name"] for c in get_custom_categories()]
    return ALL_BUDGET_CATEGORIES + custom


def get_all_category_options() -> list[str]:
    """All selectable categories: budget + system + custom (excludes Uncategorized)."""
    custom = [c["name"] for c in get_custom_categories()]
    return ALL_CATEGORIES + custom


def create_custom_category(name: str, emoji: str = "📌", color: str = "#9ca3af") -> dict | None:
    """Create a new custom category. Returns the row or None."""
    from utils.db import insert
    if name in CATEGORY_META:
        return None  # built-in already exists
    return insert("custom_categories", {"name": name.strip(), "emoji": emoji, "color": color})


def delete_custom_category(name: str):
    """Delete a custom category by name."""
    from utils.db import delete
    if name in CATEGORY_META:
        return  # can't delete built-ins
    delete("custom_categories", name=name)


# ── Category → Account links (auto-mirror transactions) ─────────────────────

def get_category_links() -> dict[str, str]:
    """Return {category: destination_account} for active links."""
    from utils.db import select
    rows = select("category_account_links", is_active=1)
    return {r["category"]: r["destination_account"] for r in rows}


def create_mirror_transaction(original: dict, links: dict | None = None) -> dict | None:
    """If the transaction's category has a linked account, create a mirror credit.

    Args:
        original: dict with at least: date, description, amount, account_name, category
        links: optional pre-fetched links dict (avoids repeated DB calls during bulk import)

    Returns the mirror row dict if created, else None.
    """
    import hashlib, time
    from utils.db import insert

    if links is None:
        links = get_category_links()

    cat = original.get("category", "")
    dest_account = links.get(cat)
    if not dest_account:
        return None

    # Don't mirror if source and destination are the same account
    if original.get("account_name") == dest_account:
        return None

    # Don't mirror positive amounts (income/credits) — only outflows
    amt = float(original.get("amount", 0))
    if amt >= 0:
        return None

    mirror = {
        "date":              original["date"],
        "description":       f"[From {original.get('account_name', '?')}] {original.get('description', cat)[:80]}",
        "amount":            abs(amt),  # positive = credit to destination
        "account_name":      dest_account,
        "category":          cat,
        "sub_category":      original.get("sub_category"),
        "merchant_name":     None,
        "is_recurring":      0,  # mirror is not a recurring bill
        "is_investment":     0,  # mirror is not an investment (just a balance transfer)
        "is_transfer":       1,  # marked as transfer so it doesn't inflate income totals
        "manually_corrected": 1,
        "dedup_hash":        hashlib.sha256(
            f"mirror|{original['date']}|{cat}|{amt}|{dest_account}|{time.time()}".encode()
        ).hexdigest(),
    }
    return insert("transactions", mirror)
