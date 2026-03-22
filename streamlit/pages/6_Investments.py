"""Investments — cumulative view, not budgeted."""

import streamlit as st
import plotly.express as px
import pandas as pd

from utils.db import query
from utils.budget_period import period_expr, period_label
from utils.categories import cat_emoji
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Investments", page_icon="📈", layout="wide")
st.title("📈 Investments")
st.caption("Cumulative — money building wealth over time. No monthly budget limit.")

PERIOD = period_expr("date")

@st.cache_data(ttl=60)
def load():
    contributed = query("""
        SELECT category,
               ROUND(SUM(ABS(amount)),2) AS total,
               COUNT(*)::int AS count,
               MIN(date) AS first_date, MAX(date) AS last_date
        FROM transactions
        WHERE is_investment=1 AND amount<0 AND is_transfer=0
        GROUP BY category ORDER BY total DESC
    """)
    returns = query("""
        SELECT category, description, ROUND(amount,2) AS amount, date
        FROM transactions
        WHERE (category='Income' AND sub_category IN ('MSFT Dividend','NPS','Dividend','SGB Interest'))
           OR (is_investment=1 AND amount>0)
        ORDER BY date DESC
    """)
    monthly = query(f"""
        SELECT ({PERIOD}) AS month,
               ROUND(SUM(ABS(amount)),2) AS contributed,
               COUNT(*)::int AS count
        FROM transactions
        WHERE is_investment=1 AND amount<0 AND is_transfer=0
        GROUP BY ({PERIOD}) ORDER BY month
    """)
    return contributed, returns, monthly

contributed, returns, monthly = load()

total_contributed = sum(float(r["total"]) for r in contributed)
total_returns     = sum(abs(float(r["amount"])) for r in returns)

# ── Stats ─────────────────────────────────────────────────────────────────────

c1, c2, c3 = st.columns(3)
c1.metric("💰 Total Contributed", fmt_inr(total_contributed))
c2.metric("🔄 Returns Received",  fmt_inr(total_returns))
c3.metric("📊 Net Invested",      fmt_inr(total_contributed - total_returns))
st.caption("⚠️ Current market value may differ — this shows cost basis only.")

st.divider()

# ── Monthly chart ─────────────────────────────────────────────────────────────

if monthly:
    df = pd.DataFrame(monthly)
    df["contributed"] = df["contributed"].astype(float)
    df["label"]       = df["month"].apply(period_label)
    fig = px.bar(df, x="label", y="contributed", color_discrete_sequence=["#14b8a6"],
                 labels={"label": "", "contributed": "₹ Contributed"})
    fig.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      height=250, margin=dict(l=0,r=0,t=10,b=0))
    st.subheader("Monthly Contributions")
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})

# ── By fund ───────────────────────────────────────────────────────────────────

if contributed:
    st.subheader("By Investment Type")
    for r in contributed:
        pct = float(r["total"]) / total_contributed if total_contributed else 0
        c1, c2, c3 = st.columns([3, 2, 1])
        c1.write(f"{cat_emoji(r['category'])} **{r['category']}**  _{r['count']} contributions_")
        c2.write(f"`{fmt_inr(float(r['total']))}`")
        c3.write(f"{int(pct*100)}%")
        st.progress(pct)

# ── Returns ───────────────────────────────────────────────────────────────────

if returns:
    st.divider()
    st.subheader("↩️ Returns & Redemptions")
    st.caption("Money that came back from investments — dividends, NPS, redemptions")
    for r in returns:
        amt = float(r["amount"])
        c1, c2 = st.columns([4, 1])
        c1.write(f"**{r['description'][:60]}**  _{fmt_date(r['date'])} · {r['category']}_")
        c2.markdown(f"<span style='color:#10b981'>+{fmt_inr(abs(amt))}</span>", unsafe_allow_html=True)
