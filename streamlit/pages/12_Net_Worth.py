"""Net Worth Dashboard — total wealth overview, trends, and allocation."""

import streamlit as st
import plotly.graph_objects as go
import pandas as pd

from utils.data import (
    _all_transactions, get_accounts_with_balance,
    get_account_balance_history, get_investment_summary,
)
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import cat_emoji
from utils.formatters import fmt_inr

st.set_page_config(page_title="Net Worth", page_icon="💎", layout="wide")
st.title("💎 Net Worth Dashboard")

# ── Load data ─────────────────────────────────────────────────────────────────

accounts  = get_accounts_with_balance()
acct_meta, acct_hist = get_account_balance_history(12)
inv       = get_investment_summary()
df_all    = _all_transactions()
cur       = current_period()

if not accounts:
    st.info("No accounts yet. Head to **Accounts** to add your first account.")
    st.stop()

# ── Compute net worth ─────────────────────────────────────────────────────────

net_worth = sum(a["current_balance"] for a in accounts)

# Previous period net worth (from history)
periods_12 = last_n_periods(12)
prev_period_nw = None
cur_period_nw  = None
if acct_hist and len(acct_hist) >= 2:
    acct_names = [a["name"] for a in acct_meta]
    # Current period is the last entry in history
    cur_row = acct_hist[-1]
    cur_period_nw = sum(cur_row.get(n, 0) for n in acct_names)
    # Previous period is second-to-last
    prev_row = acct_hist[-2]
    prev_period_nw = sum(prev_row.get(n, 0) for n in acct_names)

monthly_change = None
if prev_period_nw is not None and cur_period_nw is not None:
    monthly_change = cur_period_nw - prev_period_nw

# ── 1. Net worth headline with delta ─────────────────────────────────────────

c1, c2, c3 = st.columns(3)
with c1:
    delta_str = None
    if monthly_change is not None:
        sign = "+" if monthly_change >= 0 else ""
        delta_str = f"{sign}{fmt_inr(monthly_change)}"
    st.metric("💰 Total Net Worth", fmt_inr(net_worth), delta=delta_str)

with c2:
    # Investment total (cost basis)
    total_invested = inv["total_contributed"]
    st.metric("📈 Total Invested", fmt_inr(total_invested))

with c3:
    # Savings / checking = net worth minus invested
    savings_balance = net_worth - total_invested
    st.metric("🏦 Savings & Checking", fmt_inr(savings_balance))

st.divider()

# ── 2. Growth rates ──────────────────────────────────────────────────────────

if acct_hist and len(acct_hist) >= 2:
    acct_names = [a["name"] for a in acct_meta]
    nw_series = []
    for row in acct_hist:
        nw_series.append({
            "period": row["period"],
            "net_worth": sum(row.get(n, 0) for n in acct_names),
        })

    c1, c2, c3 = st.columns(3)

    # Month-over-month growth
    latest_nw = nw_series[-1]["net_worth"]
    prev_nw   = nw_series[-2]["net_worth"]
    mom_growth = ((latest_nw - prev_nw) / abs(prev_nw) * 100) if prev_nw != 0 else 0
    with c1:
        st.metric(
            "📊 Month-over-Month",
            f"{mom_growth:+.1f}%",
            delta=fmt_inr(latest_nw - prev_nw),
        )

    # 3-month growth (if enough data)
    if len(nw_series) >= 4:
        nw_3m_ago = nw_series[-4]["net_worth"]
        growth_3m = ((latest_nw - nw_3m_ago) / abs(nw_3m_ago) * 100) if nw_3m_ago != 0 else 0
        with c2:
            st.metric(
                "📊 3-Month Growth",
                f"{growth_3m:+.1f}%",
                delta=fmt_inr(latest_nw - nw_3m_ago),
            )
    else:
        with c2:
            st.metric("📊 3-Month Growth", "—", help="Need at least 4 periods of data")

    # Year-over-year growth (if 12+ periods)
    if len(nw_series) >= 12:
        nw_yoy = nw_series[-12]["net_worth"]
        yoy_growth = ((latest_nw - nw_yoy) / abs(nw_yoy) * 100) if nw_yoy != 0 else 0
        with c3:
            st.metric(
                "📊 Year-over-Year",
                f"{yoy_growth:+.1f}%",
                delta=fmt_inr(latest_nw - nw_yoy),
            )
    else:
        with c3:
            st.metric("📊 Year-over-Year", "—", help="Need 12 periods of data")

    st.divider()

# ── 3. Net worth trend line chart ────────────────────────────────────────────

st.subheader("📈 Net Worth Trend (Last 12 Periods)")

if acct_hist and acct_meta:
    acct_names = [a["name"] for a in acct_meta]
    trend_data = []
    for row in acct_hist:
        trend_data.append({
            "period": row["period"],
            "label":  period_label(row["period"]),
            "net_worth": sum(row.get(n, 0) for n in acct_names),
        })
    df_trend = pd.DataFrame(trend_data)

    fig_nw = go.Figure()
    fig_nw.add_trace(go.Scatter(
        x=df_trend["label"], y=df_trend["net_worth"],
        mode="lines+markers+text",
        line=dict(color="#6366f1", width=3),
        marker=dict(size=8),
        text=[fmt_inr(v) for v in df_trend["net_worth"]],
        textposition="top center",
        textfont=dict(size=10),
        name="Net Worth",
        fill="tozeroy",
        fillcolor="rgba(99,102,241,0.1)",
    ))
    fig_nw.update_layout(
        height=350,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="₹", gridcolor="rgba(128,128,128,0.1)"),
        xaxis=dict(gridcolor="rgba(128,128,128,0.1)"),
        showlegend=False,
    )
    st.plotly_chart(fig_nw, use_container_width=True, config={"displayModeBar": False})
else:
    st.info("Not enough history data to show trend.")

st.divider()

# ── 4. Asset allocation & Investment vs Savings ──────────────────────────────

col_pie, col_split = st.columns(2)

with col_pie:
    st.subheader("🍩 Asset Allocation")
    # Pie chart by account
    alloc_data = [
        {"account": a["name"], "balance": a["current_balance"], "color": a.get("color", "#6366f1")}
        for a in accounts if a["current_balance"] != 0
    ]
    if alloc_data:
        df_alloc = pd.DataFrame(alloc_data)
        colors = [d["color"] for d in alloc_data]
        fig_pie = go.Figure(go.Pie(
            labels=df_alloc["account"],
            values=df_alloc["balance"].abs(),
            hole=0.45,
            marker=dict(colors=colors),
            textinfo="label+percent",
            textposition="outside",
            hovertemplate="%{label}<br>₹%{value:,.0f}<br>%{percent}<extra></extra>",
        ))
        fig_pie.update_layout(
            height=350,
            paper_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=0, r=0, t=10, b=0),
            showlegend=False,
        )
        st.plotly_chart(fig_pie, use_container_width=True, config={"displayModeBar": False})
    else:
        st.info("No account balances to display.")

with col_split:
    st.subheader("📊 Investment vs Savings Split")
    # Investment accounts vs savings/checking
    inv_accounts = [a for a in accounts if a.get("account_type") == "investment"]
    non_inv_accounts = [a for a in accounts if a.get("account_type") != "investment"]

    inv_balance = total_invested if total_invested > 0 else sum(
        a["current_balance"] for a in inv_accounts
    )
    savings_bal = net_worth - inv_balance

    split_data = []
    if inv_balance > 0:
        split_data.append({"type": "Investments", "amount": inv_balance})
    if savings_bal > 0:
        split_data.append({"type": "Savings & Checking", "amount": savings_bal})

    if split_data:
        df_split = pd.DataFrame(split_data)
        fig_split = go.Figure(go.Pie(
            labels=df_split["type"],
            values=df_split["amount"],
            hole=0.45,
            marker=dict(colors=["#14b8a6", "#6366f1"]),
            textinfo="label+percent+value",
            texttemplate="%{label}<br>₹%{value:,.0f}<br>(%{percent})",
            textposition="outside",
        ))
        fig_split.update_layout(
            height=350,
            paper_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=0, r=0, t=10, b=0),
            showlegend=False,
        )
        st.plotly_chart(fig_split, use_container_width=True, config={"displayModeBar": False})

        # Text summary
        inv_pct = inv_balance / net_worth * 100 if net_worth > 0 else 0
        sav_pct = savings_bal / net_worth * 100 if net_worth > 0 else 0
        st.markdown(
            f"- **Investments**: {fmt_inr(inv_balance)} ({inv_pct:.1f}%)  \n"
            f"- **Savings & Checking**: {fmt_inr(savings_bal)} ({sav_pct:.1f}%)"
        )

        # Break down investments by category
        if inv["contributed"]:
            st.markdown("**Investment breakdown:**")
            for c in inv["contributed"]:
                pct = float(c["total"]) / total_invested * 100 if total_invested > 0 else 0
                st.markdown(f"  - {cat_emoji(c['category'])} {c['category']}: {fmt_inr(c['total'])} ({pct:.0f}%)")
    else:
        st.info("No data for split view.")

st.divider()

# ── 5. Per-account balance trend (stacked area) ─────────────────────────────

st.subheader("📉 Account Balance Trend")

if acct_hist and acct_meta:
    df_h = pd.DataFrame(acct_hist)
    df_h["label"] = df_h["period"].apply(period_label)

    fig_stack = go.Figure()
    for a in acct_meta:
        if a["name"] in df_h.columns:
            fig_stack.add_trace(go.Scatter(
                x=df_h["label"], y=df_h[a["name"]],
                name=a["name"],
                mode="lines",
                line=dict(color=a.get("color", "#6366f1"), width=2),
                stackgroup="one",
                hovertemplate=f"{a['name']}<br>" + "₹%{y:,.0f}<extra></extra>",
            ))
    fig_stack.update_layout(
        height=350,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=10, b=0),
        legend=dict(orientation="h"),
        yaxis=dict(tickprefix="₹", gridcolor="rgba(128,128,128,0.1)"),
        xaxis=dict(gridcolor="rgba(128,128,128,0.1)"),
    )
    st.plotly_chart(fig_stack, use_container_width=True, config={"displayModeBar": False})

st.divider()

# ── 6. Account breakdown table ───────────────────────────────────────────────

st.subheader("🗂️ Account Breakdown")

if accounts and not df_all.empty:
    table_rows = []
    for a in accounts:
        name = a["name"]
        opening = float(a["opening_balance"])
        sub = df_all[df_all["account_name"] == name]

        total_deposits    = float(sub[sub["amount"] > 0]["amount"].sum()) if not sub.empty else 0.0
        total_withdrawals = float(sub[sub["amount"] < 0]["amount"].sum()) if not sub.empty else 0.0
        current = a["current_balance"]

        # Current period activity
        cur_sub = sub[sub["period"] == cur] if not sub.empty else pd.DataFrame()
        period_deposits    = float(cur_sub[cur_sub["amount"] > 0]["amount"].sum()) if not cur_sub.empty else 0.0
        period_withdrawals = float(cur_sub[cur_sub["amount"] < 0]["amount"].sum()) if not cur_sub.empty else 0.0

        table_rows.append({
            "Account":             name,
            "Type":                a.get("account_type", "savings").title(),
            "Opening Balance":     fmt_inr(opening),
            "Total Deposits":      fmt_inr(total_deposits),
            "Total Withdrawals":   fmt_inr(abs(total_withdrawals)),
            "Current Balance":     fmt_inr(current),
            "This Period In":      fmt_inr(period_deposits),
            "This Period Out":     fmt_inr(abs(period_withdrawals)),
            "_sort_balance":       current,
        })

    df_table = pd.DataFrame(table_rows).sort_values("_sort_balance", ascending=False)
    df_table = df_table.drop(columns=["_sort_balance"])
    st.dataframe(df_table, use_container_width=True, hide_index=True)
elif accounts:
    # No transactions yet, show basic table
    basic_rows = []
    for a in accounts:
        basic_rows.append({
            "Account":         a["name"],
            "Type":            a.get("account_type", "savings").title(),
            "Opening Balance": fmt_inr(float(a["opening_balance"])),
            "Current Balance": fmt_inr(a["current_balance"]),
        })
    st.dataframe(pd.DataFrame(basic_rows), use_container_width=True, hide_index=True)

st.divider()

# ── 7. Monthly change waterfall ──────────────────────────────────────────────

st.subheader("📊 Monthly Net Worth Change")

if acct_hist and len(acct_hist) >= 2:
    acct_names = [a["name"] for a in acct_meta]
    changes = []
    for i in range(1, len(acct_hist)):
        prev_total = sum(acct_hist[i-1].get(n, 0) for n in acct_names)
        curr_total = sum(acct_hist[i].get(n, 0) for n in acct_names)
        delta = curr_total - prev_total
        changes.append({
            "period": acct_hist[i]["period"],
            "label":  period_label(acct_hist[i]["period"]),
            "change": delta,
            "color":  "#10b981" if delta >= 0 else "#ef4444",
        })

    df_changes = pd.DataFrame(changes)
    fig_bar = go.Figure()
    fig_bar.add_trace(go.Bar(
        x=df_changes["label"],
        y=df_changes["change"],
        marker_color=df_changes["color"],
        text=[fmt_inr(v) for v in df_changes["change"]],
        textposition="outside",
        textfont=dict(size=10),
        hovertemplate="%{x}<br>₹%{y:,.0f}<extra></extra>",
    ))
    fig_bar.update_layout(
        height=300,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="₹", gridcolor="rgba(128,128,128,0.1)"),
        xaxis=dict(gridcolor="rgba(128,128,128,0.1)"),
        showlegend=False,
    )
    fig_bar.add_hline(y=0, line_dash="dash", line_color="rgba(128,128,128,0.4)")
    st.plotly_chart(fig_bar, use_container_width=True, config={"displayModeBar": False})

    # Average monthly change
    avg_change = sum(c["change"] for c in changes) / len(changes)
    positive_months = sum(1 for c in changes if c["change"] >= 0)
    st.caption(
        f"Average monthly change: **{fmt_inr(avg_change)}** | "
        f"Positive months: **{positive_months}/{len(changes)}**"
    )
else:
    st.info("Need at least 2 periods of history to show monthly changes.")
