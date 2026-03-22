"""Add Transaction — quick manual entry form."""

import streamlit as st
from datetime import date
import hashlib, time

from utils.db import select, insert
from utils.categories import ALL_BUDGET_CATEGORIES, INVESTMENT_CATEGORIES, cat_emoji
from utils.formatters import fmt_inr

st.set_page_config(page_title="Add Transaction", page_icon="➕", layout="centered")
st.title("➕ Add Transaction")

accounts = select("accounts", is_active=1)
acct_names = [a["name"] for a in accounts] or ["Manual"]

with st.form("add_tx", clear_on_submit=True):
    c1, c2 = st.columns(2)
    tx_type  = c1.radio("Type", ["💸 Expense", "💰 Income", "📈 Investment"], horizontal=True)
    amount   = c1.number_input("Amount (₹)", min_value=0.0, step=10.0, format="%.2f")
    tx_date  = c1.date_input("Date", value=date.today())

    category = c2.selectbox("Category", ALL_BUDGET_CATEGORIES,
                             format_func=lambda c: f"{cat_emoji(c)} {c}")
    description  = c2.text_input("Description / Merchant", placeholder="e.g. Swiggy, Rent, SIP")
    account_name = c2.selectbox("From Account", acct_names)

    with st.expander("More options"):
        is_recurring = st.checkbox("Recurring monthly")

    submitted = st.form_submit_button("✅ Save Transaction", use_container_width=True, type="primary")

if submitted:
    if amount <= 0:
        st.error("Enter a valid amount.")
    else:
        sign         = 1 if "Income" in tx_type else -1
        is_investment = "Investment" in tx_type or category in INVESTMENT_CATEGORIES
        final_amount = abs(amount) * sign if "Income" in tx_type else -abs(amount)

        row = {
            "date":         tx_date.isoformat(),
            "description":  description or category,
            "amount":       final_amount,
            "account_name": account_name,
            "category":     category,
            "is_recurring": int(is_recurring),
            "is_investment": int(is_investment),
            "is_transfer":  0,
            "manually_corrected": 1,
            "dedup_hash":   hashlib.sha256(
                f"{tx_date}|{description}|{final_amount}|manual|{time.time()}".encode()
            ).hexdigest(),
        }

        result = insert("transactions", row)
        if result:
            st.success(f"✅ Added **{fmt_inr(amount)}** to **{category}** from **{account_name}**")
            st.cache_data.clear()
        else:
            st.warning("Could not save transaction.")
