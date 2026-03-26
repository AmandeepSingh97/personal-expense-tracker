"""Split Transaction — break a single transaction into multiple category allocations.

Requires Supabase table (run in SQL Editor):

CREATE TABLE IF NOT EXISTS transaction_splits (
  id BIGSERIAL PRIMARY KEY,
  parent_transaction_id BIGINT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  amount NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

import streamlit as st
import pandas as pd

from utils.db import select, select_all, insert, update, delete
from utils.data import get_transactions
from utils.budget_period import current_period, period_label, last_n_periods
from utils.categories import cat_emoji, get_all_category_options
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Split Transaction", page_icon="✂️", layout="wide")
st.title("✂️ Split Transaction")

# ── Session state defaults ────────────────────────────────────────────────────

if "split_rows" not in st.session_state:
    st.session_state.split_rows = [
        {"category": "", "amount": 0.0, "description": ""},
        {"category": "", "amount": 0.0, "description": ""},
    ]

if "selected_tx_id" not in st.session_state:
    st.session_state.selected_tx_id = None

# ── Helpers ───────────────────────────────────────────────────────────────────

ALL_CATEGORIES = get_all_category_options()


def _load_all_splits() -> dict[int, list[dict]]:
    """Load all splits keyed by parent_transaction_id."""
    rows = select_all("transaction_splits")
    splits: dict[int, list[dict]] = {}
    for r in rows:
        pid = r["parent_transaction_id"]
        splits.setdefault(pid, []).append(r)
    return splits


def _load_splits_for(tx_id: int) -> list[dict]:
    return select("transaction_splits", parent_transaction_id=tx_id)


def _delete_splits_for(tx_id: int):
    delete("transaction_splits", parent_transaction_id=tx_id)


def _save_splits(tx_id: int, rows: list[dict]):
    for r in rows:
        insert("transaction_splits", {
            "parent_transaction_id": tx_id,
            "category": r["category"],
            "sub_category": r.get("sub_category") or None,
            "amount": r["amount"],
            "description": r.get("description") or None,
        })


def _reset_split_form():
    st.session_state.split_rows = [
        {"category": "", "amount": 0.0, "description": ""},
        {"category": "", "amount": 0.0, "description": ""},
    ]
    st.session_state.selected_tx_id = None


# ── Tabs ──────────────────────────────────────────────────────────────────────

tab_create, tab_view = st.tabs(["Create Split", "View Splits"])

# ══════════════════════════════════════════════════════════════════════════════
#  TAB 1 — Create / edit a split
# ══════════════════════════════════════════════════════════════════════════════

with tab_create:

    # ── Period & search filters ───────────────────────────────────────────────

    st.subheader("1. Find a transaction")

    fc1, fc2, fc3 = st.columns([2, 2, 3])
    periods = last_n_periods(12)
    period_labels = {p: period_label(p) for p in reversed(periods)}
    cur_p = current_period()
    sel_period = fc1.selectbox(
        "Period",
        list(period_labels),
        format_func=lambda p: period_labels[p],
        index=list(reversed(periods)).index(cur_p),
        key="split_period",
    )
    include_transfers = fc2.checkbox("Include transfers", value=False, key="split_inc_xfer")
    search_text = fc3.text_input("Search description / merchant", key="split_search")

    df = get_transactions(period=sel_period, include_transfers=include_transfers)

    if df.empty:
        st.info("No transactions for this period.")
        st.stop()

    # Apply search filter
    if search_text:
        mask = df["description"].str.contains(search_text, case=False, na=False)
        if "merchant_name" in df.columns:
            mask |= df["merchant_name"].str.contains(search_text, case=False, na=False)
        df = df[mask]

    if df.empty:
        st.warning("No transactions match your search.")
        st.stop()

    # Sort by date descending
    df = df.sort_values("date", ascending=False).reset_index(drop=True)

    # ── Transaction picker ────────────────────────────────────────────────────

    # Build display labels
    tx_options = []
    for _, r in df.iterrows():
        amt = float(r["amount"])
        sign = "+" if amt > 0 else ""
        label = (
            f"{fmt_date(r['date'])}  |  "
            f"{sign}{fmt_inr(amt)}  |  "
            f"{r.get('merchant_name') or str(r['description'])[:50]}  |  "
            f"{r.get('category') or 'Uncategorized'}"
        )
        tx_options.append((r["id"], label))

    tx_id_map = {tid: label for tid, label in tx_options}
    tx_ids = [tid for tid, _ in tx_options]

    selected_id = st.selectbox(
        "Select transaction to split",
        tx_ids,
        format_func=lambda tid: tx_id_map[tid],
        key="split_tx_picker",
    )

    if selected_id is None:
        st.stop()

    # Load selected transaction details
    tx_row = df[df["id"] == selected_id].iloc[0]
    tx_amount = float(tx_row["amount"])
    tx_abs = abs(tx_amount)
    is_expense = tx_amount < 0

    # Show transaction details
    st.divider()
    mc1, mc2, mc3, mc4 = st.columns(4)
    mc1.metric("Date", fmt_date(tx_row["date"]))
    mc2.metric("Amount", fmt_inr(tx_amount))
    mc3.metric("Category", tx_row.get("category") or "Uncategorized")
    mc4.metric("Account", tx_row.get("account_name") or "—")

    desc_text = tx_row.get("merchant_name") or str(tx_row["description"])
    st.caption(f"Description: **{desc_text}**")

    # Check for existing splits
    existing_splits = _load_splits_for(selected_id)
    if existing_splits:
        st.warning(
            f"This transaction already has **{len(existing_splits)} split(s)**. "
            "Creating new splits will replace the existing ones."
        )

    # ── Split form ────────────────────────────────────────────────────────────

    st.subheader("2. Define split rows")
    st.caption(
        f"Original amount: **{fmt_inr(tx_amount)}** — "
        f"split amounts must sum to **{fmt_inr(tx_abs)}** "
        f"({'all negative for expense' if is_expense else 'all positive for income'})."
    )

    # Add / remove row buttons
    btn_c1, btn_c2, _ = st.columns([1, 1, 4])
    if btn_c1.button("➕ Add row", key="add_split_row"):
        st.session_state.split_rows.append({"category": "", "amount": 0.0, "description": ""})
        st.rerun()
    if btn_c2.button("➖ Remove last", key="rm_split_row"):
        if len(st.session_state.split_rows) > 2:
            st.session_state.split_rows.pop()
            st.rerun()
        else:
            st.toast("Minimum 2 rows required for a split.")

    # Render split rows
    header_cols = st.columns([3, 2, 3, 1])
    header_cols[0].markdown("**Category**")
    header_cols[1].markdown("**Amount (positive)**")
    header_cols[2].markdown("**Description (optional)**")
    header_cols[3].markdown("**#**")

    collected_rows: list[dict] = []
    running_total = 0.0

    for i, row_data in enumerate(st.session_state.split_rows):
        rc1, rc2, rc3, rc4 = st.columns([3, 2, 3, 1])

        # Category selector — default to original category for first row
        default_cat = row_data.get("category") or ""
        if not default_cat and i == 0:
            default_cat = tx_row.get("category") or ""
        cat_idx = ALL_CATEGORIES.index(default_cat) if default_cat in ALL_CATEGORIES else 0

        cat_val = rc1.selectbox(
            "Category",
            ALL_CATEGORIES,
            index=cat_idx,
            format_func=lambda c: f"{cat_emoji(c)} {c}",
            key=f"split_cat_{i}",
            label_visibility="collapsed",
        )

        amt_val = rc2.number_input(
            "Amount",
            min_value=0.0,
            value=float(row_data.get("amount") or 0.0),
            step=100.0,
            format="%.2f",
            key=f"split_amt_{i}",
            label_visibility="collapsed",
        )

        desc_val = rc3.text_input(
            "Description",
            value=row_data.get("description") or "",
            key=f"split_desc_{i}",
            label_visibility="collapsed",
        )

        rc4.markdown(f"<div style='padding-top:8px;text-align:center;color:#64748b'>#{i+1}</div>",
                     unsafe_allow_html=True)

        collected_rows.append({
            "category": cat_val,
            "amount": amt_val,
            "description": desc_val,
        })
        running_total += amt_val

    # ── Running total & validation ────────────────────────────────────────────

    diff = running_total - tx_abs
    if abs(diff) < 0.01:
        st.success(f"Split total: **{fmt_inr(running_total)}** — matches the transaction amount.")
    elif running_total == 0:
        st.info(f"Enter amounts that sum to **{fmt_inr(tx_abs)}**.")
    else:
        color = "#ef4444" if diff > 0 else "#f59e0b"
        direction = "over" if diff > 0 else "under"
        st.markdown(
            f"Split total: **{fmt_inr(running_total)}** — "
            f"<span style='color:{color}'>{fmt_inr(abs(diff))} {direction}</span> "
            f"(target: {fmt_inr(tx_abs)})",
            unsafe_allow_html=True,
        )

    # ── Remaining helper ──────────────────────────────────────────────────────

    remaining = tx_abs - running_total
    if remaining > 0.01:
        st.caption(f"Remaining to allocate: **{fmt_inr(remaining)}**")

    # ── Save button ───────────────────────────────────────────────────────────

    st.divider()
    if st.button("✅ Save Split", type="primary", use_container_width=True, key="save_split"):
        # Validation
        errors = []
        if abs(running_total - tx_abs) >= 0.01:
            errors.append(
                f"Split amounts must sum to {fmt_inr(tx_abs)}. "
                f"Current total: {fmt_inr(running_total)} "
                f"(difference: {fmt_inr(abs(running_total - tx_abs))})."
            )
        zero_rows = [r for r in collected_rows if r["amount"] <= 0]
        if zero_rows:
            errors.append("All split amounts must be greater than zero.")

        if errors:
            for e in errors:
                st.error(e)
        else:
            # Build rows with correct sign (negative for expenses)
            split_data = []
            for r in collected_rows:
                signed_amount = -abs(r["amount"]) if is_expense else abs(r["amount"])
                split_data.append({
                    "category": r["category"],
                    "amount": signed_amount,
                    "description": r["description"] or None,
                })

            # Delete existing splits if any
            if existing_splits:
                _delete_splits_for(selected_id)

            # Save new splits
            _save_splits(selected_id, split_data)

            st.success(
                f"Saved **{len(split_data)} splits** for transaction "
                f"**{desc_text[:40]}** ({fmt_inr(tx_amount)})."
            )

            # Reset form state
            _reset_split_form()
            st.cache_data.clear()
            st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
#  TAB 2 — View existing splits
# ══════════════════════════════════════════════════════════════════════════════

with tab_view:
    st.subheader("Transactions with splits")

    all_splits = _load_all_splits()
    if not all_splits:
        st.info("No splits created yet. Use the **Create Split** tab to split a transaction.")
        st.stop()

    # Load all transactions (all periods) to look up parent info
    df_all = get_transactions(include_transfers=True)

    if df_all.empty:
        st.warning("No transactions found.")
        st.stop()

    # Filter to only transactions that have splits
    split_tx_ids = set(all_splits.keys())
    df_split = df_all[df_all["id"].isin(split_tx_ids)].sort_values("date", ascending=False)

    if df_split.empty:
        st.info(
            "Splits exist but their parent transactions were not found. "
            "They may have been deleted."
        )
        st.stop()

    st.caption(f"**{len(df_split)}** transaction(s) with splits")

    for _, tx in df_split.iterrows():
        tx_id = tx["id"]
        amt = float(tx["amount"])
        emoji = cat_emoji(tx.get("category") or "Uncategorized")
        color = "#10b981" if amt > 0 else "#ef4444"
        sign = "+" if amt > 0 else ""
        desc = tx.get("merchant_name") or str(tx["description"])[:55]
        splits = all_splits.get(tx_id, [])

        # Parent transaction header
        hc1, hc2, hc3, hc4 = st.columns([1, 4, 2, 1])
        hc1.write(emoji)
        hc2.write(
            f"**{desc}**  \n"
            f"_{fmt_date(tx['date'])} · {tx['account_name']} · {tx.get('category') or '—'}_"
        )
        hc3.markdown(
            f"<span style='color:{color}'>{sign}{fmt_inr(amt)}</span>",
            unsafe_allow_html=True,
        )
        if hc4.button("🗑️", key=f"del_split_{tx_id}", help="Remove all splits"):
            st.session_state[f"confirm_del_split_{tx_id}"] = True

        # Confirm delete
        if st.session_state.get(f"confirm_del_split_{tx_id}"):
            st.warning(f"Delete all splits for **{desc[:40]}**?")
            yc, nc = st.columns(2)
            if yc.button("Yes, delete splits", key=f"yes_split_{tx_id}", type="primary"):
                _delete_splits_for(tx_id)
                st.session_state.pop(f"confirm_del_split_{tx_id}", None)
                st.cache_data.clear()
                st.rerun()
            if nc.button("Cancel", key=f"no_split_{tx_id}"):
                st.session_state.pop(f"confirm_del_split_{tx_id}", None)
                st.rerun()

        # Split breakdown
        with st.container():
            for s in splits:
                sc1, sc2, sc3 = st.columns([1, 3, 2])
                s_emoji = cat_emoji(s["category"])
                s_amt = float(s["amount"])
                s_color = "#10b981" if s_amt > 0 else "#ef4444"
                s_sign = "+" if s_amt > 0 else ""
                sc1.write(f"  {s_emoji}")
                sc2.write(
                    f"**{s['category']}**"
                    + (f" — _{s['description']}_" if s.get("description") else "")
                )
                sc3.markdown(
                    f"<span style='color:{s_color}'>{s_sign}{fmt_inr(s_amt)}</span>",
                    unsafe_allow_html=True,
                )

            # Verify split total matches
            split_total = sum(float(s["amount"]) for s in splits)
            if abs(abs(split_total) - abs(amt)) >= 0.01:
                st.warning(
                    f"Split total ({fmt_inr(split_total)}) does not match "
                    f"transaction amount ({fmt_inr(amt)})."
                )

        st.divider()
