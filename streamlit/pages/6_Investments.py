"""Investments — cumulative view."""

import streamlit as st
import plotly.express as px
import pandas as pd

from utils.data import get_investment_summary
from utils.budget_period import period_label
from utils.categories import cat_emoji
from utils.formatters import fmt_inr, fmt_date

st.title("📈 Investments")
st.caption("Cumulative — money building wealth. No monthly budget limit.")

inv = get_investment_summary()
total_c = inv["total_contributed"]
total_r = inv["total_returns"]

c1, c2, c3 = st.columns(3)
c1.metric("💰 Contributed", fmt_inr(total_c))
c2.metric("🔄 Returns",     fmt_inr(total_r))
c3.metric("📊 Returns - Cost", fmt_inr(total_r - total_c))
st.caption("⚠️ Cost basis only — current market value may differ.")
st.divider()

if inv["monthly"]:
    df = pd.DataFrame(inv["monthly"])
    df["contributed"] = df["contributed"].astype(float)
    df["label"] = df["period"].apply(period_label)
    fig = px.bar(df, x="label", y="contributed", color_discrete_sequence=["#14b8a6"],
                 labels={"label": "", "contributed": "₹"})
    fig.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      height=220, margin=dict(l=0,r=0,t=10,b=0))
    st.subheader("Monthly Contributions")
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})

if inv["contributed"]:
    st.subheader("By Type")
    for r in inv["contributed"]:
        pct = float(r["total"]) / total_c if total_c else 0
        c1, c2, c3 = st.columns([3,2,1])
        c1.write(f"{cat_emoji(r['category'])} **{r['category']}** _{r['count']} contributions_")
        c2.write(f"`{fmt_inr(float(r['total']))}`")
        c3.write(f"{int(pct*100)}%")
        st.progress(pct)

if inv["returns"]:
    st.divider()
    st.subheader("↩️ Returns & Redemptions")
    for r in inv["returns"]:
        amt = float(r["amount"])
        c1, c2 = st.columns([4,1])
        c1.write(f"**{str(r['description'])[:60]}**  _{fmt_date(r['date'])} · {r['category']}_")
        c2.markdown(f"<span style='color:#10b981'>+{fmt_inr(abs(amt))}</span>", unsafe_allow_html=True)
