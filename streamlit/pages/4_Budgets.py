"""Budgets — grouped view with progress bars."""

import streamlit as st
from utils.db import select, upsert
from utils.data import get_budgets_with_spend
from utils.budget_period import current_period, period_label
from utils.categories import CATEGORY_GROUPS, cat_emoji
from utils.formatters import fmt_inr

st.set_page_config(page_title="Budgets", page_icon="💳", layout="wide")
st.title("💳 Budgets")
st.caption(f"Period: **{period_label(current_period())}**")

period  = current_period()
budgets = get_budgets_with_spend(period)
bmap    = {r["category"]: r for r in budgets}

total_budget = sum(float(r["monthly_limit"]) for r in budgets)
total_spent  = sum(float(r["spent"]) for r in budgets)
st.metric("Total Budgeted", fmt_inr(total_budget), f"Spent: {fmt_inr(total_spent)}")

# ── Edit budget ───────────────────────────────────────────────────────────────

with st.expander("⚙️ Edit / Add Budget"):
    all_cats = [c for g in CATEGORY_GROUPS.values() for c in g["categories"]]
    with st.form("edit_budget"):
        cat_to_edit = st.selectbox("Category", all_cats, format_func=lambda c: f"{cat_emoji(c)} {c}")
        existing    = bmap.get(cat_to_edit, {})
        new_limit   = st.number_input("Monthly Limit (₹)",
            value=float(existing.get("monthly_limit", 0)), min_value=0.0, step=1000.0)
        alert_pct   = st.slider("Alert at (%)", 50, 100, int(existing.get("alert_threshold_pct", 80)))
        if st.form_submit_button("Save Budget", type="primary"):
            upsert("budgets",
                {"category": cat_to_edit, "monthly_limit": new_limit, "alert_threshold_pct": alert_pct,
                 "updated_at": "now()"},
                on_conflict="category")
            st.success(f"Saved budget for {cat_to_edit}")
            st.cache_data.clear(); st.rerun()

st.divider()

# ── Grouped view ──────────────────────────────────────────────────────────────

for gk, gv in CATEGORY_GROUPS.items():
    cats     = gv["categories"]
    g_spent  = sum(float(bmap.get(c, {}).get("spent", 0)) for c in cats)
    g_budget = sum(float(bmap.get(c, {}).get("monthly_limit", 0)) for c in cats)

    st.subheader(f"{gv['emoji']} {gv['label']}")
    if g_budget > 0:
        pct  = min(g_spent / g_budget, 1.0)
        icon = "🔴" if pct >= 1 else "🟡" if pct >= 0.8 else "🟢"
        st.progress(pct, text=f"{icon} {fmt_inr(g_spent)} / {fmt_inr(g_budget)} ({int(pct*100)}%)")

    cols = st.columns(min(len(cats), 4))
    for i, cat in enumerate(cats):
        b = bmap.get(cat)
        sp = float(b["spent"])      if b else 0.0
        bl = float(b["monthly_limit"]) if b else 0.0
        pc = int(sp/bl*100)         if bl > 0 else 0
        with cols[i % 4]:
            icon = "🔴" if pc >= 100 else "🟡" if pc >= 80 else "🟢"
            st.markdown(f"{cat_emoji(cat)} **{cat}**")
            st.markdown(f"`{fmt_inr(sp)}`" + (f" / {fmt_inr(bl)}" if bl else " *(no budget)*"))
            if bl > 0:
                st.progress(min(pc / 100, 1.0))
    st.divider()
