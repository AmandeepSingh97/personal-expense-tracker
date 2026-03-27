"""Spending Insights — month-over-month comparison, anomalies, trends & heatmap."""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px

from utils.data import _all_transactions, get_transactions
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import (
    cat_emoji, cat_color, CATEGORY_GROUPS, INVESTMENT_CATEGORIES, SYSTEM_CATEGORIES,
)
from utils.formatters import fmt_inr

st.title("🔍 Spending Insights")

# ── Helpers ──────────────────────────────────────────────────────────────────

EXCLUDE_CATS = SYSTEM_CATEGORIES | INVESTMENT_CATEGORIES


def _expense_by_cat_period(df: pd.DataFrame, periods: list[str]) -> pd.DataFrame:
    """Pivot: rows = category, columns = period, values = abs spend."""
    if df.empty:
        return pd.DataFrame()
    exp = df[(df["amount"] < 0) & (~df["category"].isin(EXCLUDE_CATS))]
    if exp.empty:
        return pd.DataFrame()
    exp = exp[exp["period"].isin(periods)]
    pivot = (
        exp.groupby(["category", "period"])["amount"]
        .sum()
        .abs()
        .unstack(fill_value=0)
        .reindex(columns=periods, fill_value=0)
    )
    return pivot


# ── Load data ────────────────────────────────────────────────────────────────

all_periods = last_n_periods(12)
six_periods = all_periods[-6:]  # most recent 6
cur = current_period()

df_all = _all_transactions()
if df_all.empty:
    st.info("No transactions found. Import some data first.")
    st.stop()

# Filter out transfers for expense analysis
df = df_all[df_all["is_transfer"] == 0].copy()

pivot6 = _expense_by_cat_period(df, six_periods)
if pivot6.empty:
    st.info("Not enough expense data to generate insights.")
    st.stop()

# Current period and previous 3 periods for averaging
cur_key = six_periods[-1]
prev_3 = six_periods[-4:-1] if len(six_periods) >= 4 else six_periods[:-1]

# ── Section 1: Category Comparison — Current vs 3-month Average ──────────

st.subheader("📊 Category Comparison — Current Period vs 3-Month Average")
st.caption(f"Current: **{period_label(cur_key)}** vs average of previous {len(prev_3)} period(s)")

comparison_rows = []
for cat in sorted(pivot6.index):
    cur_spend = float(pivot6.loc[cat, cur_key]) if cur_key in pivot6.columns else 0.0
    avg_spend = float(pivot6.loc[cat, prev_3].mean()) if prev_3 else 0.0
    if cur_spend == 0 and avg_spend == 0:
        continue
    pct_change = ((cur_spend - avg_spend) / avg_spend * 100) if avg_spend > 0 else (100.0 if cur_spend > 0 else 0.0)
    comparison_rows.append({
        "category": cat,
        "current": cur_spend,
        "avg_3m": avg_spend,
        "diff": cur_spend - avg_spend,
        "pct_change": pct_change,
    })

if comparison_rows:
    comp_df = pd.DataFrame(comparison_rows).sort_values("current", ascending=False)

    # Display as metric cards in rows of 4
    cats_list = comp_df.to_dict("records")
    for row_start in range(0, len(cats_list), 4):
        row_items = cats_list[row_start:row_start + 4]
        cols = st.columns(4)
        for i, item in enumerate(row_items):
            with cols[i]:
                arrow = "↑" if item["pct_change"] > 0 else "↓" if item["pct_change"] < 0 else "→"
                delta_str = f"{arrow} {abs(item['pct_change']):.0f}% vs avg"
                delta_color = "inverse" if item["pct_change"] <= 0 else "normal"
                st.metric(
                    label=f"{cat_emoji(item['category'])} {item['category']}",
                    value=fmt_inr(item["current"]),
                    delta=delta_str,
                    delta_color=delta_color,
                )
                st.caption(f"3-mo avg: {fmt_inr(item['avg_3m'])}")
else:
    st.info("No expense data for comparison.")

st.divider()

# ── Section 2: Anomaly Detection (>30% above 3-month average) ───────────

st.subheader("⚠️ Anomaly Detection — Spending Spikes")
st.caption("Categories where current spending exceeds the 3-month average by more than 30%")

anomalies = [r for r in comparison_rows if r["pct_change"] > 30 and r["avg_3m"] > 0]
anomalies.sort(key=lambda r: r["pct_change"], reverse=True)

if anomalies:
    for item in anomalies:
        excess = item["current"] - item["avg_3m"]
        st.warning(
            f"**{cat_emoji(item['category'])} {item['category']}** — "
            f"spending {fmt_inr(item['current'])} is **{item['pct_change']:.0f}% above** "
            f"the 3-month average of {fmt_inr(item['avg_3m'])} "
            f"(+{fmt_inr(excess)} excess)"
        )
else:
    st.success("No anomalies detected. All categories are within 30% of their 3-month average.")

st.divider()

# ── Section 3: Top Movers — Biggest Increases & Decreases vs Last Period ─

st.subheader("🔄 Top Movers — vs Last Period")

prev_key = six_periods[-2] if len(six_periods) >= 2 else None
if prev_key:
    st.caption(f"Comparing **{period_label(cur_key)}** vs **{period_label(prev_key)}**")

    movers = []
    for cat in pivot6.index:
        cur_spend = float(pivot6.loc[cat, cur_key]) if cur_key in pivot6.columns else 0.0
        prev_spend = float(pivot6.loc[cat, prev_key]) if prev_key in pivot6.columns else 0.0
        if cur_spend == 0 and prev_spend == 0:
            continue
        movers.append({
            "category": cat,
            "current": cur_spend,
            "previous": prev_spend,
            "change": cur_spend - prev_spend,
        })

    if movers:
        movers_df = pd.DataFrame(movers)

        col_up, col_down = st.columns(2)

        with col_up:
            st.markdown("**Top 5 Increases** 📈")
            top_up = movers_df.nlargest(5, "change")
            for _, row in top_up.iterrows():
                if row["change"] > 0:
                    pct = (row["change"] / row["previous"] * 100) if row["previous"] > 0 else 100
                    st.metric(
                        label=f"{cat_emoji(row['category'])} {row['category']}",
                        value=fmt_inr(row["current"]),
                        delta=f"+{fmt_inr(row['change'])} ({pct:.0f}%)",
                        delta_color="normal",
                    )
                else:
                    st.caption(f"{cat_emoji(row['category'])} {row['category']} — no increase")

        with col_down:
            st.markdown("**Top 5 Decreases** 📉")
            top_down = movers_df.nsmallest(5, "change")
            for _, row in top_down.iterrows():
                if row["change"] < 0:
                    pct = (abs(row["change"]) / row["previous"] * 100) if row["previous"] > 0 else 100
                    st.metric(
                        label=f"{cat_emoji(row['category'])} {row['category']}",
                        value=fmt_inr(row["current"]),
                        delta=f"-{fmt_inr(abs(row['change']))} ({pct:.0f}%)",
                        delta_color="inverse",
                    )
                else:
                    st.caption(f"{cat_emoji(row['category'])} {row['category']} — no decrease")
    else:
        st.info("Not enough data for comparison.")
else:
    st.info("Need at least two periods of data to show movers.")

st.divider()

# ── Section 4: Category Trend Chart (last 6 periods, multi-select) ───────

st.subheader("📈 Category Spending Trend — Last 6 Periods")

all_cats_sorted = sorted(pivot6.index.tolist())
default_cats = (
    pivot6[cur_key].nlargest(5).index.tolist()
    if cur_key in pivot6.columns
    else all_cats_sorted[:5]
)

selected_cats = st.multiselect(
    "Select categories to display",
    options=all_cats_sorted,
    default=default_cats,
    key="insight_trend_cats",
)

if selected_cats:
    trend_data = []
    for period_key in six_periods:
        label = period_label(period_key)
        for cat in selected_cats:
            val = float(pivot6.loc[cat, period_key]) if cat in pivot6.index and period_key in pivot6.columns else 0.0
            trend_data.append({"Period": label, "Category": cat, "Amount": val})

    trend_df = pd.DataFrame(trend_data)

    fig_trend = go.Figure()
    for cat in selected_cats:
        cat_data = trend_df[trend_df["Category"] == cat]
        fig_trend.add_trace(go.Scatter(
            x=cat_data["Period"],
            y=cat_data["Amount"],
            name=f"{cat_emoji(cat)} {cat}",
            mode="lines+markers",
            line=dict(color=cat_color(cat), width=2),
            marker=dict(size=6),
            hovertemplate=f"{cat}<br>%{{x}}<br>₹%{{y:,.0f}}<extra></extra>",
        ))

    fig_trend.update_layout(
        height=400,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", yanchor="bottom", y=-0.35),
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="₹", gridcolor="rgba(128,128,128,0.15)"),
        xaxis=dict(gridcolor="rgba(128,128,128,0.15)"),
        hovermode="x unified",
    )
    st.plotly_chart(fig_trend, use_container_width=True, config={"displayModeBar": False})
else:
    st.info("Select at least one category to see the trend chart.")

st.divider()

# ── Section 5: Spending Heatmap — Categories x Periods ───────────────────

st.subheader("🗺️ Spending Heatmap — Categories x Periods")
st.caption("Color intensity reflects spending amount per category per period")

# Prepare heatmap data: categories sorted by total spend (highest first)
heatmap_cats = pivot6.sum(axis=1).sort_values(ascending=True).index.tolist()
heatmap_periods = six_periods
heatmap_labels = [period_label(p) for p in heatmap_periods]

z_values = []
hover_text = []
for cat in heatmap_cats:
    row_vals = []
    row_hover = []
    for p in heatmap_periods:
        val = float(pivot6.loc[cat, p]) if p in pivot6.columns else 0.0
        row_vals.append(val)
        row_hover.append(f"{cat_emoji(cat)} {cat}<br>{period_label(p)}<br>{fmt_inr(val)}")
    z_values.append(row_vals)
    hover_text.append(row_hover)

y_labels = [f"{cat_emoji(c)} {c}" for c in heatmap_cats]

fig_heat = go.Figure(data=go.Heatmap(
    z=z_values,
    x=heatmap_labels,
    y=y_labels,
    colorscale=[
        [0, "#f0fdf4"],
        [0.25, "#86efac"],
        [0.5, "#fbbf24"],
        [0.75, "#f97316"],
        [1, "#dc2626"],
    ],
    hovertext=hover_text,
    hovertemplate="%{hovertext}<extra></extra>",
    colorbar=dict(title="₹", tickprefix="₹"),
))

# Dynamic height based on number of categories
heat_height = max(400, len(heatmap_cats) * 30 + 100)

fig_heat.update_layout(
    height=heat_height,
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    margin=dict(l=0, r=0, t=10, b=0),
    xaxis=dict(side="top"),
    yaxis=dict(dtick=1),
)

st.plotly_chart(fig_heat, use_container_width=True, config={"displayModeBar": False})
