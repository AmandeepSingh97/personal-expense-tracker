"""Recurring Transaction Tracker — bills & subscriptions status."""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from datetime import date, datetime

from utils.data import get_transactions, _all_transactions
from utils.budget_period import current_period, period_label, last_n_periods, period_range
from utils.categories import cat_emoji, cat_color, CATEGORY_META, SYSTEM_CATEGORIES
from utils.formatters import fmt_inr, fmt_date

st.title("🔄 Recurring Transaction Tracker")

# ── Helpers ──────────────────────────────────────────────────────────────────

def _recurring_df(df: pd.DataFrame) -> pd.DataFrame:
    """Filter to recurring expense transactions only."""
    if df.empty or "is_recurring" not in df.columns:
        return pd.DataFrame()
    mask = (df["is_recurring"].astype(int) == 1) & (df["amount"] < 0) & (df["is_transfer"].astype(int) == 0)
    return df[mask].copy()


def _avg_date_day(dates: pd.Series) -> int:
    """Average day-of-month from a series of date strings."""
    days = []
    for d in dates:
        try:
            days.append(datetime.strptime(str(d)[:10], "%Y-%m-%d").day)
        except Exception:
            continue
    return int(sum(days) / len(days)) if days else 15


# ── Load data ────────────────────────────────────────────────────────────────

all_df = _all_transactions()
rec_all = _recurring_df(all_df)

if rec_all.empty:
    st.info("No recurring transactions found. Transactions with `is_recurring = 1` will appear here.")
    st.stop()

cur = current_period()
periods_6 = last_n_periods(6)

# ── Current period data ──────────────────────────────────────────────────────

rec_cur = rec_all[rec_all["period"] == cur]

# Last 3 complete periods (exclude current) for computing averages
past_periods = [p for p in last_n_periods(4) if p != cur][-3:]
rec_past = rec_all[rec_all["period"].isin(past_periods)]

# ── Build per-category stats ─────────────────────────────────────────────────

categories = sorted(rec_all["category"].dropna().unique())

rows = []
for cat in categories:
    if cat in SYSTEM_CATEGORIES:
        continue

    # Average amount over last 3 months
    cat_past = rec_past[rec_past["category"] == cat]
    periods_with_data = cat_past["period"].nunique()
    avg_amount = abs(cat_past["amount"].sum()) / max(periods_with_data, 1)

    # Average day (for overdue detection)
    avg_day = _avg_date_day(cat_past["date"])

    # Current period actual
    cat_cur = rec_cur[rec_cur["category"] == cat]
    actual_amount = abs(cat_cur["amount"].sum()) if not cat_cur.empty else 0.0
    paid = not cat_cur.empty

    # Status logic
    today = date.today()
    start_str, end_str = period_range(cur)
    start_date = datetime.strptime(start_str, "%Y-%m-%d").date()

    # The "expected date" within the current period
    try:
        expected_date = start_date.replace(day=avg_day)
        if expected_date < start_date:
            expected_date = start_date
    except ValueError:
        expected_date = start_date

    if paid:
        status = "paid"
    elif today > expected_date:
        status = "overdue"
    else:
        status = "pending"

    rows.append({
        "category": cat,
        "emoji": cat_emoji(cat),
        "expected": round(avg_amount, 2),
        "actual": round(actual_amount, 2),
        "avg_day": avg_day,
        "status": status,
        "tx_count": len(cat_cur),
    })

tracker_df = pd.DataFrame(rows)

# ── Summary metrics ──────────────────────────────────────────────────────────

total_expected = tracker_df["expected"].sum()
total_paid     = tracker_df[tracker_df["status"] == "paid"]["actual"].sum()
total_pending  = tracker_df[tracker_df["status"] != "paid"]["expected"].sum()
count_paid     = int((tracker_df["status"] == "paid").sum())
count_pending  = int((tracker_df["status"] == "pending").sum())
count_overdue  = int((tracker_df["status"] == "overdue").sum())

st.markdown(f"**Current period:** {period_label(cur)}")

c1, c2, c3, c4 = st.columns(4)
c1.metric("Monthly Recurring", fmt_inr(total_expected),
          f"{len(tracker_df)} bills/subscriptions")
c2.metric("Paid This Month", fmt_inr(total_paid),
          f"{count_paid} of {len(tracker_df)}")
c3.metric("Pending", fmt_inr(total_pending),
          f"{count_pending} pending" + (f", {count_overdue} overdue" if count_overdue else ""))
c4.metric("Completion", f"{int(count_paid / len(tracker_df) * 100)}%"
          if len(tracker_df) else "0%")

st.divider()

# ── Bills & Subscriptions Tracker ────────────────────────────────────────────

st.subheader("Bills & Subscriptions Status")

STATUS_ICON = {"paid": "✅", "pending": "⏳", "overdue": "❌"}
STATUS_ORDER = {"overdue": 0, "pending": 1, "paid": 2}

tracker_sorted = tracker_df.sort_values(
    by="status", key=lambda s: s.map(STATUS_ORDER)
)

for _, r in tracker_sorted.iterrows():
    icon = STATUS_ICON[r["status"]]
    cols = st.columns([1, 4, 2, 2, 2])
    cols[0].write(f"{r['emoji']}")
    cols[1].write(f"**{r['category']}**")
    cols[2].write(f"Expected: {fmt_inr(r['expected'])}")

    if r["status"] == "paid":
        diff = r["actual"] - r["expected"]
        diff_text = ""
        if abs(diff) > 1 and r["expected"] > 0:
            pct = int(diff / r["expected"] * 100)
            diff_text = f" ({'+' if pct > 0 else ''}{pct}%)"
        cols[3].write(f"Actual: {fmt_inr(r['actual'])}{diff_text}")
    else:
        cols[3].write("—")

    cols[4].write(f"{icon} {r['status'].capitalize()}")

st.divider()

# ── Recurring by Category (grouped) ─────────────────────────────────────────

st.subheader("🔄 Recurring Costs by Category")

cat_totals = (
    rec_all.groupby("category")["amount"]
    .apply(lambda x: round(abs(x.sum()), 2))
    .sort_values(ascending=False)
)

# Donut chart of recurring spend by category
if not cat_totals.empty:
    fig = go.Figure(data=[go.Pie(
        labels=cat_totals.index.tolist(),
        values=cat_totals.values.tolist(),
        hole=0.45,
        marker=dict(colors=[cat_color(c) for c in cat_totals.index]),
        textinfo="label+percent",
        hovertemplate="%{label}<br>₹%{value:,.0f}<extra></extra>",
    )])
    fig.update_layout(
        height=350,
        margin=dict(l=0, r=0, t=10, b=10),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})

st.divider()

# ── 6-Month History ──────────────────────────────────────────────────────────

st.subheader("📅 Last 6 Months — Recurring Transactions")

rec_hist = rec_all[rec_all["period"].isin(periods_6)]

if rec_hist.empty:
    st.info("No recurring transaction history available for the last 6 months.")
else:
    # Pivot table: categories vs periods
    pivot = (
        rec_hist
        .groupby(["period", "category"])["amount"]
        .apply(lambda x: round(abs(x.sum()), 2))
        .reset_index()
        .pivot(index="category", columns="period", values="amount")
        .fillna(0)
    )
    # Reorder columns to chronological
    period_cols = [p for p in periods_6 if p in pivot.columns]
    pivot = pivot[period_cols]
    pivot.columns = [period_label(p) for p in period_cols]

    # Add total column
    pivot["Total"] = pivot.sum(axis=1)
    pivot = pivot.sort_values("Total", ascending=False)

    # Add emoji prefix to index
    pivot.index = [f"{cat_emoji(c)} {c}" for c in pivot.index]

    # Format all values as INR
    display_df = pivot.copy()
    for col in display_df.columns:
        display_df[col] = display_df[col].apply(
            lambda v: fmt_inr(v) if v > 0 else "—"
        )

    st.dataframe(display_df, use_container_width=True)

    # Stacked bar chart of monthly recurring spend
    st.subheader("📊 Monthly Recurring Trend")

    monthly_totals = (
        rec_hist.groupby("period")["amount"]
        .apply(lambda x: round(abs(x.sum()), 2))
        .reindex(periods_6, fill_value=0)
    )

    fig_bar = go.Figure()

    # Group by category for stacked bars
    top_cats = (
        rec_hist.groupby("category")["amount"]
        .apply(lambda x: abs(x.sum()))
        .nlargest(8).index.tolist()
    )

    for cat in top_cats:
        cat_data = (
            rec_hist[rec_hist["category"] == cat]
            .groupby("period")["amount"]
            .apply(lambda x: round(abs(x.sum()), 2))
            .reindex(periods_6, fill_value=0)
        )
        fig_bar.add_trace(go.Bar(
            x=[period_label(p) for p in periods_6],
            y=cat_data.values,
            name=f"{cat_emoji(cat)} {cat}",
            marker_color=cat_color(cat),
            hovertemplate="%{x}<br>%{fullData.name}: ₹%{y:,.0f}<extra></extra>",
        ))

    # "Other" bucket
    other_cats = [c for c in rec_hist["category"].unique() if c not in top_cats]
    if other_cats:
        other_data = (
            rec_hist[rec_hist["category"].isin(other_cats)]
            .groupby("period")["amount"]
            .apply(lambda x: round(abs(x.sum()), 2))
            .reindex(periods_6, fill_value=0)
        )
        fig_bar.add_trace(go.Bar(
            x=[period_label(p) for p in periods_6],
            y=other_data.values,
            name="Other",
            marker_color="#94a3b8",
            hovertemplate="%{x}<br>Other: ₹%{y:,.0f}<extra></extra>",
        ))

    fig_bar.update_layout(
        barmode="stack",
        height=350,
        margin=dict(l=0, r=0, t=10, b=0),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", y=-0.2),
        yaxis=dict(tickprefix="₹"),
        xaxis=dict(title=""),
    )
    st.plotly_chart(fig_bar, use_container_width=True, config={"displayModeBar": False})

st.divider()

# ── Detailed Transaction List ────────────────────────────────────────────────

st.subheader("📋 Recurring Transactions This Period")

if rec_cur.empty:
    st.info("No recurring transactions recorded yet this period.")
else:
    for _, r in rec_cur.sort_values("date", ascending=False).iterrows():
        amt   = float(r["amount"])
        emoji = cat_emoji(r.get("category") or "Uncategorized")
        color = "#ef4444"

        cols = st.columns([1, 5, 2, 2])
        cols[0].write(emoji)
        cols[1].write(f"**{r.get('merchant_name') or str(r['description'])[:50]}**  \n"
                      f"_{fmt_date(r['date'])} · {r['account_name']}_")
        cols[2].write(r.get("category") or "—")
        cols[3].markdown(f"<span style='color:{color}'>-{fmt_inr(amt)}</span>",
                         unsafe_allow_html=True)
