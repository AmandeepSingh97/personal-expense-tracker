"""Dashboard — cash flow summary, budget groups, account trend."""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd

from utils.data import (
    get_summary, get_trend, get_budgets_with_spend,
    get_accounts_with_balance, get_account_balance_history, get_transactions
)
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import CATEGORY_GROUPS, INVESTMENT_CATEGORIES, cat_emoji, cat_color
from utils.formatters import fmt_inr

st.set_page_config(page_title="Dashboard", page_icon="📊", layout="wide")
st.title("📊 Dashboard")

# ── Period selector ───────────────────────────────────────────────────────────
periods     = last_n_periods(12)
period_opts = {p: period_label(p) for p in reversed(periods)}
cur         = current_period()
# key= persists selection across reruns
period = st.selectbox(
    "Period", list(period_opts.keys()),
    format_func=lambda p: period_opts[p],
    index=list(reversed(periods)).index(st.session_state.get("dash_period", cur)),
    key="dash_period",
    label_visibility="collapsed",
)

# ── Load data ─────────────────────────────────────────────────────────────────

summary   = get_summary(period)
trend     = get_trend(6)
budgets   = get_budgets_with_spend(period)
accounts  = get_accounts_with_balance()
acct_meta, acct_hist = get_account_balance_history(6)

spend_map     = summary.get("spend", {})
total_income  = summary.get("income", 0)
total_invested = summary.get("invest", 0)
total_expenses = sum(v for c, v in spend_map.items()
                     if c not in INVESTMENT_CATEGORIES and c not in {"Income", "Transfers"})
remaining = total_income - total_expenses - total_invested

budget_map = {r["category"]: r for r in budgets}

# ── Stat pills ─────────────────────────────────────────────────────────────────

c1, c2, c3, c4 = st.columns(4)
c1.metric("💰 Income",    fmt_inr(total_income))
c2.metric("💸 Expenses",  fmt_inr(total_expenses),
          f"{int(total_expenses/total_income*100) if total_income else 0}% of income")
c3.metric("📈 Invested",  fmt_inr(total_invested))
c4.metric("🏦 Remaining", fmt_inr(max(0, remaining)))

st.divider()

# ── Cash flow bar ─────────────────────────────────────────────────────────────

if total_income > 0:
    group_spend = {}
    for gk, gv in CATEGORY_GROUPS.items():
        group_spend[gk] = sum(spend_map.get(c, 0) for c in gv["categories"])

    fig_cf = go.Figure()
    for label, color, key in [
        ("Fixed",     "#6366f1", "Fixed"),
        ("Household", "#f59e0b", "Household"),
        ("Lifestyle", "#ec4899", "Lifestyle"),
        ("Family",    "#fb923c", "Family"),
        ("Invested",  "#10b981", None),
    ]:
        val = total_invested if key is None else group_spend.get(key, 0)
        if val > 0:
            fig_cf.add_trace(go.Bar(x=[val], y=[""], orientation="h",
                name=f"{label} {fmt_inr(val)}", marker_color=color))

    rem_val = max(0, total_income - total_expenses - total_invested)
    if rem_val > 0:
        fig_cf.add_trace(go.Bar(x=[rem_val], y=[""], orientation="h",
            name=f"Remaining {fmt_inr(rem_val)}", marker_color="#334155"))

    fig_cf.update_layout(barmode="stack", height=80, showlegend=True,
        margin=dict(l=0,r=0,t=0,b=0), paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)", legend=dict(orientation="h", y=-1.5),
        xaxis=dict(visible=False), yaxis=dict(visible=False))
    st.subheader("Where did the money go?")
    st.plotly_chart(fig_cf, use_container_width=True, config={"displayModeBar": False})

# ── Spend trend ───────────────────────────────────────────────────────────────

col_l, col_r = st.columns([2, 1])

with col_l:
    st.subheader("📉 Spend Trend")
    if trend:
        df_t = pd.DataFrame(trend)
        df_t["spent"] = df_t["spent"].astype(float)
        df_t["label"] = df_t["period"].apply(period_label)
        fig_t = px.area(df_t, x="label", y="spent",
            labels={"label": "", "spent": "₹"}, color_discrete_sequence=["#6366f1"])
        fig_t.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            height=200, margin=dict(l=0,r=0,t=10,b=0))
        st.plotly_chart(fig_t, use_container_width=True, config={"displayModeBar": False})
    else:
        st.info("No transactions yet.")

with col_r:
    # Uncategorized count
    df_period = get_transactions(period=period)
    unc_count = 0 if df_period.empty else int((df_period["category"] == "Uncategorized").sum())
    if unc_count:
        st.warning(f"⚠️ **{unc_count} uncategorized** — go to Transactions to tag them.")

st.divider()

# ── Budget groups ─────────────────────────────────────────────────────────────

st.subheader("📌 Expenses by Group")
gcols = st.columns(len(CATEGORY_GROUPS))

for i, (gk, gv) in enumerate(CATEGORY_GROUPS.items()):
    g_spent  = sum(spend_map.get(c, 0) for c in gv["categories"])
    g_budget = sum(float(budget_map.get(c, {}).get("monthly_limit", 0)) for c in gv["categories"])
    pct = int(g_spent / g_budget * 100) if g_budget > 0 else 0

    with gcols[i]:
        st.markdown(f"**{gv['emoji']} {gv['label']}**")
        st.markdown(f"`{fmt_inr(g_spent)}`" + (f" / {fmt_inr(g_budget)}" if g_budget else ""))
        if g_budget:
            st.progress(min(pct / 100, 1.0))
        with st.expander("Details"):
            for cat in gv["categories"]:
                s = spend_map.get(cat, 0)
                b = float(budget_map.get(cat, {}).get("monthly_limit", 0))
                if s > 0 or b > 0:
                    pc = int(s/b*100) if b else 0
                    icon = "🔴" if pc >= 100 else "🟡" if pc >= 80 else "🟢"
                    st.markdown(f"{icon} {cat_emoji(cat)} **{cat}** `{fmt_inr(s)}`" +
                                (f" / {fmt_inr(b)}" if b else ""))

st.divider()

# ── Accounts ──────────────────────────────────────────────────────────────────

if accounts:
    st.subheader("🏦 Accounts")
    a_cols = st.columns(min(len(accounts), 4))
    for i, a in enumerate(accounts):
        with a_cols[i % 4]:
            st.metric(a["name"], fmt_inr(a["current_balance"]))

    if acct_hist and acct_meta:
        df_h = pd.DataFrame(acct_hist)
        df_h["label"] = df_h["period"].apply(period_label)
        fig_ah = go.Figure()
        for a in acct_meta:
            if a["name"] in df_h.columns:
                fig_ah.add_trace(go.Scatter(
                    x=df_h["label"], y=df_h[a["name"]],
                    name=a["name"], line=dict(color=a["color"], width=2), mode="lines+markers",
                ))
        fig_ah.update_layout(height=240, paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)", legend=dict(orientation="h"),
            margin=dict(l=0,r=0,t=10,b=0), yaxis=dict(tickprefix="₹"))
        st.plotly_chart(fig_ah, use_container_width=True, config={"displayModeBar": False})

    if total_invested > 0:
        st.info(f"📈 **{fmt_inr(total_invested)} invested** this period — see Investments page.")

st.divider()

# ── Recent transactions ───────────────────────────────────────────────────────

st.subheader("🕐 Recent Transactions")
df_recent = get_transactions(period=period)
if df_recent.empty:
    st.info("No transactions this period. Use **Add Transaction** in the sidebar, or **Import** a bank statement.")
    if st.button("➕ Add your first transaction"):
        st.switch_page("pages/3_Add_Transaction.py")
else:
    df_show = df_recent.sort_values("date", ascending=False).head(10)
    for _, r in df_show.iterrows():
        amt   = float(r["amount"])
        emoji = cat_emoji(r.get("category") or "Uncategorized")
        color = "#10b981" if amt > 0 else "#ef4444"
        sign  = "+" if amt > 0 else "-"
        cols  = st.columns([1, 5, 2, 2])
        cols[0].write(emoji)
        cols[1].write(f"**{r.get('merchant_name') or str(r['description'])[:50]}**  \n"
                      f"_{r['date']} · {r['account_name']}_")
        cols[2].write(r.get("category") or "—")
        cols[3].markdown(f"<span style='color:{color}'>{sign}{fmt_inr(amt)}</span>",
                         unsafe_allow_html=True)
