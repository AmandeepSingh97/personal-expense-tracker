"""Annual Summary / Tax Helper — FY overview, 80C/80G deductions, monthly breakdown."""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from datetime import date

from utils.data import _all_transactions
from utils.categories import (
    cat_emoji, cat_color, CATEGORY_GROUPS, INVESTMENT_CATEGORIES, SYSTEM_CATEGORIES,
)
from utils.formatters import fmt_inr

st.title("📊 Annual Summary / Tax Helper")

# ── Financial year helpers ────────────────────────────────────────────────────

MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
MONTH_LABELS = {
    4: "Apr", 5: "May", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep",
    10: "Oct", 11: "Nov", 12: "Dec", 1: "Jan", 2: "Feb", 3: "Mar",
}

# 80C eligible investment categories
SECTION_80C_CATEGORIES = {"PPF", "LIC", "SIPs"}
SECTION_80C_LIMIT = 150_000


def fy_label(start_year: int) -> str:
    """Return display label like 'FY 2025-26'."""
    return f"FY {start_year}-{str(start_year + 1)[-2:]}"


def fy_date_range(start_year: int) -> tuple[str, str]:
    """Return (start_iso, end_iso) for a financial year."""
    return f"{start_year}-04-01", f"{start_year + 1}-03-31"


def available_fys(df: pd.DataFrame) -> list[int]:
    """Return sorted list of FY start-years that have data."""
    if df.empty:
        return []
    dates = pd.to_datetime(df["date"], errors="coerce").dropna()
    if dates.empty:
        return []
    # A date in Jan-Mar belongs to the FY starting the previous year
    fy_years = dates.apply(lambda d: d.year if d.month >= 4 else d.year - 1)
    return sorted(fy_years.unique().tolist(), reverse=True)


# ── Load data ─────────────────────────────────────────────────────────────────

df_all = _all_transactions()

if df_all.empty:
    st.info("No transactions found. Import some bank statements first.")
    st.stop()

fys = available_fys(df_all)
if not fys:
    st.info("No valid transaction dates found.")
    st.stop()

# ── Year selector ─────────────────────────────────────────────────────────────

fy_options = {y: fy_label(y) for y in fys}
selected_fy = st.selectbox(
    "Financial Year",
    list(fy_options.keys()),
    format_func=lambda y: fy_options[y],
    index=0,
    key="annual_fy",
)

fy_start, fy_end = fy_date_range(selected_fy)

# Filter to selected FY
df = df_all[(df_all["date"] >= fy_start) & (df_all["date"] <= fy_end)].copy()

if df.empty:
    st.warning(f"No transactions found for {fy_label(selected_fy)}.")
    st.stop()

# Exclude transfers for most calculations
df_no_transfers = df[df["is_transfer"] == 0].copy()

# ── Precompute key aggregates ─────────────────────────────────────────────────

# Income rows (positive amounts, non-transfer)
df_income = df_no_transfers[df_no_transfers["amount"] > 0]
total_income = float(df_income["amount"].sum())

# Salary specifically
salary_income = float(df_income[df_income["category"] == "Salary"]["amount"].sum())

# Interest income
interest_income = float(
    df_income[
        (df_income["category"] == "Income")
        & df_income["sub_category"].fillna("").str.contains("Interest", case=False, na=False)
    ]["amount"].sum()
)

# Dividend income
dividend_income = float(
    df_income[
        (df_income["category"] == "Income")
        & df_income["sub_category"].fillna("").str.contains("Dividend", case=False, na=False)
    ]["amount"].sum()
)

# Other income (everything else that is positive, non-transfer)
other_income = total_income - salary_income - interest_income - dividend_income

# Expense rows (negative amounts, non-transfer, non-investment)
df_expenses = df_no_transfers[
    (df_no_transfers["amount"] < 0)
    & (~df_no_transfers["category"].isin(INVESTMENT_CATEGORIES))
]
total_expenses = float(df_expenses["amount"].apply(abs).sum())

# Investment rows (negative amounts, investment categories)
df_investments = df_no_transfers[
    (df_no_transfers["amount"] < 0)
    & (df_no_transfers["category"].isin(INVESTMENT_CATEGORIES))
]
total_invested = float(df_investments["amount"].apply(abs).sum())

# Savings
total_outflow = total_expenses + total_invested
total_saved = total_income - total_outflow
savings_rate = (total_saved / total_income * 100) if total_income > 0 else 0

# ── Parse month from date for monthly breakdown ──────────────────────────────

df_no_transfers["_date"] = pd.to_datetime(df_no_transfers["date"], errors="coerce")
df_no_transfers["_month"] = df_no_transfers["_date"].dt.month
df_no_transfers["_year"] = df_no_transfers["_date"].dt.year

# ── TABS ──────────────────────────────────────────────────────────────────────

tab_overview, tab_tax, tab_monthly = st.tabs(["Overview", "Tax Deductions", "Monthly Breakdown"])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 1: OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════

with tab_overview:
    st.subheader(f"Annual Overview — {fy_label(selected_fy)}")

    # ── Top-level metrics ─────────────────────────────────────────────────
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("💰 Total Income", fmt_inr(total_income))
    c2.metric("💸 Total Expenses", fmt_inr(total_expenses))
    c3.metric("📈 Total Invested", fmt_inr(total_invested))
    c4.metric("🏦 Net Saved", fmt_inr(total_saved),
              f"{savings_rate:.1f}% savings rate")

    st.divider()

    # ── Income breakdown ──────────────────────────────────────────────────
    st.subheader("Income Breakdown")
    ic1, ic2, ic3, ic4 = st.columns(4)
    ic1.metric("💼 Salary", fmt_inr(salary_income))
    ic2.metric("🏦 Interest", fmt_inr(interest_income))
    ic3.metric("💹 Dividends", fmt_inr(dividend_income))
    ic4.metric("💰 Other", fmt_inr(other_income))

    # Detailed income table
    if not df_income.empty:
        income_by_cat = (
            df_income.groupby(["category", "sub_category"])["amount"]
            .agg(["sum", "count"])
            .reset_index()
            .rename(columns={"sum": "Total", "count": "Txns", "category": "Category", "sub_category": "Sub-Category"})
            .sort_values("Total", ascending=False)
        )
        income_by_cat["Total"] = income_by_cat["Total"].apply(lambda x: fmt_inr(x))
        with st.expander("Detailed income by category / sub-category"):
            st.dataframe(income_by_cat, use_container_width=True, hide_index=True)

    st.divider()

    # ── Savings summary ───────────────────────────────────────────────────
    st.subheader("Savings Summary")
    sc1, sc2, sc3 = st.columns(3)
    sc1.metric("Total Income", fmt_inr(total_income))
    sc2.metric("Total Outflow", fmt_inr(total_outflow),
               f"Expenses {fmt_inr(total_expenses)} + Investments {fmt_inr(total_invested)}")
    sc3.metric("Net Saved", fmt_inr(total_saved),
               f"{savings_rate:.1f}% of income")

    # Visual waterfall
    if total_income > 0:
        fig_wf = go.Figure(go.Waterfall(
            x=["Income", "Expenses", "Investments", "Saved"],
            y=[total_income, -total_expenses, -total_invested, total_saved],
            measure=["absolute", "relative", "relative", "total"],
            connector={"line": {"color": "#64748b"}},
            increasing={"marker": {"color": "#10b981"}},
            decreasing={"marker": {"color": "#ef4444"}},
            totals={"marker": {"color": "#3b82f6"}},
            text=[fmt_inr(total_income), fmt_inr(total_expenses),
                  fmt_inr(total_invested), fmt_inr(total_saved)],
            textposition="outside",
        ))
        fig_wf.update_layout(
            height=320, paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=0, r=0, t=30, b=0),
            yaxis=dict(tickprefix="₹", visible=False),
            xaxis=dict(title=""),
        )
        st.plotly_chart(fig_wf, use_container_width=True, config={"displayModeBar": False})

    st.divider()

    # ── Category-wise annual totals ───────────────────────────────────────
    st.subheader("Category-wise Annual Totals")

    df_cat_expenses = df_no_transfers[
        (df_no_transfers["amount"] < 0)
        & (~df_no_transfers["category"].isin(SYSTEM_CATEGORIES))
    ].copy()
    df_cat_expenses["abs_amount"] = df_cat_expenses["amount"].apply(abs)

    if not df_cat_expenses.empty:
        cat_totals = (
            df_cat_expenses.groupby("category")["abs_amount"]
            .agg(["sum", "count"])
            .reset_index()
            .rename(columns={"sum": "Annual Total", "count": "Txns"})
            .sort_values("Annual Total", ascending=False)
        )

        grand_total = cat_totals["Annual Total"].sum()
        # Count distinct months in the FY for proper averaging
        months_in_fy = df_cat_expenses["_date"].dt.to_period("M").nunique()
        months_in_fy = max(months_in_fy, 1)

        cat_totals["Monthly Avg"] = cat_totals["Annual Total"] / months_in_fy
        cat_totals["% of Total"] = (cat_totals["Annual Total"] / grand_total * 100).round(1)

        # Add emoji column
        cat_totals.insert(0, "", cat_totals["category"].apply(cat_emoji))

        # Format for display
        display_df = cat_totals.copy()
        display_df["Annual Total"] = display_df["Annual Total"].apply(lambda x: fmt_inr(x))
        display_df["Monthly Avg"] = display_df["Monthly Avg"].apply(lambda x: fmt_inr(x))
        display_df["% of Total"] = display_df["% of Total"].apply(lambda x: f"{x}%")
        display_df = display_df.rename(columns={"category": "Category"})

        st.dataframe(
            display_df[["", "Category", "Annual Total", "Monthly Avg", "Txns", "% of Total"]],
            use_container_width=True,
            hide_index=True,
            height=min(len(display_df) * 40 + 40, 800),
        )
    else:
        st.info("No expense transactions found for this financial year.")

# ══════════════════════════════════════════════════════════════════════════════
# TAB 2: TAX DEDUCTIONS
# ══════════════════════════════════════════════════════════════════════════════

with tab_tax:
    st.subheader(f"Tax Deductions — {fy_label(selected_fy)}")
    st.caption("Estimates based on transaction data. Verify with actual tax documents.")

    # ── Section 80C ───────────────────────────────────────────────────────
    st.markdown("### Section 80C — Investments & Insurance")
    st.caption(f"Maximum deduction: {fmt_inr(SECTION_80C_LIMIT)}")

    sec80c_data = []
    for cat in sorted(SECTION_80C_CATEGORIES):
        cat_amount = float(
            df_no_transfers[
                (df_no_transfers["category"] == cat)
                & (df_no_transfers["amount"] < 0)
            ]["amount"].apply(abs).sum()
        )
        if cat_amount > 0:
            sec80c_data.append({"Category": cat, "Emoji": cat_emoji(cat), "Amount": cat_amount})

    total_80c = sum(r["Amount"] for r in sec80c_data)

    if sec80c_data:
        for item in sec80c_data:
            mc1, mc2 = st.columns([4, 2])
            mc1.write(f"{item['Emoji']} **{item['Category']}**")
            mc2.write(f"`{fmt_inr(item['Amount'])}`")

        st.divider()
        tc1, tc2 = st.columns([4, 2])
        tc1.markdown("**Total 80C**")
        tc2.markdown(f"**`{fmt_inr(total_80c)}`**")

        # Limit indicator
        if total_80c >= SECTION_80C_LIMIT:
            st.success(f"You have reached the 80C limit of {fmt_inr(SECTION_80C_LIMIT)}. "
                       f"Eligible deduction: {fmt_inr(SECTION_80C_LIMIT)}")
        else:
            remaining_80c = SECTION_80C_LIMIT - total_80c
            pct = total_80c / SECTION_80C_LIMIT
            st.progress(pct)
            st.warning(f"Utilized {fmt_inr(total_80c)} of {fmt_inr(SECTION_80C_LIMIT)} — "
                       f"{fmt_inr(remaining_80c)} room remaining")
    else:
        st.info("No 80C eligible investments found for this financial year.")

    st.divider()

    # ── Section 80G — Donations ───────────────────────────────────────────
    st.markdown("### Section 80G — Donations")

    donation_amount = float(
        df_no_transfers[
            (df_no_transfers["category"] == "Donation")
            & (df_no_transfers["amount"] < 0)
        ]["amount"].apply(abs).sum()
    )

    if donation_amount > 0:
        st.metric(f"{cat_emoji('Donation')} Donations", fmt_inr(donation_amount))
        st.caption("Note: Actual 80G eligibility depends on the recipient institution (50% or 100% deduction). "
                   "Keep donation receipts for claiming.")

        # Show individual donation transactions
        df_donations = df_no_transfers[
            (df_no_transfers["category"] == "Donation")
            & (df_no_transfers["amount"] < 0)
        ][["date", "description", "amount"]].copy()
        df_donations["amount"] = df_donations["amount"].apply(lambda x: fmt_inr(abs(x)))
        df_donations = df_donations.rename(columns={"date": "Date", "description": "Description", "amount": "Amount"})
        with st.expander("Donation transactions"):
            st.dataframe(df_donations, use_container_width=True, hide_index=True)
    else:
        st.info("No donations found for this financial year.")

    st.divider()

    # ── Insurance Premiums ────────────────────────────────────────────────
    st.markdown("### Insurance Premiums (Section 80D reference)")

    insurance_amount = float(
        df_no_transfers[
            (df_no_transfers["category"] == "Insurance")
            & (df_no_transfers["amount"] < 0)
        ]["amount"].apply(abs).sum()
    )

    if insurance_amount > 0:
        st.metric(f"{cat_emoji('Insurance')} Insurance Premiums", fmt_inr(insurance_amount))
        st.caption("Health insurance premiums may be eligible under Section 80D. "
                   "Life insurance premiums count under 80C (already included above).")

        # Show individual insurance transactions
        df_ins = df_no_transfers[
            (df_no_transfers["category"] == "Insurance")
            & (df_no_transfers["amount"] < 0)
        ][["date", "description", "amount"]].copy()
        df_ins["amount"] = df_ins["amount"].apply(lambda x: fmt_inr(abs(x)))
        df_ins = df_ins.rename(columns={"date": "Date", "description": "Description", "amount": "Amount"})
        with st.expander("Insurance transactions"):
            st.dataframe(df_ins, use_container_width=True, hide_index=True)
    else:
        st.info("No insurance transactions found for this financial year.")

    st.divider()

    # ── Tax summary ───────────────────────────────────────────────────────
    st.markdown("### Tax Deduction Summary")
    eligible_80c = min(total_80c, SECTION_80C_LIMIT)
    summary_data = [
        {"Section": "80C (Investments)", "Claimed": fmt_inr(total_80c),
         "Eligible": fmt_inr(eligible_80c), "Limit": fmt_inr(SECTION_80C_LIMIT)},
        {"Section": "80G (Donations)", "Claimed": fmt_inr(donation_amount),
         "Eligible": fmt_inr(donation_amount), "Limit": "Varies"},
        {"Section": "80D (Insurance)", "Claimed": fmt_inr(insurance_amount),
         "Eligible": fmt_inr(insurance_amount), "Limit": "₹25,000 / ₹50,000"},
    ]
    st.dataframe(pd.DataFrame(summary_data), use_container_width=True, hide_index=True)
    total_deductions = eligible_80c + donation_amount + insurance_amount
    st.metric("Total Estimated Deductions", fmt_inr(total_deductions))

# ══════════════════════════════════════════════════════════════════════════════
# TAB 3: MONTHLY BREAKDOWN
# ══════════════════════════════════════════════════════════════════════════════

with tab_monthly:
    st.subheader(f"Monthly Breakdown — {fy_label(selected_fy)}")

    # Build monthly data
    monthly_data = []
    for m in MONTH_ORDER:
        year = selected_fy if m >= 4 else selected_fy + 1
        month_df = df_no_transfers[
            (df_no_transfers["_month"] == m)
            & (df_no_transfers["_year"] == year)
        ]
        month_income = float(month_df[month_df["amount"] > 0]["amount"].sum())
        month_expense = float(month_df[month_df["amount"] < 0]["amount"].apply(abs).sum())
        month_invested = float(
            month_df[
                (month_df["amount"] < 0) & (month_df["category"].isin(INVESTMENT_CATEGORIES))
            ]["amount"].apply(abs).sum()
        )
        month_expense_only = month_expense - month_invested

        monthly_data.append({
            "Month": f"{MONTH_LABELS[m]} {year}",
            "month_num": m,
            "year": year,
            "Income": month_income,
            "Expenses": month_expense_only,
            "Investments": month_invested,
            "Net": month_income - month_expense,
        })

    df_monthly = pd.DataFrame(monthly_data)

    # Filter out months with zero activity
    df_monthly_active = df_monthly[
        (df_monthly["Income"] > 0) | (df_monthly["Expenses"] > 0) | (df_monthly["Investments"] > 0)
    ]

    if not df_monthly_active.empty:
        # ── Stacked bar chart: Income vs Expenses vs Investments ──────
        fig_monthly = go.Figure()
        fig_monthly.add_trace(go.Bar(
            x=df_monthly_active["Month"], y=df_monthly_active["Income"],
            name="Income", marker_color="#10b981",
        ))
        fig_monthly.add_trace(go.Bar(
            x=df_monthly_active["Month"], y=df_monthly_active["Expenses"],
            name="Expenses", marker_color="#ef4444",
        ))
        fig_monthly.add_trace(go.Bar(
            x=df_monthly_active["Month"], y=df_monthly_active["Investments"],
            name="Investments", marker_color="#3b82f6",
        ))
        fig_monthly.update_layout(
            barmode="group",
            height=400,
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            margin=dict(l=0, r=0, t=30, b=0),
            yaxis=dict(tickprefix="₹"),
            legend=dict(orientation="h", y=-0.15),
            xaxis=dict(title=""),
        )
        st.plotly_chart(fig_monthly, use_container_width=True, config={"displayModeBar": False})

        # ── Monthly summary table ─────────────────────────────────────
        st.subheader("Monthly Summary Table")
        display_monthly = df_monthly_active.copy()
        display_monthly["Income"] = display_monthly["Income"].apply(lambda x: fmt_inr(x))
        display_monthly["Expenses"] = display_monthly["Expenses"].apply(lambda x: fmt_inr(x))
        display_monthly["Investments"] = display_monthly["Investments"].apply(lambda x: fmt_inr(x))
        display_monthly["Net"] = display_monthly["Net"].apply(lambda x: fmt_inr(x))

        st.dataframe(
            display_monthly[["Month", "Income", "Expenses", "Investments", "Net"]],
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No monthly data available for this financial year.")

    st.divider()

    # ── Category-wise monthly heatmap ─────────────────────────────────────
    st.subheader("Category-wise Monthly Spending")

    df_expense_months = df_no_transfers[
        (df_no_transfers["amount"] < 0)
        & (~df_no_transfers["category"].isin(SYSTEM_CATEGORIES))
    ].copy()
    df_expense_months["abs_amount"] = df_expense_months["amount"].apply(abs)
    df_expense_months["month_label"] = df_expense_months["_date"].dt.strftime("%b %Y")

    if not df_expense_months.empty:
        # Pivot: category x month
        # Build ordered month labels for the FY
        ordered_months = []
        for m in MONTH_ORDER:
            year = selected_fy if m >= 4 else selected_fy + 1
            label = f"{MONTH_LABELS[m]} {year}"
            ordered_months.append(label)

        pivot = df_expense_months.pivot_table(
            index="category", columns="month_label", values="abs_amount",
            aggfunc="sum", fill_value=0,
        )

        # Reorder columns to FY order, keeping only columns that exist
        ordered_cols = [c for c in ordered_months if c in pivot.columns]
        if ordered_cols:
            pivot = pivot[ordered_cols]

        # Sort by total descending
        pivot["_total"] = pivot.sum(axis=1)
        pivot = pivot.sort_values("_total", ascending=False)
        pivot = pivot.drop(columns=["_total"])

        fig_heat = px.imshow(
            pivot.values,
            x=pivot.columns.tolist(),
            y=[f"{cat_emoji(c)} {c}" for c in pivot.index],
            color_continuous_scale="YlOrRd",
            aspect="auto",
            labels=dict(x="Month", y="Category", color="Amount (₹)"),
        )
        fig_heat.update_layout(
            height=max(300, len(pivot) * 32),
            margin=dict(l=0, r=0, t=10, b=0),
            paper_bgcolor="rgba(0,0,0,0)",
        )
        st.plotly_chart(fig_heat, use_container_width=True, config={"displayModeBar": False})
    else:
        st.info("No expense data available for heatmap.")
