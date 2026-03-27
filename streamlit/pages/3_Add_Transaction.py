"""Add Transaction — fast manual entry with auto-category suggestion."""

import streamlit as st
from datetime import date
import hashlib, time

from utils.db import select, insert
from utils.categories import (
    INVESTMENT_CATEGORIES, cat_emoji,
    get_all_category_options, get_custom_categories,
    create_custom_category, delete_custom_category,
    create_mirror_transaction,
)
from utils.categorizer import categorize
from utils.formatters import fmt_inr

st.set_page_config(page_title="Add Transaction", page_icon="➕", layout="centered")
st.title("➕ Add Transaction")

accounts   = select("accounts", is_active=1)
acct_names = [a["name"] for a in accounts] or ["Manual"]

# Dynamic category list (built-in + custom)
all_cat_options = get_all_category_options()

with st.form("add_tx", clear_on_submit=True):
    c1, c2 = st.columns(2)

    tx_type     = c1.radio("Type", ["💸 Expense", "💰 Income", "📈 Investment"], horizontal=True)
    amount      = c1.number_input("Amount (₹)", min_value=0.0, step=10.0, format="%.2f")
    tx_date     = c1.date_input("Date", value=date.today())

    description = c2.text_input(
        "Description / Merchant",
        placeholder="e.g. Swiggy, Rent, SIP — category auto-suggested",
        help="Type a description and the category will be suggested automatically.",
    )

    # Auto-suggest category from description
    suggested = categorize(description) if description.strip() else {}
    suggested_cat = suggested.get("category", "")
    default_idx   = (all_cat_options.index(suggested_cat)
                     if suggested_cat in all_cat_options else 0)

    category     = c2.selectbox(
        "Category",
        all_cat_options,
        index=default_idx,
        format_func=lambda c: f"{cat_emoji(c)} {c}",
        help="Auto-suggested from description — change if needed.",
    )
    account_name = c2.selectbox("From Account", acct_names)

    if description.strip() and suggested_cat and suggested_cat != "Uncategorized":
        c2.caption(f"💡 Auto-suggested: **{cat_emoji(suggested_cat)} {suggested_cat}**")

    with st.expander("More options"):
        is_recurring = st.checkbox("Recurring monthly")

    submitted = st.form_submit_button("✅ Save Transaction", use_container_width=True, type="primary")

if submitted:
    if amount <= 0:
        st.error("Enter a valid amount.")
    else:
        is_investment = "Investment" in tx_type or category in INVESTMENT_CATEGORIES
        is_salary    = category == "Salary"
        final_amount = abs(amount) if ("Income" in tx_type or is_salary) else -abs(amount)

        cat_data = categorize(description) if description.strip() else {}
        row = {
            "date":          tx_date.isoformat(),
            "description":   description.strip() or category,
            "amount":        final_amount,
            "account_name":  account_name,
            "category":      category,
            "sub_category":  cat_data.get("sub_category"),
            "merchant_name": cat_data.get("merchant_name") or (description.strip() or None),
            "is_recurring":  int(is_recurring),
            "is_investment": int(is_investment),
            "is_transfer":   0,
            "manually_corrected": 1,
            "dedup_hash": hashlib.sha256(
                f"{tx_date}|{description}|{final_amount}|manual|{time.time()}".encode()
            ).hexdigest(),
        }

        result = insert("transactions", row)
        if result:
            mirror = create_mirror_transaction(row)
            msg = f"✅ **{fmt_inr(amount)}** added to **{category}** from **{account_name}**"
            if mirror:
                msg += f" → mirrored to **{mirror['account_name']}**"
            st.success(msg)
            st.cache_data.clear()
        else:
            st.warning("Could not save — check Supabase connection.")

# ── Custom Categories ──────────────────────────────────────────────────────

st.divider()
with st.expander("📌 Manage Custom Categories"):
    custom = get_custom_categories()

    # Create new
    cc1, cc2, cc3 = st.columns([3, 1, 1])
    new_name  = cc1.text_input("Category name", placeholder="e.g. Subscriptions")
    new_emoji = cc2.text_input("Emoji", value="📌", max_chars=2)
    new_color = cc3.color_picker("Color", value="#9ca3af")

    if st.button("➕ Create Category"):
        if not new_name.strip():
            st.error("Enter a category name.")
        else:
            result = create_custom_category(new_name.strip(), new_emoji, new_color)
            if result:
                st.success(f"Created **{new_emoji} {new_name.strip()}**")
                st.rerun()
            else:
                st.warning("Category already exists (built-in or custom).")

    # List existing custom categories
    if custom:
        st.caption("Your custom categories:")
        for c in custom:
            col1, col2 = st.columns([5, 1])
            col1.write(f"{c.get('emoji', '📌')} **{c['name']}**")
            if col2.button("🗑️", key=f"del_cat_{c['id']}", help=f"Delete {c['name']}"):
                delete_custom_category(c["name"])
                st.rerun()
