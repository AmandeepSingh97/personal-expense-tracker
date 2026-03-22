"""Transactions — browse, filter, categorize."""

import streamlit as st
import pandas as pd

from utils.db import select, update
from utils.data import get_transactions
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import ALL_BUDGET_CATEGORIES, cat_emoji
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Transactions", page_icon="📋", layout="wide")
st.title("📋 Transactions")

# ── Filters ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Filters")
    periods = last_n_periods(12)
    period_labels = {p: period_label(p) for p in reversed(periods)}
    sel_period = st.selectbox("Period", list(period_labels), format_func=lambda p: period_labels[p])
    search = st.text_input("Search description")
    accts = select("accounts", is_active=1)
    acct_list = ["All"] + [a["name"] for a in accts]
    sel_account = st.selectbox("Account", acct_list)
    cat_filter = st.selectbox("Category", ["All"] + ALL_BUDGET_CATEGORIES + ["Uncategorized","Income","Transfers"])
    show_transfers = st.checkbox("Include transfers")

# ── Load & filter ─────────────────────────────────────────────────────────────

df = get_transactions(period=sel_period, include_transfers=show_transfers)
if df.empty:
    st.info("No transactions for this period.")
    st.stop()

if search:
    mask = df["description"].str.contains(search, case=False, na=False)
    if "merchant_name" in df.columns:
        mask |= df["merchant_name"].str.contains(search, case=False, na=False)
    df = df[mask]

if sel_account != "All":
    df = df[df["account_name"] == sel_account]

if cat_filter != "All":
    df = df[df["category"] == cat_filter]

# ── Stats ─────────────────────────────────────────────────────────────────────

total_out = df[df["amount"] < 0]["amount"].apply(abs).sum()
total_in  = df[df["amount"] > 0]["amount"].sum()
c1, c2, c3 = st.columns(3)
c1.metric("Transactions", len(df))
c2.metric("Total Out",    fmt_inr(total_out))
c3.metric("Total In",     fmt_inr(total_in))

# ── Bulk categorize ───────────────────────────────────────────────────────────

with st.expander("⚡ Bulk categorize"):
    ids = st.multiselect("Select transaction IDs", df["id"].tolist(),
        format_func=lambda i: df[df["id"]==i]["description"].values[0][:50] if len(df[df["id"]==i]) else str(i))
    new_cat = st.selectbox("New category", ALL_BUDGET_CATEGORIES,
        format_func=lambda c: f"{cat_emoji(c)} {c}", key="bulk_cat")
    if st.button("Apply") and ids:
        for tid in ids:
            update("transactions", {"category": new_cat, "manually_corrected": 1}, id=tid)
        st.success(f"Updated {len(ids)} transactions.")
        st.cache_data.clear(); st.rerun()

st.divider()

# ── Transaction list ──────────────────────────────────────────────────────────

for _, r in df.sort_values("date", ascending=False).iterrows():
    amt   = float(r["amount"])
    emoji = cat_emoji(r.get("category") or "Uncategorized")
    color = "#10b981" if amt > 0 else "#ef4444"
    sign  = "+" if amt > 0 else "-"

    c1, c2, c3, c4, c5 = st.columns([1, 4, 2, 2, 1])
    c1.write(emoji)
    c2.write(f"**{r.get('merchant_name') or str(r['description'])[:55]}**  \n"
             f"_{fmt_date(r['date'])} · {r['account_name']}_")
    c3.write(r.get("category") or "—")
    c4.markdown(f"<span style='color:{color}'>{sign}{fmt_inr(amt)}</span>", unsafe_allow_html=True)

    with c5:
        if st.button("✏️", key=f"ed_{r['id']}", help="Edit"):
            st.session_state[f"editing_{r['id']}"] = True

    if st.session_state.get(f"editing_{r['id']}"):
        with st.form(f"form_{r['id']}"):
            opts = ALL_BUDGET_CATEGORIES + ["Income", "Transfers", "Uncategorized"]
            cur_idx = opts.index(r["category"]) if r.get("category") in opts else 0
            new_c   = st.selectbox("Category", opts, index=cur_idx,
                format_func=lambda c: f"{cat_emoji(c)} {c}", key=f"c_{r['id']}")
            new_d   = st.text_input("Description", value=r["description"], key=f"d_{r['id']}")
            sv, ca  = st.columns(2)
            saved   = sv.form_submit_button("Save", type="primary")
            cncld   = ca.form_submit_button("Cancel")
        if saved:
            update("transactions", {"category": new_c, "description": new_d, "manually_corrected": 1}, id=r["id"])
            st.session_state.pop(f"editing_{r['id']}", None)
            st.cache_data.clear(); st.rerun()
        if cncld:
            st.session_state.pop(f"editing_{r['id']}", None); st.rerun()

    st.divider()
