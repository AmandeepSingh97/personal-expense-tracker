"""Shared Expenses — Settlement tracker between Amandeep and Preet.

Tracks ad-hoc shared expenses (dinner, groceries, etc.) separate from the
auto-split joint transfers. Shows net balance, lets you add expenses and
record settlements, with a monthly summary chart.

CREATE TABLE SQL (run in Supabase SQL Editor):
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_expenses (
  id BIGSERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  paid_by TEXT NOT NULL DEFAULT 'Amandeep',
  aman_share NUMERIC NOT NULL,
  preet_share NUMERIC NOT NULL,
  is_settlement INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
------------------------------------------------------------------------
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from datetime import date, datetime

from utils.db import select, select_all, insert
from utils.formatters import fmt_inr, fmt_date
from utils.budget_period import current_period, period_label, last_n_periods

st.title("\U0001F46B Shared Expenses — Settlement with Preet")

# ── Load all shared expenses ─────────────────────────────────────────────────

rows = select_all("shared_expenses")

# ── Compute net balance ──────────────────────────────────────────────────────
# Positive = Preet owes Amandeep; Negative = Amandeep owes Preet

def _compute_balance(rows: list) -> float:
    """Net balance: positive means Preet owes Amandeep."""
    balance = 0.0
    for r in rows:
        total = float(r["total_amount"])
        aman_share = float(r["aman_share"])
        preet_share = float(r["preet_share"])
        paid_by = r["paid_by"]
        is_settlement = int(r.get("is_settlement", 0))

        if is_settlement:
            # Settlement: reduces existing balance
            if paid_by == "Preet":
                # Preet paid Amandeep -> reduces what Preet owes
                balance -= total
            else:
                # Amandeep paid Preet -> reduces what Amandeep owes
                balance += total
        else:
            # Expense: the payer is owed the other person's share
            if paid_by == "Amandeep":
                # Amandeep paid, so Preet owes her share
                balance += preet_share
            else:
                # Preet paid, so Amandeep owes his share
                balance -= aman_share
    return balance


net_balance = _compute_balance(rows)

# ── Big balance metric ───────────────────────────────────────────────────────

if abs(net_balance) < 1:
    st.success("\u2705 **You're all settled up!**")
elif net_balance > 0:
    st.markdown(
        f'<div style="background:#065f46; padding:1.2rem 1.5rem; border-radius:0.75rem; '
        f'text-align:center; margin-bottom:1rem;">'
        f'<span style="font-size:1.1rem; color:#d1fae5;">Preet owes you</span><br>'
        f'<span style="font-size:2.5rem; font-weight:700; color:#34d399;">{fmt_inr(net_balance)}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f'<div style="background:#7f1d1d; padding:1.2rem 1.5rem; border-radius:0.75rem; '
        f'text-align:center; margin-bottom:1rem;">'
        f'<span style="font-size:1.1rem; color:#fecaca;">You owe Preet</span><br>'
        f'<span style="font-size:2.5rem; font-weight:700; color:#f87171;">{fmt_inr(abs(net_balance))}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

# Quick stats
expenses_only = [r for r in rows if not int(r.get("is_settlement", 0))]
settlements_only = [r for r in rows if int(r.get("is_settlement", 0))]

c1, c2, c3 = st.columns(3)
c1.metric("Total Shared Expenses", fmt_inr(sum(float(r["total_amount"]) for r in expenses_only)))
c2.metric("Total Settlements", fmt_inr(sum(float(r["total_amount"]) for r in settlements_only)))
c3.metric("Transactions", f"{len(expenses_only)} expenses, {len(settlements_only)} settlements")

st.divider()

# ── Forms: Add Expense & Record Settlement ───────────────────────────────────

form_col1, form_col2 = st.columns(2)

# -- Add Shared Expense --
with form_col1:
    st.subheader("\U0001F4B8 Add Shared Expense")
    with st.form("add_shared_expense", clear_on_submit=True):
        desc = st.text_input("Description", placeholder="e.g. Dinner at Olive Garden")
        amount = st.number_input("Total Amount (\u20b9)", min_value=0.0, step=10.0, format="%.2f")
        paid_by = st.selectbox("Who Paid?", ["Amandeep", "Preet"])
        split_type = st.radio("Split Type", ["50-50", "Custom %"], horizontal=True)

        aman_pct = 50.0
        if split_type == "Custom %":
            aman_pct = st.slider("Amandeep's share (%)", 0, 100, 50)

        expense_date = st.date_input("Date", value=date.today())
        submitted_expense = st.form_submit_button(
            "\u2705 Add Expense", use_container_width=True, type="primary"
        )

    if submitted_expense:
        if not desc.strip():
            st.error("Enter a description.")
        elif amount <= 0:
            st.error("Enter a valid amount.")
        else:
            aman_share = round(amount * aman_pct / 100, 2)
            preet_share = round(amount - aman_share, 2)
            row_data = {
                "date": expense_date.isoformat(),
                "description": desc.strip(),
                "total_amount": amount,
                "paid_by": paid_by,
                "aman_share": aman_share,
                "preet_share": preet_share,
                "is_settlement": 0,
            }
            result = insert("shared_expenses", row_data)
            if result:
                st.success(
                    f"\u2705 Added: {fmt_inr(amount)} paid by {paid_by} "
                    f"(Aman {fmt_inr(aman_share)} / Preet {fmt_inr(preet_share)})"
                )
                st.cache_data.clear()
                st.rerun()
            else:
                st.warning("Could not save. Check Supabase connection.")

# -- Record Settlement --
with form_col2:
    st.subheader("\U0001F91D Record Settlement")

    if abs(net_balance) < 1:
        st.info("No outstanding balance to settle.")
    else:
        # Who should pay whom?
        if net_balance > 0:
            settler = "Preet"
            receiver = "Amandeep"
            owed = net_balance
        else:
            settler = "Amandeep"
            receiver = "Preet"
            owed = abs(net_balance)

        st.markdown(f"**{settler}** owes **{receiver}** {fmt_inr(owed)}")

        with st.form("record_settlement", clear_on_submit=True):
            settle_amount = st.number_input(
                f"Settlement Amount (\u20b9)",
                min_value=0.0,
                max_value=float(owed),
                value=float(round(owed, 2)),
                step=10.0,
                format="%.2f",
            )
            settle_date = st.date_input("Date", value=date.today(), key="settle_date")
            settle_note = st.text_input(
                "Note (optional)", placeholder="e.g. GPay transfer", key="settle_note"
            )
            submitted_settle = st.form_submit_button(
                f"\U0001F4B0 Settle {fmt_inr(owed)}", use_container_width=True, type="primary"
            )

        if submitted_settle:
            if settle_amount <= 0:
                st.error("Enter a valid settlement amount.")
            else:
                settle_desc = settle_note.strip() if settle_note.strip() else f"Settlement: {settler} paid {receiver}"
                row_data = {
                    "date": settle_date.isoformat(),
                    "description": settle_desc,
                    "total_amount": settle_amount,
                    "paid_by": settler,
                    "aman_share": 0,
                    "preet_share": 0,
                    "is_settlement": 1,
                }
                result = insert("shared_expenses", row_data)
                if result:
                    st.success(f"\u2705 Settlement recorded: {settler} paid {receiver} {fmt_inr(settle_amount)}")
                    st.cache_data.clear()
                    st.rerun()
                else:
                    st.warning("Could not save. Check Supabase connection.")

st.divider()

# ── Transaction History ──────────────────────────────────────────────────────

st.subheader("\U0001F4CB Transaction History")

if not rows:
    st.info("No shared expenses yet. Add one above to get started.")
else:
    tab_expenses, tab_settlements, tab_all = st.tabs(
        [f"Expenses ({len(expenses_only)})", f"Settlements ({len(settlements_only)})", "All"]
    )

    def _render_table(items: list):
        """Render a list of shared expense rows as a styled dataframe."""
        if not items:
            st.info("Nothing here yet.")
            return
        # Sort by date descending
        sorted_items = sorted(items, key=lambda r: r.get("date", ""), reverse=True)
        display = []
        for r in sorted_items:
            is_settle = int(r.get("is_settlement", 0))
            display.append({
                "Date": fmt_date(r["date"]),
                "Description": r["description"],
                "Total": fmt_inr(r["total_amount"]),
                "Paid By": r["paid_by"],
                "Aman Share": fmt_inr(r["aman_share"]) if not is_settle else "-",
                "Preet Share": fmt_inr(r["preet_share"]) if not is_settle else "-",
                "Type": "Settlement" if is_settle else "Expense",
            })
        st.dataframe(
            pd.DataFrame(display),
            use_container_width=True,
            hide_index=True,
            height=min(len(display) * 38 + 40, 600),
        )

    with tab_expenses:
        _render_table(expenses_only)

    with tab_settlements:
        _render_table(settlements_only)

    with tab_all:
        _render_table(rows)

st.divider()

# ── Monthly Shared Expenses Summary ──────────────────────────────────────────

st.subheader("\U0001F4CA Monthly Shared Expenses Summary")

if not expenses_only:
    st.info("No shared expenses to summarize yet.")
else:
    # Group by YYYY-MM
    monthly: dict[str, dict] = {}
    for r in expenses_only:
        d = r.get("date", "")[:7]  # YYYY-MM
        if d not in monthly:
            monthly[d] = {"total": 0.0, "aman": 0.0, "preet": 0.0, "count": 0}
        monthly[d]["total"] += float(r["total_amount"])
        monthly[d]["aman"] += float(r["aman_share"])
        monthly[d]["preet"] += float(r["preet_share"])
        monthly[d]["count"] += 1

    # Sort chronologically
    sorted_months = sorted(monthly.keys())

    labels = []
    totals = []
    aman_shares = []
    preet_shares = []
    for m in sorted_months:
        try:
            dt = datetime.strptime(m, "%Y-%m")
            labels.append(dt.strftime("%b %Y"))
        except Exception:
            labels.append(m)
        totals.append(monthly[m]["total"])
        aman_shares.append(monthly[m]["aman"])
        preet_shares.append(monthly[m]["preet"])

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=labels, y=aman_shares,
        name="Amandeep's Share",
        marker_color="#6366f1",
    ))
    fig.add_trace(go.Bar(
        x=labels, y=preet_shares,
        name="Preet's Share",
        marker_color="#f472b6",
    ))
    fig.update_layout(
        barmode="stack",
        height=350,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", y=-0.15),
        margin=dict(l=0, r=0, t=10, b=0),
        yaxis=dict(tickprefix="\u20b9"),
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})

    # Monthly summary table
    summary_rows = []
    for m in sorted_months:
        try:
            dt = datetime.strptime(m, "%Y-%m")
            label = dt.strftime("%b %Y")
        except Exception:
            label = m
        summary_rows.append({
            "Month": label,
            "Total Shared": fmt_inr(monthly[m]["total"]),
            "Amandeep's Share": fmt_inr(monthly[m]["aman"]),
            "Preet's Share": fmt_inr(monthly[m]["preet"]),
            "# Expenses": monthly[m]["count"],
        })
    st.dataframe(
        pd.DataFrame(summary_rows),
        use_container_width=True,
        hide_index=True,
    )

# ── Methodology ──────────────────────────────────────────────────────────────

with st.expander("How does the settlement balance work?"):
    st.markdown("""
**Balance logic:**
- When Amandeep pays for a shared expense, Preet owes her share to Amandeep.
- When Preet pays for a shared expense, Amandeep owes his share to Preet.
- The net balance is the running total of all these obligations.
- Settlements reduce the outstanding balance.

**Example:** Amandeep pays a 50-50 dinner of \u20b91,000 => Preet owes \u20b9500.
Then Preet pays for \u20b9600 groceries (50-50) => Amandeep owes \u20b9300.
Net: Preet owes Amandeep \u20b9200 (500 - 300).

**Note:** This page tracks **ad-hoc** shared expenses only. The regular monthly
joint transfers (\u20b969,500/\u20b976,000) are handled automatically by the Import page.
""")
