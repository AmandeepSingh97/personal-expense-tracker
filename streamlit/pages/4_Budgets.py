"""Budgets — grouped view with progress bars and one-click seed."""

import streamlit as st
from datetime import datetime, timezone
from utils.db import select_all, upsert
from utils.data import get_budgets_with_spend
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import CATEGORY_GROUPS, cat_emoji
from utils.formatters import fmt_inr

st.title("💳 Budgets")

# ── Period selector ───────────────────────────────────────────────────────────
periods     = last_n_periods(12)
period_opts = {p: period_label(p) for p in reversed(periods)}
cur         = current_period()
period = st.selectbox("Period", list(period_opts.keys()),
    format_func=lambda p: period_opts[p],
    index=list(reversed(periods)).index(st.session_state.get("budgets_period", cur)),
    key="budgets_period",
    label_visibility="collapsed")

budgets = get_budgets_with_spend(period)
bmap    = {r["category"]: r for r in budgets}

total_budget = sum(float(r["monthly_limit"]) for r in budgets)
total_spent  = sum(float(r["spent"])         for r in budgets)
c1, c2, c3 = st.columns(3)
c1.metric("Total Budgeted", fmt_inr(total_budget))
c2.metric("Total Spent",    fmt_inr(total_spent))
c3.metric("Remaining",      fmt_inr(max(0, total_budget - total_spent)))

st.divider()

# ── One-click budget seed ─────────────────────────────────────────────────────
MY_BUDGETS = [
    ("Rent",                  45000), ("Maid",                      0),
    ("Cook",                      0), ("SIPs",                  37000),
    ("Groceries",             10000), ("Electricity",            1000),
    ("WiFi",                   3000), ("Outing",                 8000),
    ("Cylinder",                500), ("Car Loan",              46000),
    ("Petrol",                 5000), ("PPF",                       0),
    ("Insurance",              6000), ("Emergency Cash",             0),
    ("Holiday",               10000), ("Home Savings",               0),
    ("Personal Expenses",     20000), ("LIC",                        0),
    ("Send to Parents",       20000), ("Preet Badminton",         3000),
    ("Preet Beauty Products",  2000), ("Donation",                1100),
]

seeded_cats = {b["category"] for b in budgets}
missing     = [cat for cat, _ in MY_BUDGETS if cat not in seeded_cats]

if missing:
    label = f"🚀 Seed all {len(MY_BUDGETS)} budgets" if not budgets else f"🚀 Add {len(missing)} missing budgets"
    st.info(f"{len(missing)} budget categories not yet set." if budgets else "No budgets set yet.")
    if st.button(label, type="primary"):
        now = datetime.now(timezone.utc).isoformat()
        for cat, limit in [(c, l) for c, l in MY_BUDGETS if c in missing]:
            upsert("budgets",
                {"category": cat, "monthly_limit": limit,
                 "alert_threshold_pct": 80, "updated_at": now},
                on_conflict="category")
        st.success(f"✅ {len(missing)} budgets created!")
        st.cache_data.clear(); st.rerun()

# ── Edit / Add a single budget ─────────────────────────────────────────────────

with st.expander("⚙️ Edit / Add Budget"):
    all_cats = [c for g in CATEGORY_GROUPS.values() for c in g["categories"]]
    with st.form("edit_budget"):
        cat_to_edit = st.selectbox("Category", all_cats, format_func=lambda c: f"{cat_emoji(c)} {c}")
        existing    = bmap.get(cat_to_edit, {})
        new_limit   = st.number_input("Monthly Limit (₹)",
            value=float(existing.get("monthly_limit", 0)), min_value=0.0, step=1000.0)
        alert_pct   = st.slider("Alert at (%)", 50, 100, int(existing.get("alert_threshold_pct", 80)))
        if st.form_submit_button("Save", type="primary"):
            now = datetime.now(timezone.utc).isoformat()
            upsert("budgets",
                {"category": cat_to_edit, "monthly_limit": new_limit,
                 "alert_threshold_pct": alert_pct, "updated_at": now},
                on_conflict="category")
            st.success(f"Saved budget for {cat_to_edit}")
            st.cache_data.clear(); st.rerun()

st.divider()

# ── Grouped budget view ───────────────────────────────────────────────────────

for gk, gv in CATEGORY_GROUPS.items():
    cats     = gv["categories"]
    g_spent  = sum(float(bmap.get(c, {}).get("spent", 0)) for c in cats)
    g_budget = sum(float(bmap.get(c, {}).get("monthly_limit", 0)) for c in cats)

    hdr_cols = st.columns([5, 2])
    hdr_cols[0].subheader(f"{gv['emoji']} {gv['label']}")
    if g_budget > 0:
        pct  = min(g_spent / g_budget, 1.0)
        icon = "🔴" if pct >= 1 else "🟡" if pct >= 0.8 else "🟢"
        hdr_cols[1].markdown(f"**{fmt_inr(g_spent)}** / {fmt_inr(g_budget)} {icon}")
        st.progress(pct)

    cols = st.columns(min(len(cats), 4))
    for i, cat in enumerate(cats):
        b  = bmap.get(cat)
        sp = float(b["spent"])         if b else 0.0
        bl = float(b["monthly_limit"]) if b else 0.0
        pc = int(sp / bl * 100)        if bl > 0 else 0
        with cols[i % 4]:
            icon = "🔴" if pc >= 100 else "🟡" if pc >= 80 else ""
            st.markdown(f"{icon} {cat_emoji(cat)} **{cat}**")
            if bl > 0:
                st.caption(f"{fmt_inr(sp)} / {fmt_inr(bl)} · {pc}%")
                st.progress(min(pc / 100, 1.0))
            elif sp > 0:
                st.caption(f"{fmt_inr(sp)} *(no budget)*")
            else:
                st.caption("—")
    st.divider()
