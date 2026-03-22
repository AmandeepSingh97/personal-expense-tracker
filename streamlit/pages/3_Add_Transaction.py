"""Add Transaction — quick manual entry form."""

import streamlit as st
from datetime import date
import hashlib, time

from utils.db import query, execute
from utils.categories import ALL_BUDGET_CATEGORIES, INVESTMENT_CATEGORIES, cat_emoji
from utils.categorizer import categorize
from utils.formatters import fmt_inr

st.set_page_config(page_title="Add Transaction", page_icon="➕", layout="centered")
st.title("➕ Add Transaction")

# Load accounts
accounts = query("SELECT name, color FROM accounts WHERE is_active=1 ORDER BY created_at")
acct_names = [a["name"] for a in accounts] or ["Manual"]

with st.form("add_tx", clear_on_submit=True):
    col1, col2 = st.columns([1, 1])

    with col1:
        tx_type = st.radio("Type", ["💸 Expense", "💰 Income", "📈 Investment"], horizontal=True)
        amount  = st.number_input("Amount (₹)", min_value=0.0, step=10.0, format="%.2f")
        tx_date = st.date_input("Date", value=date.today())

    with col2:
        category = st.selectbox(
            "Category",
            options=ALL_BUDGET_CATEGORIES,
            format_func=lambda c: f"{cat_emoji(c)} {c}",
        )
        description = st.text_input("Description / Merchant", placeholder="e.g. Swiggy, Rent, SIP")
        account_name = st.selectbox("From Account", options=acct_names)

    with st.expander("More options"):
        is_recurring = st.checkbox("Recurring monthly")

    submitted = st.form_submit_button("✅ Save Transaction", use_container_width=True, type="primary")

if submitted:
    if amount <= 0:
        st.error("Enter a valid amount.")
    else:
        sign = -1 if "Expense" in tx_type or "Investment" in tx_type else 1
        final_amount = sign * amount
        is_investment = "Investment" in tx_type or category in INVESTMENT_CATEGORIES

        # Auto-categorize from description if category is still default
        if not description:
            description = category

        dedup_hash = hashlib.sha256(f"{tx_date}|{description}|{final_amount}|manual|{time.time()}".encode()).hexdigest()

        rowcount, row = execute("""
            INSERT INTO transactions
              (date, description, amount, account_name, category, is_recurring,
               is_investment, is_transfer, manually_corrected, dedup_hash)
            VALUES (%s,%s,%s,%s,%s,%s,%s,0,1,%s)
            ON CONFLICT(dedup_hash) DO NOTHING RETURNING id
        """, (tx_date.isoformat(), description, final_amount, account_name,
               category, int(is_recurring), int(is_investment), dedup_hash))

        if rowcount > 0:
            st.success(f"✅ Added **{fmt_inr(amount)}** to **{category}** from **{account_name}**")
            st.cache_data.clear()
        else:
            st.warning("Duplicate transaction — not added.")
