"""Transactions — browse, filter, categorize."""

import streamlit as st
import pandas as pd

from utils.db import query, execute
from utils.budget_period import current_period, period_label, period_expr, last_n_periods
from utils.categories import ALL_BUDGET_CATEGORIES, cat_emoji
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Transactions", page_icon="📋", layout="wide")
st.title("📋 Transactions")

PERIOD = period_expr("date")

# ── Sidebar filters ───────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Filters")
    periods = last_n_periods(12)
    period_options = {p: period_label(p) for p in reversed(periods)}
    selected_period = st.selectbox("Period", options=list(period_options.keys()),
                                    format_func=lambda p: period_options[p],
                                    index=0)
    search = st.text_input("Search description")
    accounts = query("SELECT DISTINCT name FROM accounts WHERE is_active=1 ORDER BY name")
    acct_list = ["All"] + [a["name"] for a in accounts]
    selected_account = st.selectbox("Account", acct_list)

    cat_filter = st.selectbox("Category", ["All"] + ALL_BUDGET_CATEGORIES + ["Uncategorized", "Income", "Transfers"])
    show_transfers = st.checkbox("Include transfers")

# ── Load transactions ─────────────────────────────────────────────────────────

conditions = [f"({PERIOD}) = %s"]
params     = [selected_period]

if search:
    conditions.append("(description ILIKE %s OR merchant_name ILIKE %s)")
    params += [f"%{search}%", f"%{search}%"]
if selected_account != "All":
    conditions.append("account_name = %s"); params.append(selected_account)
if cat_filter != "All":
    conditions.append("category = %s"); params.append(cat_filter)
if not show_transfers:
    conditions.append("is_transfer = 0")

where = " AND ".join(conditions)

@st.cache_data(ttl=15)
def load_txns(w, p):
    return query(f"SELECT * FROM transactions WHERE {w} ORDER BY date DESC, id DESC LIMIT 200", tuple(p))

rows = load_txns(where, params)

# ── Summary stats ─────────────────────────────────────────────────────────────

total_in  = sum(float(r["amount"]) for r in rows if float(r["amount"]) > 0)
total_out = sum(abs(float(r["amount"])) for r in rows if float(r["amount"]) < 0)
c1, c2, c3 = st.columns(3)
c1.metric("Transactions", len(rows))
c2.metric("Total Out",    fmt_inr(total_out))
c3.metric("Total In",     fmt_inr(total_in))

# ── Bulk categorize ───────────────────────────────────────────────────────────

with st.expander("⚡ Bulk categorize selected"):
    selected_ids = st.multiselect("Select transaction IDs", [r["id"] for r in rows],
                                   format_func=lambda i: next((r["description"][:40] for r in rows if r["id"]==i), str(i)))
    new_cat = st.selectbox("New category", ALL_BUDGET_CATEGORIES, format_func=lambda c: f"{cat_emoji(c)} {c}", key="bulk_cat")
    if st.button("Apply") and selected_ids:
        for tid in selected_ids:
            execute("UPDATE transactions SET category=%s, manually_corrected=1 WHERE id=%s", (new_cat, tid))
        st.success(f"Updated {len(selected_ids)} transactions.")
        st.cache_data.clear()
        st.rerun()

st.divider()

# ── Transaction table ─────────────────────────────────────────────────────────

if not rows:
    st.info("No transactions found.")
else:
    for r in rows:
        amt   = float(r["amount"])
        emoji = cat_emoji(r["category"] or "Uncategorized")
        color = "#10b981" if amt > 0 else "#ef4444"
        sign  = "+" if amt > 0 else "-"

        col1, col2, col3, col4, col5 = st.columns([1, 4, 2, 2, 1])
        col1.write(emoji)
        col2.write(f"**{r['merchant_name'] or r['description'][:55]}**  \n"
                   f"_{fmt_date(r['date'])} · {r['account_name']}_")
        col3.write(r["category"] or "Uncategorized")
        col4.markdown(f"<span style='color:{color}'>{sign}{fmt_inr(amt)}</span>",
                      unsafe_allow_html=True)

        with col5:
            if st.button("✏️", key=f"edit_{r['id']}", help="Edit"):
                st.session_state[f"editing_{r['id']}"] = True

        # Inline edit form
        if st.session_state.get(f"editing_{r['id']}"):
            with st.form(f"form_{r['id']}"):
                new_cat = st.selectbox("Category",
                    options=ALL_BUDGET_CATEGORIES + ["Income", "Transfers", "Uncategorized"],
                    index=(ALL_BUDGET_CATEGORIES + ["Income", "Transfers", "Uncategorized"]).index(r["category"])
                    if r["category"] in ALL_BUDGET_CATEGORIES + ["Income", "Transfers", "Uncategorized"] else 0,
                    format_func=lambda c: f"{cat_emoji(c)} {c}",
                    key=f"cat_{r['id']}")
                new_desc = st.text_input("Description", value=r["description"], key=f"desc_{r['id']}")
                c_save, c_cancel = st.columns(2)
                save   = c_save.form_submit_button("Save",   type="primary")
                cancel = c_cancel.form_submit_button("Cancel")

            if save:
                execute("UPDATE transactions SET category=%s, description=%s, manually_corrected=1 WHERE id=%s",
                        (new_cat, new_desc, r["id"]))
                st.session_state.pop(f"editing_{r['id']}", None)
                st.cache_data.clear()
                st.rerun()
            if cancel:
                st.session_state.pop(f"editing_{r['id']}", None)
                st.rerun()

        st.divider()
