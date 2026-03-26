"""Goals & Savings Targets — track progress toward financial goals.

-- Supabase table (run once in SQL Editor):
--
-- CREATE TABLE IF NOT EXISTS savings_goals (
--   id BIGSERIAL PRIMARY KEY,
--   name TEXT NOT NULL,
--   target_amount NUMERIC NOT NULL,
--   current_amount NUMERIC NOT NULL DEFAULT 0,
--   deadline TEXT,
--   category TEXT,
--   monthly_target NUMERIC DEFAULT 0,
--   color TEXT NOT NULL DEFAULT '#6366f1',
--   is_active INTEGER NOT NULL DEFAULT 1,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
"""

import math
from datetime import date, datetime

import plotly.graph_objects as go
import streamlit as st

from utils.budget_period import current_period, period_range
from utils.categories import get_all_category_options
from utils.data import _all_transactions, get_transactions
from utils.db import delete, insert, select, update
from utils.formatters import fmt_inr

st.set_page_config(page_title="Goals", page_icon="\U0001f3af", layout="wide")
st.title("\U0001f3af Goals & Savings Targets")

# ── Colour palette for new goals ──────────────────────────────────────────────

GOAL_COLORS = [
    "#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _months_between(start: date, end: date) -> int:
    """Number of whole months between two dates (at least 1)."""
    return max((end.year - start.year) * 12 + end.month - start.month, 1)


def _goal_status(goal: dict) -> dict:
    """Compute derived fields for a single goal."""
    target = float(goal["target_amount"])
    saved = float(goal["current_amount"])
    remaining = max(target - saved, 0)
    pct = min(saved / target, 1.0) if target > 0 else 0.0

    monthly_target = float(goal.get("monthly_target") or 0)
    deadline_str = goal.get("deadline")
    months_left = None
    monthly_needed = None
    status = "on_track"  # on_track | ahead | behind | completed

    if pct >= 1.0:
        status = "completed"
        projected_date = None
    else:
        # Calculate months left until deadline
        if deadline_str:
            try:
                deadline = datetime.strptime(str(deadline_str)[:10], "%Y-%m-%d").date()
                today = date.today()
                months_left = _months_between(today, deadline)
                if months_left > 0:
                    monthly_needed = remaining / months_left
                else:
                    monthly_needed = remaining  # past deadline
            except Exception:
                pass

        # Determine on-track / ahead / behind
        if monthly_target > 0 and monthly_needed is not None:
            if monthly_needed <= monthly_target * 0.9:
                status = "ahead"
            elif monthly_needed > monthly_target * 1.1:
                status = "behind"

        # Projected completion date (based on monthly target)
        if monthly_target > 0 and remaining > 0:
            months_to_go = math.ceil(remaining / monthly_target)
            today = date.today()
            proj_year = today.year + (today.month + months_to_go - 1) // 12
            proj_month = (today.month + months_to_go - 1) % 12 + 1
            projected_date = date(proj_year, proj_month, min(today.day, 28)).isoformat()
        else:
            projected_date = None

    return {
        **goal,
        "pct": pct,
        "remaining": remaining,
        "months_left": months_left,
        "monthly_needed": monthly_needed,
        "projected_date": projected_date,
        "status": status,
    }


def _status_badge(status: str) -> str:
    badges = {
        "completed": "\u2705 Completed",
        "ahead":     "\U0001f7e2 Ahead",
        "on_track":  "\U0001f7e1 On Track",
        "behind":    "\U0001f534 Behind",
    }
    return badges.get(status, status)


# ── Load goals ────────────────────────────────────────────────────────────────

raw_goals = select("savings_goals")
goals = [_goal_status(g) for g in raw_goals]
active_goals = [g for g in goals if g.get("is_active", 1) == 1]
completed_goals = [g for g in goals if g["status"] == "completed"]

# ── Empty state ───────────────────────────────────────────────────────────────

if not raw_goals:
    st.info(
        "No savings goals yet. Use the form below to create your first goal "
        "and start tracking your progress!"
    )

# ── Overview metrics ──────────────────────────────────────────────────────────

if active_goals:
    total_target = sum(float(g["target_amount"]) for g in active_goals)
    total_saved = sum(float(g["current_amount"]) for g in active_goals)
    total_remaining = total_target - total_saved
    overall_pct = total_saved / total_target if total_target > 0 else 0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("\U0001f3af Active Goals", len(active_goals))
    c2.metric("\U0001f4b0 Total Target", fmt_inr(total_target))
    c3.metric("\U0001f4b3 Total Saved", fmt_inr(total_saved))
    c4.metric("\U0001f4ca Overall Progress", f"{overall_pct:.0%}")

    st.progress(min(overall_pct, 1.0))
    st.divider()

# ── Goal detail cards ─────────────────────────────────────────────────────────

if active_goals:
    st.subheader("\U0001f4cb Active Goals")

    # Display in rows of 2
    for i in range(0, len(active_goals), 2):
        cols = st.columns(2)
        for j, col in enumerate(cols):
            idx = i + j
            if idx >= len(active_goals):
                break
            g = active_goals[idx]
            color = g.get("color", "#6366f1")
            with col:
                st.markdown(
                    f"<div style='border-left: 4px solid {color}; padding-left: 12px;'>"
                    f"<h4 style='margin-bottom:0'>{g['name']}</h4></div>",
                    unsafe_allow_html=True,
                )
                badge = _status_badge(g["status"])
                st.caption(
                    f"{badge}  |  "
                    f"Category: {g.get('category') or 'None'}  |  "
                    f"Deadline: {g.get('deadline') or 'No deadline'}"
                )

                # Progress bar
                st.progress(g["pct"])
                mc1, mc2, mc3 = st.columns(3)
                mc1.metric("Saved", fmt_inr(g["current_amount"]))
                mc2.metric("Target", fmt_inr(g["target_amount"]))
                mc3.metric("Remaining", fmt_inr(g["remaining"]))

                # Monthly breakdown
                details = []
                if g.get("monthly_target") and float(g["monthly_target"]) > 0:
                    details.append(f"Monthly contribution target: **{fmt_inr(g['monthly_target'])}**")
                if g["monthly_needed"] is not None:
                    details.append(f"Monthly needed to hit deadline: **{fmt_inr(g['monthly_needed'])}**")
                if g["months_left"] is not None:
                    details.append(f"Months remaining: **{g['months_left']}**")
                if g["projected_date"]:
                    details.append(f"Projected completion: **{g['projected_date']}**")
                if details:
                    st.markdown("  \n".join(details))

                # Action buttons
                btn_cols = st.columns(3)
                with btn_cols[0]:
                    if st.button("\u270f\ufe0f Edit", key=f"edit_{g['id']}"):
                        st.session_state["editing_goal"] = g["id"]
                        st.rerun()
                with btn_cols[1]:
                    if st.button("\U0001f4b5 Add Savings", key=f"add_sav_{g['id']}"):
                        st.session_state["add_savings_goal"] = g["id"]
                        st.rerun()
                with btn_cols[2]:
                    if st.button("\U0001f5d1\ufe0f Archive", key=f"archive_{g['id']}"):
                        update("savings_goals", {"is_active": 0}, id=g["id"])
                        st.success(f"Archived: {g['name']}")
                        st.rerun()

                st.markdown("---")

    st.divider()

# ── Quick "Add Savings" modal ─────────────────────────────────────────────────

if "add_savings_goal" in st.session_state:
    goal_id = st.session_state["add_savings_goal"]
    goal = next((g for g in goals if g["id"] == goal_id), None)
    if goal:
        st.subheader(f"\U0001f4b5 Add Savings to: {goal['name']}")
        with st.form("add_savings_form"):
            add_amount = st.number_input(
                "Amount to add (\u20b9)", min_value=0.0, step=500.0,
                value=float(goal.get("monthly_target") or 0),
            )
            if st.form_submit_button("Add Savings", type="primary"):
                new_total = float(goal["current_amount"]) + add_amount
                update("savings_goals", {"current_amount": new_total}, id=goal_id)
                st.success(f"Added {fmt_inr(add_amount)} to {goal['name']}!")
                del st.session_state["add_savings_goal"]
                st.rerun()
        if st.button("Cancel"):
            del st.session_state["add_savings_goal"]
            st.rerun()
        st.divider()

# ── Progress visualisation (Plotly) ───────────────────────────────────────────

if active_goals:
    st.subheader("\U0001f4ca Goal Progress Overview")

    names = [g["name"] for g in active_goals]
    saved_vals = [float(g["current_amount"]) for g in active_goals]
    remaining_vals = [g["remaining"] for g in active_goals]
    colors = [g.get("color", "#6366f1") for g in active_goals]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        y=names, x=saved_vals, orientation="h",
        name="Saved", marker_color=colors,
        text=[fmt_inr(v) for v in saved_vals],
        textposition="inside", textfont=dict(color="white"),
        hovertemplate="%{y}<br>Saved: \u20b9%{x:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Bar(
        y=names, x=remaining_vals, orientation="h",
        name="Remaining", marker_color="rgba(200,200,200,0.3)",
        text=[fmt_inr(v) for v in remaining_vals],
        textposition="inside",
        hovertemplate="%{y}<br>Remaining: \u20b9%{x:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        barmode="stack",
        height=max(len(active_goals) * 60, 200),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=0, r=0, t=10, b=0),
        xaxis=dict(tickprefix="\u20b9", gridcolor="rgba(128,128,128,0.1)"),
        yaxis=dict(autorange="reversed"),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    st.divider()

# ── Savings rate helper ───────────────────────────────────────────────────────

st.subheader("\U0001f4b8 Savings Rate Helper")
st.caption("Based on your current period income and expenses.")

cur = current_period()
df_cur = get_transactions(period=cur)

if not df_cur.empty:
    income = float(df_cur[df_cur["amount"] > 0]["amount"].sum())
    expenses = float(df_cur[df_cur["amount"] < 0]["amount"].apply(abs).sum())
    net = income - expenses

    # Already committed to goals this period
    total_monthly_targets = sum(float(g.get("monthly_target") or 0) for g in active_goals)
    available = net - total_monthly_targets

    sc1, sc2, sc3, sc4 = st.columns(4)
    sc1.metric("\U0001f4c8 Income (this period)", fmt_inr(income))
    sc2.metric("\U0001f4c9 Expenses (this period)", fmt_inr(expenses))
    sc3.metric("\U0001f4b0 Net Surplus", fmt_inr(net),
               delta=f"{net / income * 100:.0f}% savings rate" if income > 0 else None)
    sc4.metric("\U0001f3af Available for Goals",
               fmt_inr(max(available, 0)),
               delta=f"After {fmt_inr(total_monthly_targets)} committed" if total_monthly_targets > 0 else None,
               delta_color="off")

    if available < 0:
        st.warning(
            f"Your goal commitments ({fmt_inr(total_monthly_targets)}) "
            f"exceed your net surplus ({fmt_inr(net)}) by {fmt_inr(abs(available))}. "
            "Consider adjusting targets."
        )
    elif available > 0 and active_goals:
        st.success(
            f"You have {fmt_inr(available)} available beyond your current goal commitments. "
            "You could increase contributions or add a new goal!"
        )
else:
    st.info("No transactions this period yet. Income and expense data will appear once imported.")

st.divider()

# ── Add / Edit Goal form ─────────────────────────────────────────────────────

editing_id = st.session_state.get("editing_goal")
editing_goal = next((g for g in goals if g["id"] == editing_id), None) if editing_id else None
form_title = f"\u270f\ufe0f Edit Goal: {editing_goal['name']}" if editing_goal else "\u2795 Add New Goal"

st.subheader(form_title)

category_options = ["(None)"] + get_all_category_options()

with st.form("goal_form", clear_on_submit=True):
    fc1, fc2 = st.columns(2)
    with fc1:
        goal_name = st.text_input(
            "Goal Name",
            value=editing_goal["name"] if editing_goal else "",
            placeholder="e.g. Emergency Fund, Vacation, Down Payment",
        )
        target_amount = st.number_input(
            "Target Amount (\u20b9)",
            min_value=0.0, step=5000.0,
            value=float(editing_goal["target_amount"]) if editing_goal else 0.0,
        )
        current_amount = st.number_input(
            "Current Amount Saved (\u20b9)",
            min_value=0.0, step=1000.0,
            value=float(editing_goal["current_amount"]) if editing_goal else 0.0,
        )
    with fc2:
        deadline = st.date_input(
            "Deadline (optional)",
            value=(
                datetime.strptime(str(editing_goal["deadline"])[:10], "%Y-%m-%d").date()
                if editing_goal and editing_goal.get("deadline")
                else None
            ),
            min_value=date.today(),
            format="DD/MM/YYYY",
        )
        monthly_target = st.number_input(
            "Monthly Contribution Target (\u20b9)",
            min_value=0.0, step=1000.0,
            value=float(editing_goal.get("monthly_target") or 0) if editing_goal else 0.0,
        )
        cat_idx = 0
        if editing_goal and editing_goal.get("category"):
            try:
                cat_idx = category_options.index(editing_goal["category"])
            except ValueError:
                cat_idx = 0
        linked_category = st.selectbox("Linked Category (optional)", category_options, index=cat_idx)

    color_val = editing_goal.get("color", "#6366f1") if editing_goal else GOAL_COLORS[len(raw_goals) % len(GOAL_COLORS)]
    goal_color = st.color_picker("Color", value=color_val)

    submitted = st.form_submit_button(
        "Update Goal" if editing_goal else "Create Goal",
        type="primary",
    )

    if submitted:
        if not goal_name.strip():
            st.error("Goal name is required.")
        elif target_amount <= 0:
            st.error("Target amount must be greater than zero.")
        else:
            data = {
                "name": goal_name.strip(),
                "target_amount": target_amount,
                "current_amount": current_amount,
                "deadline": deadline.isoformat() if deadline else None,
                "category": linked_category if linked_category != "(None)" else None,
                "monthly_target": monthly_target,
                "color": goal_color,
                "is_active": 1,
            }
            if editing_goal:
                update("savings_goals", data, id=editing_goal["id"])
                st.success(f"Updated goal: {goal_name}")
                del st.session_state["editing_goal"]
            else:
                insert("savings_goals", data)
                st.success(f"Created goal: {goal_name}")
            st.rerun()

if editing_goal:
    if st.button("Cancel Editing"):
        del st.session_state["editing_goal"]
        st.rerun()

# ── Completed / Archived goals ───────────────────────────────────────────────

archived_goals = [g for g in goals if g.get("is_active", 1) == 0]

if completed_goals or archived_goals:
    with st.expander(f"\U0001f4e6 Completed & Archived Goals ({len(completed_goals) + len(archived_goals)})"):
        for g in completed_goals + archived_goals:
            gc1, gc2, gc3 = st.columns([3, 2, 1])
            gc1.write(f"**{g['name']}** — {fmt_inr(g['target_amount'])}")
            gc2.write(_status_badge(g["status"]) if g.get("is_active", 1) == 1 else "\U0001f4e6 Archived")
            with gc3:
                bc1, bc2 = st.columns(2)
                with bc1:
                    if g.get("is_active", 1) == 0:
                        if st.button("\u267b\ufe0f", key=f"restore_{g['id']}", help="Restore"):
                            update("savings_goals", {"is_active": 1}, id=g["id"])
                            st.rerun()
                with bc2:
                    if st.button("\U0001f5d1\ufe0f", key=f"del_{g['id']}", help="Delete permanently"):
                        delete("savings_goals", id=g["id"])
                        st.rerun()
