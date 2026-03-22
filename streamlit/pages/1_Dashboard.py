"""Dashboard — cash flow summary, budget groups, account trend."""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd

from utils.db import query, query_one
from utils.budget_period import current_period, period_label, last_n_periods, period_expr, period_range
from utils.categories import CATEGORY_GROUPS, INVESTMENT_CATEGORIES, cat_emoji, cat_color
from utils.formatters import fmt_inr

st.set_page_config(page_title="Dashboard", page_icon="📊", layout="wide")
st.title("📊 Dashboard")

PERIOD = period_expr("date")
period = current_period()
st.caption(f"Period: **{period_label(period)}**")

# ── Fetch data ────────────────────────────────────────────────────────────────

@st.cache_data(ttl=30)
def load_summary(p):
    return query(f"""
        SELECT category,
               SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS spent,
               SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)       AS income
        FROM transactions
        WHERE is_transfer = 0 AND ({PERIOD}) = %s
        GROUP BY category
    """, (p,))

@st.cache_data(ttl=30)
def load_trend(n=6):
    periods = last_n_periods(n)
    rows = query(f"""
        SELECT ({PERIOD}) AS period,
               SUM(CASE WHEN amount<0 AND is_transfer=0 THEN ABS(amount) ELSE 0 END) AS spent,
               SUM(CASE WHEN amount>0 AND is_transfer=0 THEN amount ELSE 0 END)       AS income
        FROM transactions
        WHERE ({PERIOD}) = ANY(%s::text[])
        GROUP BY ({PERIOD}) ORDER BY period
    """, (periods,))
    return rows

@st.cache_data(ttl=30)
def load_budgets(p):
    return query(f"""
        SELECT b.category, b.monthly_limit,
               COALESCE(SUM(CASE WHEN t.amount<0 THEN ABS(t.amount) ELSE 0 END),0) AS spent
        FROM budgets b
        LEFT JOIN transactions t
          ON t.category = b.category
          AND ({PERIOD.replace('date','t.date')}) = %s
          AND t.is_transfer = 0
        GROUP BY b.category, b.monthly_limit
    """, (p,))

@st.cache_data(ttl=30)
def load_accounts(p):
    return query(f"""
        SELECT a.name, a.color, a.opening_balance, a.account_type, a.tags,
               COALESCE(SUM(t.amount),0) AS tx_total
        FROM accounts a
        LEFT JOIN transactions t ON t.account_name = a.name
        WHERE a.is_active = 1
        GROUP BY a.id, a.name, a.color, a.opening_balance, a.account_type, a.tags
    """)

@st.cache_data(ttl=30)
def load_acct_history(periods):
    accounts = query("SELECT name, color, opening_balance FROM accounts WHERE is_active=1")
    if not accounts:
        return [], []
    rows = []
    for p in periods:
        _, end = period_range(p)
        row = {"period": p}
        for a in accounts:
            res = query_one("""
                SELECT COALESCE(SUM(amount),0) AS total
                FROM transactions WHERE account_name=%s AND date<=%s
            """, (a["name"], end))
            row[a["name"]] = round(float(a["opening_balance"]) + float(res["total"] or 0), 2)
        rows.append(row)
    return accounts, rows

@st.cache_data(ttl=30)
def load_recent(p, n=10):
    return query(f"""
        SELECT date, description, merchant_name, category, amount, account_name
        FROM transactions
        WHERE is_transfer=0 AND ({PERIOD})=%s
        ORDER BY date DESC, id DESC LIMIT %s
    """, (p, n))

summary   = load_summary(period)
trend     = load_trend()
budgets   = load_budgets(period)
accounts  = load_accounts(period)
recent    = load_recent(period)
periods   = last_n_periods(6)
acct_meta, acct_hist = load_acct_history(periods)

# ── Aggregate numbers ─────────────────────────────────────────────────────────

spend_map  = {}
income_map = {}
for r in summary:
    spend_map[r["category"]]  = float(r["spent"]  or 0)
    income_map[r["category"]] = float(r["income"] or 0)

total_income   = sum(income_map.values())
total_invested = sum(spend_map.get(c, 0) for c in INVESTMENT_CATEGORIES)
total_expenses = sum(v for c, v in spend_map.items() if c not in INVESTMENT_CATEGORIES and c not in {"Income","Transfers"})
remaining      = total_income - total_expenses - total_invested

budget_map = {r["category"]: r for r in budgets}

# ── Stat pills ─────────────────────────────────────────────────────────────────

c1, c2, c3, c4 = st.columns(4)
c1.metric("💰 Income",        fmt_inr(total_income))
c2.metric("💸 Expenses",      fmt_inr(total_expenses),
          f"{int(total_expenses/total_income*100) if total_income else 0}% of income")
c3.metric("📈 Invested",      fmt_inr(total_invested))
c4.metric("🏦 Remaining",     fmt_inr(max(0, remaining)))

st.divider()

# ── Cash flow bar ─────────────────────────────────────────────────────────────

if total_income > 0:
    group_spend = {}
    for gk, gv in CATEGORY_GROUPS.items():
        group_spend[gk] = sum(spend_map.get(c, 0) for c in gv["categories"])

    fig_cf = go.Figure()
    segments = [
        ("Fixed",     group_spend.get("Fixed", 0),     "#6366f1"),
        ("Household", group_spend.get("Household", 0), "#f59e0b"),
        ("Lifestyle", group_spend.get("Lifestyle", 0), "#ec4899"),
        ("Family",    group_spend.get("Family", 0),    "#fb923c"),
        ("Invested",  total_invested,                  "#10b981"),
    ]
    for label, val, color in segments:
        if val > 0:
            fig_cf.add_trace(go.Bar(
                x=[val], y=[""], orientation="h", name=f"{label} {fmt_inr(val)}",
                marker_color=color, text=label, textposition="inside",
            ))
    rem_val = max(0, total_income - sum(v for _, v, _ in segments if v > 0))
    if rem_val > 0:
        fig_cf.add_trace(go.Bar(x=[rem_val], y=[""], orientation="h", name=f"Remaining {fmt_inr(rem_val)}", marker_color="#334155"))

    fig_cf.update_layout(
        barmode="stack", height=80, showlegend=True, margin=dict(l=0,r=0,t=0,b=0),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", y=-1),
        xaxis=dict(visible=False), yaxis=dict(visible=False),
    )
    st.subheader("Where did the money go?")
    st.plotly_chart(fig_cf, use_container_width=True, config={"displayModeBar": False})

# ── Spend trend ───────────────────────────────────────────────────────────────

col_l, col_r = st.columns([2, 1])

with col_l:
    st.subheader("📉 Spend Trend")
    if trend:
        df_trend = pd.DataFrame(trend)
        df_trend["spent"]  = df_trend["spent"].astype(float)
        df_trend["period_label"] = df_trend["period"].apply(period_label)
        fig_t = px.area(df_trend, x="period_label", y="spent",
                        labels={"period_label": "", "spent": "₹ Spent"},
                        color_discrete_sequence=["#6366f1"])
        fig_t.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                            height=220, margin=dict(l=0,r=0,t=10,b=0))
        st.plotly_chart(fig_t, use_container_width=True, config={"displayModeBar": False})
    else:
        st.info("No data yet.")

with col_r:
    # Uncategorized count
    unc = query_one(f"""
        SELECT COUNT(*) AS c FROM transactions
        WHERE category='Uncategorized' AND is_transfer=0 AND ({PERIOD})=%s
    """, (period,))
    unc_count = int(unc["c"] or 0) if unc else 0
    if unc_count:
        st.warning(f"⚠️ **{unc_count} uncategorized transactions** — go to Transactions page to tag them.")

st.divider()

# ── Budget groups ─────────────────────────────────────────────────────────────

st.subheader("📌 Expenses by Group")
gcols = st.columns(len(CATEGORY_GROUPS))

for i, (gk, gv) in enumerate(CATEGORY_GROUPS.items()):
    group_cats = gv["categories"]
    g_spent  = sum(spend_map.get(c, 0) for c in group_cats)
    g_budget = sum(float(budget_map[c]["monthly_limit"]) for c in group_cats if c in budget_map)
    pct = int(g_spent / g_budget * 100) if g_budget > 0 else 0
    bar_color = "#ef4444" if pct >= 100 else "#f59e0b" if pct >= 80 else gv["color"]

    with gcols[i]:
        st.markdown(f"**{gv['emoji']} {gv['label']}**")
        st.markdown(f"`{fmt_inr(g_spent)}`" + (f" / {fmt_inr(g_budget)}" if g_budget else ""))
        if g_budget:
            st.progress(min(pct / 100, 1.0))

        with st.expander("Details", expanded=False):
            for cat in group_cats:
                spent_c  = spend_map.get(cat, 0)
                budget_c = float(budget_map[cat]["monthly_limit"]) if cat in budget_map else 0
                if spent_c > 0 or budget_c > 0:
                    pct_c = int(spent_c / budget_c * 100) if budget_c > 0 else 0
                    st.markdown(f"{cat_emoji(cat)} **{cat}**  `{fmt_inr(spent_c)}`" +
                                (f" / {fmt_inr(budget_c)}  {pct_c}%" if budget_c else ""))

st.divider()

# ── Accounts ──────────────────────────────────────────────────────────────────

if accounts:
    st.subheader("🏦 Accounts")
    a_cols = st.columns(min(len(accounts), 4))
    for i, a in enumerate(accounts):
        bal = round(float(a["opening_balance"]) + float(a["tx_total"] or 0), 2)
        with a_cols[i % 4]:
            delta_color = "normal" if bal >= 0 else "inverse"
            st.metric(f"{a['name']}", fmt_inr(bal))

    # Balance history chart
    if acct_hist and acct_meta:
        df_h = pd.DataFrame(acct_hist)
        df_h["label"] = df_h["period"].apply(period_label)
        fig_ah = go.Figure()
        for a in acct_meta:
            if a["name"] in df_h.columns:
                fig_ah.add_trace(go.Scatter(
                    x=df_h["label"], y=df_h[a["name"]],
                    name=a["name"], line=dict(color=a["color"], width=2),
                    mode="lines+markers",
                ))
        fig_ah.update_layout(
            height=250, paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            legend=dict(orientation="h"), margin=dict(l=0, r=0, t=10, b=0),
            yaxis=dict(tickprefix="₹"),
        )
        st.plotly_chart(fig_ah, use_container_width=True, config={"displayModeBar": False})

    # Investment pill
    if total_invested > 0:
        st.info(f"📈 **{fmt_inr(total_invested)} invested** this period — see Investments page for cumulative view.")

st.divider()

# ── Recent transactions ───────────────────────────────────────────────────────

st.subheader("🕐 Recent Transactions")
if recent:
    for r in recent:
        emoji = cat_emoji(r["category"] or "Uncategorized")
        amt   = float(r["amount"])
        color = "#10b981" if amt > 0 else "#ef4444"
        sign  = "+" if amt > 0 else "-"
        cols  = st.columns([1, 5, 2, 2])
        cols[0].write(emoji)
        cols[1].write(f"**{r['merchant_name'] or r['description'][:50]}**  \n_{r['date']} · {r['account_name']}_")
        cols[2].write(r["category"] or "—")
        cols[3].markdown(f"<span style='color:{color}'>{sign}{fmt_inr(amt)}</span>", unsafe_allow_html=True)
else:
    st.info("No transactions yet. Add one using the sidebar → Add Transaction.")
