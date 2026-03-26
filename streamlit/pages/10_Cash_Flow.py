"""Cash Flow Forecast — projections, balance forecasts, savings rate trend."""

import streamlit as st
import plotly.graph_objects as go
import pandas as pd
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

from utils.data import _all_transactions, get_transactions, get_accounts_with_balance
from utils.budget_period import current_period, period_label, last_n_periods, period_range
from utils.categories import INVESTMENT_CATEGORIES, SYSTEM_CATEGORIES
from utils.formatters import fmt_inr

st.set_page_config(page_title="Cash Flow", page_icon="📈", layout="wide")
st.title("📈 Cash Flow Forecast")

# ── Helper: compute period-level income and expense totals ───────────────────

def _period_totals(df: pd.DataFrame, period_key: str) -> dict:
    """Return income, expenses, investments for a single period."""
    sub = df[df["period"] == period_key]
    if sub.empty:
        return {"income": 0.0, "expenses": 0.0, "investments": 0.0}
    income = float(sub[sub["amount"] > 0]["amount"].sum())
    expenses = float(sub[(sub["amount"] < 0) & (~sub["category"].isin(INVESTMENT_CATEGORIES))]["amount"].sum())
    investments = float(sub[(sub["amount"] < 0) & (sub["category"].isin(INVESTMENT_CATEGORIES))]["amount"].sum())
    return {"income": income, "expenses": abs(expenses), "investments": abs(investments)}


# ── Load data ────────────────────────────────────────────────────────────────

df_all = _all_transactions()
if df_all.empty:
    st.info("No transactions found. Import a bank statement to get started.")
    st.stop()

# Filter out transfers for all analyses
df = df_all[df_all["is_transfer"] == 0].copy()

cur_period = current_period()
cur_start_str, cur_end_str = period_range(cur_period)
cur_start = date.fromisoformat(cur_start_str)
cur_end = date.fromisoformat(cur_end_str)
today = date.today()

# Historical periods for averaging (last 3 completed periods before current)
hist_periods = last_n_periods(4)  # includes current
# Remove the current period so we only average completed ones
hist_periods = [p for p in hist_periods if p != cur_period][-3:]

# ── Compute averages from historical periods ─────────────────────────────────

hist_income = []
hist_expenses = []
hist_investments = []

for p in hist_periods:
    totals = _period_totals(df, p)
    hist_income.append(totals["income"])
    hist_expenses.append(totals["expenses"])
    hist_investments.append(totals["investments"])

avg_income = sum(hist_income) / len(hist_income) if hist_income else 0.0
avg_expenses = sum(hist_expenses) / len(hist_expenses) if hist_expenses else 0.0
avg_investments = sum(hist_investments) / len(hist_investments) if hist_investments else 0.0

# ── Section 1: Current Period Projection ─────────────────────────────────────

st.subheader("Current Period Projection")
st.caption(f"Period: **{period_label(cur_period)}**")

cur_totals = _period_totals(df, cur_period)
cur_income_actual = cur_totals["income"]
cur_expenses_actual = cur_totals["expenses"]
cur_investments_actual = cur_totals["investments"]

total_days = (cur_end - cur_start).days + 1
days_elapsed = max((today - cur_start).days + 1, 1)
days_remaining = max((cur_end - today).days, 0)
progress_pct = min(days_elapsed / total_days, 1.0)

# Project expenses: actual so far + (daily run rate * remaining days)
if days_elapsed > 0 and days_remaining > 0:
    daily_expense_rate = cur_expenses_actual / days_elapsed
    projected_expenses = cur_expenses_actual + (daily_expense_rate * days_remaining)
    daily_invest_rate = cur_investments_actual / days_elapsed
    projected_investments = cur_investments_actual + (daily_invest_rate * days_remaining)
else:
    projected_expenses = cur_expenses_actual
    projected_investments = cur_investments_actual

# Income: if salary already received this period, use actual; otherwise use avg
projected_income = cur_income_actual if cur_income_actual > 0 else avg_income

c1, c2, c3, c4 = st.columns(4)
c1.metric("Days Elapsed / Total", f"{days_elapsed} / {total_days}")
c2.metric("Projected Income", fmt_inr(projected_income))
c3.metric(
    "Projected Expenses",
    fmt_inr(projected_expenses),
    f"{fmt_inr(cur_expenses_actual)} so far",
)
c4.metric(
    "Projected Surplus",
    fmt_inr(projected_income - projected_expenses - projected_investments),
)

st.progress(progress_pct, text=f"{int(progress_pct * 100)}% of period elapsed")

st.divider()

# ── Section 2: Balance Forecast (30/60/90 days) ─────────────────────────────

st.subheader("Balance Forecast")
st.caption("Projected account balances using average monthly income and expenses")

accounts = get_accounts_with_balance()
if accounts:
    total_balance = sum(a["current_balance"] for a in accounts)

    # Monthly net flow = avg income - avg expenses - avg investments
    monthly_net = avg_income - avg_expenses - avg_investments
    daily_net = monthly_net / 30.0

    forecast_cols = st.columns(4)
    forecast_cols[0].metric("Current Balance", fmt_inr(total_balance))
    for i, days_out in enumerate([30, 60, 90]):
        projected = total_balance + (daily_net * days_out)
        delta_str = f"{'+' if daily_net * days_out >= 0 else ''}{fmt_inr(daily_net * days_out)}"
        forecast_cols[i + 1].metric(
            f"In {days_out} Days",
            fmt_inr(projected),
            delta_str,
        )
else:
    st.info("No active accounts found.")

st.divider()

# ── Section 3: Income vs Expenses — Next 3 Periods ──────────────────────────

st.subheader("Expected Income vs Expenses — Next 3 Periods")

# Build future period keys
def _next_n_periods(n: int) -> list[str]:
    """Return next N period keys after the current one."""
    periods = []
    year, month = map(int, cur_period.split("-"))
    d = date(year, month, 1)
    for _ in range(n):
        d = d + relativedelta(months=1)
        periods.append(d.strftime("%Y-%m"))
    return periods


future_periods = _next_n_periods(3)

bar_data = []
for p in future_periods:
    bar_data.append({
        "period": period_label(p),
        "Projected Income": round(avg_income, 0),
        "Projected Expenses": round(avg_expenses, 0),
        "Projected Investments": round(avg_investments, 0),
    })

if bar_data:
    df_bar = pd.DataFrame(bar_data)
    fig_bar = go.Figure()
    fig_bar.add_trace(go.Bar(
        x=df_bar["period"], y=df_bar["Projected Income"],
        name="Income", marker_color="#10b981",
    ))
    fig_bar.add_trace(go.Bar(
        x=df_bar["period"], y=df_bar["Projected Expenses"],
        name="Expenses", marker_color="#ef4444",
    ))
    fig_bar.add_trace(go.Bar(
        x=df_bar["period"], y=df_bar["Projected Investments"],
        name="Investments", marker_color="#6366f1",
    ))
    fig_bar.update_layout(
        barmode="group",
        height=350,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", y=-0.15),
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="₹"),
    )
    st.plotly_chart(fig_bar, use_container_width=True, config={"displayModeBar": False})

    # Summary table below the chart
    surplus = avg_income - avg_expenses - avg_investments
    st.markdown(
        f"**Avg monthly:** Income {fmt_inr(avg_income)} "
        f"| Expenses {fmt_inr(avg_expenses)} "
        f"| Investments {fmt_inr(avg_investments)} "
        f"| **Surplus {fmt_inr(surplus)}**"
    )

st.divider()

# ── Section 4: Day-by-Day Forecast — Next 30 Days ───────────────────────────

st.subheader("Day-by-Day Balance Forecast — Next 30 Days")
st.caption("Based on recurring transaction patterns from recent periods")

# Find recurring expense patterns by day-of-month from historical data
df_hist = df[df["period"].isin(hist_periods)].copy()

# Build a daily recurring pattern: average spend/income per day-of-month
recurring_by_dom = {}
if not df_hist.empty:
    df_hist["date_parsed"] = pd.to_datetime(df_hist["date"], errors="coerce")
    df_hist["dom"] = df_hist["date_parsed"].dt.day
    # Group by day-of-month and compute average net flow across periods
    dom_agg = df_hist.groupby("dom")["amount"].sum() / max(len(hist_periods), 1)
    recurring_by_dom = dom_agg.to_dict()

# Build 30-day forecast line
if accounts:
    forecast_dates = []
    forecast_balances = []
    running_balance = total_balance

    for i in range(31):
        d = today + timedelta(days=i)
        dom = d.day
        daily_flow = recurring_by_dom.get(dom, daily_net)
        if i == 0:
            # Today: use actual balance
            forecast_balances.append(running_balance)
        else:
            running_balance += daily_flow
            forecast_balances.append(running_balance)
        forecast_dates.append(d)

    df_forecast = pd.DataFrame({
        "Date": forecast_dates,
        "Projected Balance": forecast_balances,
    })

    fig_line = go.Figure()
    fig_line.add_trace(go.Scatter(
        x=df_forecast["Date"],
        y=df_forecast["Projected Balance"],
        mode="lines+markers",
        line=dict(color="#6366f1", width=2),
        marker=dict(size=4),
        name="Projected Balance",
        hovertemplate="<b>%{x|%d %b}</b><br>₹%{y:,.0f}<extra></extra>",
    ))

    # Add a horizontal line for current balance reference
    fig_line.add_hline(
        y=total_balance,
        line_dash="dash",
        line_color="#94a3b8",
        annotation_text=f"Today: {fmt_inr(total_balance)}",
        annotation_position="top left",
    )

    # Mark salary date(s) — 25th of each month
    for i in range(31):
        d = today + timedelta(days=i)
        if d.day == 25:
            fig_line.add_vline(
                x=d,
                line_dash="dot",
                line_color="#10b981",
                annotation_text="Salary day",
            )

    fig_line.update_layout(
        height=350,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="₹"),
        xaxis=dict(dtick="D5", tickformat="%d %b"),
        showlegend=False,
    )
    st.plotly_chart(fig_line, use_container_width=True, config={"displayModeBar": False})
else:
    st.info("No active accounts to forecast balances for.")

st.divider()

# ── Section 5: Savings Rate Trend — Last 6 Periods ──────────────────────────

st.subheader("Savings Rate Trend — Last 6 Periods")
st.caption("Savings rate = (Income - Expenses - Investments) / Income")

trend_periods = last_n_periods(6)
trend_data = []

for p in trend_periods:
    totals = _period_totals(df, p)
    inc = totals["income"]
    exp = totals["expenses"]
    inv = totals["investments"]
    if inc > 0:
        savings_rate = ((inc - exp - inv) / inc) * 100
    else:
        savings_rate = 0.0
    trend_data.append({
        "period": p,
        "label": period_label(p),
        "income": inc,
        "expenses": exp,
        "investments": inv,
        "savings_rate": round(savings_rate, 1),
    })

if trend_data:
    df_trend = pd.DataFrame(trend_data)

    # Dual-axis: bar for amounts, line for savings rate
    fig_sr = go.Figure()

    fig_sr.add_trace(go.Bar(
        x=df_trend["label"], y=df_trend["income"],
        name="Income", marker_color="#10b981", opacity=0.7,
    ))
    fig_sr.add_trace(go.Bar(
        x=df_trend["label"], y=df_trend["expenses"],
        name="Expenses", marker_color="#ef4444", opacity=0.7,
    ))
    fig_sr.add_trace(go.Bar(
        x=df_trend["label"], y=df_trend["investments"],
        name="Investments", marker_color="#6366f1", opacity=0.7,
    ))
    fig_sr.add_trace(go.Scatter(
        x=df_trend["label"],
        y=df_trend["savings_rate"],
        name="Savings Rate %",
        mode="lines+markers+text",
        text=[f"{v}%" for v in df_trend["savings_rate"]],
        textposition="top center",
        line=dict(color="#f59e0b", width=3),
        marker=dict(size=8),
        yaxis="y2",
    ))

    fig_sr.update_layout(
        barmode="group",
        height=400,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", y=-0.15),
        margin=dict(l=0, r=50, t=10, b=0),
        yaxis=dict(tickprefix="₹", title=""),
        yaxis2=dict(
            title="Savings %",
            overlaying="y",
            side="right",
            range=[-20, 100],
            showgrid=False,
            ticksuffix="%",
        ),
    )
    st.plotly_chart(fig_sr, use_container_width=True, config={"displayModeBar": False})

    # Summary metrics
    avg_savings_rate = df_trend["savings_rate"].mean()
    latest_sr = df_trend["savings_rate"].iloc[-1]
    prev_sr = df_trend["savings_rate"].iloc[-2] if len(df_trend) > 1 else 0.0

    m1, m2, m3 = st.columns(3)
    m1.metric("Current Period Savings Rate", f"{latest_sr}%",
              f"{latest_sr - prev_sr:+.1f}pp vs previous")
    m2.metric("6-Period Average", f"{avg_savings_rate:.1f}%")
    m3.metric(
        "Best Period",
        f"{df_trend.loc[df_trend['savings_rate'].idxmax(), 'label']}",
        f"{df_trend['savings_rate'].max()}%",
    )
else:
    st.info("Not enough data to compute savings rate trend.")

st.divider()

# ── Methodology note ─────────────────────────────────────────────────────────
with st.expander("How are these projections calculated?"):
    st.markdown(f"""
**Data basis:** Last {len(hist_periods)} completed period(s): {', '.join(period_label(p) for p in hist_periods)}

- **Current period projection:** Actual spending so far extrapolated by daily run rate for remaining days.
- **Balance forecast:** Current total balance + (average monthly net flow x months). Monthly net = avg income - avg expenses - avg investments.
- **Income vs Expenses chart:** Uses {len(hist_periods)}-period averages projected into future periods.
- **Day-by-day forecast:** Maps historical average net flow per day-of-month onto the next 30 calendar days.
- **Savings rate:** (Income - Expenses - Investments) / Income for each period.

All amounts exclude internal transfers. Expenses are stored as negative values in the database; they are shown as positive on this page for readability.
""")
