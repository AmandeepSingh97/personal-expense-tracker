"""Budgets — grouped view with progress bars."""

import streamlit as st

from utils.db import query, execute
from utils.budget_period import current_period, period_label, period_expr
from utils.categories import CATEGORY_GROUPS, cat_emoji, cat_color
from utils.formatters import fmt_inr

st.set_page_config(page_title="Budgets", page_icon="💳", layout="wide")
st.title("💳 Budgets")

PERIOD = period_expr("date")
period = current_period()
st.caption(f"Period: **{period_label(period)}**")

@st.cache_data(ttl=30)
def load_budgets(p):
    return query(f"""
        SELECT b.category, b.monthly_limit, b.alert_threshold_pct,
               COALESCE(SUM(CASE WHEN t.amount<0 THEN ABS(t.amount) ELSE 0 END),0) AS spent
        FROM budgets b
        LEFT JOIN transactions t
          ON t.category=b.category AND ({PERIOD.replace('date','t.date')})=%s AND t.is_transfer=0
        GROUP BY b.category, b.monthly_limit, b.alert_threshold_pct
    """, (p,))

budgets = load_budgets(period)
budget_map = {r["category"]: r for r in budgets}

total_budget = sum(float(r["monthly_limit"]) for r in budgets)
total_spent  = sum(float(r["spent"]) for r in budgets)
st.metric("Total Budgeted", fmt_inr(total_budget), f"Spent: {fmt_inr(total_spent)}")

# ── Edit budget form ──────────────────────────────────────────────────────────

with st.expander("⚙️ Edit / Add Budget"):
    with st.form("edit_budget"):
        all_cats = [c for g in CATEGORY_GROUPS.values() for c in g["categories"]]
        cat_to_edit = st.selectbox("Category", all_cats, format_func=lambda c: f"{cat_emoji(c)} {c}")
        existing = budget_map.get(cat_to_edit, {})
        new_limit = st.number_input("Monthly Limit (₹)",
            value=float(existing.get("monthly_limit", 0)), min_value=0.0, step=1000.0)
        alert_pct = st.slider("Alert at (%)", 50, 100, int(existing.get("alert_threshold_pct", 80)))
        if st.form_submit_button("Save Budget", type="primary"):
            execute("""
                INSERT INTO budgets (category, monthly_limit, alert_threshold_pct, updated_at)
                VALUES (%s,%s,%s,NOW())
                ON CONFLICT(category) DO UPDATE SET
                  monthly_limit=EXCLUDED.monthly_limit,
                  alert_threshold_pct=EXCLUDED.alert_threshold_pct,
                  updated_at=EXCLUDED.updated_at
            """, (cat_to_edit, new_limit, alert_pct))
            st.success(f"Budget saved for {cat_to_edit}")
            st.cache_data.clear()
            st.rerun()

st.divider()

# ── Grouped budget cards ──────────────────────────────────────────────────────

for gk, gv in CATEGORY_GROUPS.items():
    g_cats   = gv["categories"]
    g_spent  = sum(float(budget_map.get(c, {}).get("spent", 0)) for c in g_cats)
    g_budget = sum(float(budget_map.get(c, {}).get("monthly_limit", 0)) for c in g_cats)

    st.subheader(f"{gv['emoji']} {gv['label']}")
    if g_budget > 0:
        pct = min(g_spent / g_budget, 1.0)
        label_color = "🔴" if pct >= 1 else "🟡" if pct >= 0.8 else "🟢"
        st.progress(pct, text=f"{label_color} {fmt_inr(g_spent)} / {fmt_inr(g_budget)} ({int(pct*100)}%)")

    cols = st.columns(min(len(g_cats), 4))
    for i, cat in enumerate(g_cats):
        b = budget_map.get(cat)
        spent_c  = float(b["spent"]) if b else 0.0
        budget_c = float(b["monthly_limit"]) if b else 0.0
        pct_c    = int(spent_c / budget_c * 100) if budget_c > 0 else 0

        with cols[i % 4]:
            color_icon = "🔴" if pct_c >= 100 else "🟡" if pct_c >= 80 else "🟢"
            st.markdown(f"{cat_emoji(cat)} **{cat}**")
            st.markdown(f"`{fmt_inr(spent_c)}`" + (f" / {fmt_inr(budget_c)}" if budget_c else " *(no budget)*"))
            if budget_c > 0:
                st.progress(min(pct_c / 100, 1.0))

    st.divider()
