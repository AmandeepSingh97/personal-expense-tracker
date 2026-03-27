"""Quick Add -- mobile-friendly transaction entry with natural language parsing."""

import streamlit as st
import re, hashlib, time
from datetime import date

from utils.db import select, insert
from utils.categories import cat_emoji, get_all_category_options, SYSTEM_CATEGORIES, create_mirror_transaction
from utils.categorizer import categorize
from utils.formatters import fmt_inr

# ---------------------------------------------------------------------------
# Page config -- centered layout for mobile
# ---------------------------------------------------------------------------
st.title("⚡ Quick Add")
st.caption("Type something like **200 swiggy** or **salary 150000** and tap Save.")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
INCOME_CATEGORIES = {"Salary", "Income"}

PRESET_CATEGORIES = [
    ("Groceries",         "🛒"),
    ("Outing",            "🍽️"),
    ("Petrol",            "⛽"),
    ("Personal Expenses", "👤"),
]


def parse_input(text: str) -> dict | None:
    """Extract amount and description from natural language text.

    Supported patterns:
        "200 swiggy"         -> amount=200,  desc="swiggy"
        "spent 500 uber"     -> amount=500,  desc="uber"
        "salary 150000"      -> amount=150000, desc="salary"
        "3000 wifi bill"     -> amount=3000, desc="wifi bill"
    """
    text = text.strip()
    if not text:
        return None

    # Find the first number (int or float)
    match = re.search(r"[\d,]+(?:\.\d+)?", text)
    if not match:
        return None

    raw_num = match.group().replace(",", "")
    try:
        amount = float(raw_num)
    except ValueError:
        return None

    if amount <= 0:
        return None

    # Everything that is NOT the number becomes the description
    desc = text[:match.start()] + text[match.end():]
    # Strip filler words
    desc = re.sub(r"\b(spent|paid|gave|for|on|rs|inr)\b", "", desc, flags=re.IGNORECASE)
    desc = re.sub(r"\s+", " ", desc).strip()

    return {"amount": amount, "description": desc}


def build_row(amount: float, description: str, category_override: str | None = None) -> dict:
    """Build a transaction dict ready for DB insert."""
    cat_data = categorize(description) if description else {}
    cat = category_override or cat_data.get("category", "Uncategorized")

    # Positive for income/salary, negative for everything else
    if cat in INCOME_CATEGORIES:
        final_amount = abs(amount)
    else:
        final_amount = -abs(amount)

    return {
        "date":               date.today().isoformat(),
        "description":        description or cat,
        "amount":             final_amount,
        "account_name":       "Manual",
        "category":           cat,
        "sub_category":       cat_data.get("sub_category"),
        "merchant_name":      cat_data.get("merchant_name") or (description or None),
        "is_recurring":       int(cat_data.get("is_recurring", False)),
        "is_investment":      int(cat_data.get("is_investment", False)),
        "is_transfer":        0,
        "manually_corrected": 1,
        "dedup_hash":         hashlib.sha256(
            f"{date.today()}|{description}|{final_amount}|quick|{time.time()}".encode()
        ).hexdigest(),
    }


def save_transaction(row: dict) -> bool:
    """Insert row, create mirror if linked, and clear cache. Returns True on success."""
    result = insert("transactions", row)
    if result:
        mirror = create_mirror_transaction(row)
        if mirror:
            st.caption(f"↳ Mirrored to **{mirror['account_name']}**")
        st.cache_data.clear()
        return True
    return False


# ---------------------------------------------------------------------------
# Preset quick-category buttons
# ---------------------------------------------------------------------------
st.subheader("Quick presets")
cols = st.columns(len(PRESET_CATEGORIES))
for idx, (cat_name, emoji) in enumerate(PRESET_CATEGORIES):
    if cols[idx].button(f"{emoji} {cat_name}", key=f"preset_{cat_name}",
                        use_container_width=True):
        st.session_state["qa_preset_cat"] = cat_name
        st.session_state["qa_preset_desc"] = cat_name.lower()

# ---------------------------------------------------------------------------
# Main input
# ---------------------------------------------------------------------------
st.divider()

preset_desc = st.session_state.pop("qa_preset_desc", "")
preset_cat  = st.session_state.pop("qa_preset_cat", None)

user_text = st.text_input(
    "What did you spend?",
    value=preset_desc,
    placeholder="e.g. 200 swiggy, spent 500 uber, salary 150000",
    key="qa_input",
    label_visibility="visible",
)

parsed = parse_input(user_text)

if parsed:
    amount = parsed["amount"]
    desc   = parsed["description"]

    cat_data = categorize(desc) if desc else {}
    auto_cat = cat_data.get("category", "Uncategorized")

    # If a preset was selected and categorizer returned Uncategorized, use preset
    effective_cat = auto_cat
    if auto_cat == "Uncategorized" and preset_cat:
        effective_cat = preset_cat

    # Allow user to override category
    all_options = get_all_category_options()
    try:
        default_idx = all_options.index(effective_cat)
    except ValueError:
        default_idx = 0

    st.markdown("---")
    st.markdown("**Parsed result**")

    c1, c2 = st.columns(2)
    c1.metric("Amount", fmt_inr(amount))
    c2.metric("Category", f"{cat_emoji(effective_cat)} {effective_cat}")

    selected_cat = st.selectbox(
        "Change category",
        all_options,
        index=default_idx,
        format_func=lambda c: f"{cat_emoji(c)} {c}",
        label_visibility="collapsed",
    )

    if st.button("💾 Save Transaction", use_container_width=True, type="primary"):
        row = build_row(amount, desc, category_override=selected_cat)
        if save_transaction(row):
            sign = "+" if row["amount"] >= 0 else "-"
            st.success(
                f"Saved **{sign}{fmt_inr(abs(row['amount']))}** "
                f"to **{cat_emoji(selected_cat)} {selected_cat}**"
            )
        else:
            st.error("Could not save -- check Supabase connection.")

elif user_text.strip():
    st.warning("Could not find an amount. Try something like **200 swiggy** or **salary 150000**.")

# ---------------------------------------------------------------------------
# Recent entries added today
# ---------------------------------------------------------------------------
st.divider()
st.subheader("Today's entries")

today_str = date.today().isoformat()
today_rows = select("transactions", date=today_str, account_name="Manual")

# Sort by id descending (most recent first) and take last 5
today_rows.sort(key=lambda r: r.get("id", 0), reverse=True)
today_rows = today_rows[:5]

if today_rows:
    for tx in today_rows:
        amt = tx.get("amount", 0)
        cat = tx.get("category", "Uncategorized")
        desc = tx.get("description", "")
        color = "#10b981" if amt >= 0 else "#ef4444"
        st.markdown(
            f"&nbsp; {cat_emoji(cat)} **{cat}** &mdash; {desc} &nbsp; "
            f"<span style='color:{color}; font-weight:bold'>{fmt_inr(amt, show_sign=True)}</span>",
            unsafe_allow_html=True,
        )
else:
    st.caption("No transactions added today yet.")
