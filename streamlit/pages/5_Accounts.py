"""Accounts — balance tracking."""

import streamlit as st, json
from datetime import date, datetime
from utils.db import select, insert, update, delete
from utils.data import get_accounts_with_balance
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Accounts", page_icon="🏦", layout="wide")
st.title("🏦 Accounts")

TYPE_EMOJI = {"savings":"🏦","current":"🏢","credit":"💳","investment":"📈","cash":"💵"}
COLORS = ["#6366f1","#3b82f6","#10b981","#f59e0b","#ec4899","#ef4444","#8b5cf6","#06b6d4","#84cc16","#fb923c"]
PRESET_TAGS = ["salary account","spending account","savings account","holiday fund",
               "Preet spend","joint expenses","car loan","emergency fund","investment"]

accounts = get_accounts_with_balance()
net_worth = sum(a["current_balance"] for a in accounts)
if accounts:
    st.metric("💰 Net Worth", fmt_inr(net_worth))
    st.divider()

# ── Add account ───────────────────────────────────────────────────────────────

with st.expander("➕ Add Account", expanded=not accounts):
    existing_names = {a["name"] for a in accounts}
    suggestions = [n for n in ["ICICI Savings","HDFC Credit Card","Axis Joint Account",
                                "Kotak Savings","IndusInd Savings","Canara Savings"]
                   if n not in existing_names]

    with st.form("add_account"):
        picked = st.selectbox("Quick select", ["— type manually —"] + suggestions)
        c1, c2 = st.columns(2)
        name     = c1.text_input("Name *", value="" if picked == "— type manually —" else picked)
        bank     = c2.text_input("Bank")
        acct_t   = c1.selectbox("Type", ["savings","current","credit","investment","cash"],
                                  format_func=lambda t: f"{TYPE_EMOJI[t]} {t.title()}")
        opening  = c2.number_input("Opening Balance (₹)", step=100.0,
                                    help="Negative for credit cards if you owe money")
        as_of    = c1.date_input("Balance as of", value=date.today())
        color    = c2.selectbox("Color", COLORS)
        tags     = st.multiselect("Account Tags", PRESET_TAGS)
        custom_t = st.text_input("Custom tag")
        notes    = st.text_input("Notes (optional)")

        if st.form_submit_button("Add Account", type="primary", use_container_width=True):
            if not name.strip():
                st.error("Name required")
            elif name.strip() in existing_names:
                st.error("Account already exists")
            else:
                all_tags = tags + ([custom_t.strip()] if custom_t.strip() else [])
                insert("accounts", {
                    "name": name.strip(), "bank": bank or None, "account_type": acct_t,
                    "opening_balance": opening, "opening_date": as_of.isoformat(),
                    "color": color, "notes": notes or None, "tags": all_tags, "is_active": 1,
                })
                st.success(f"✅ {name} added!")
                st.cache_data.clear(); st.rerun()

st.divider()

# ── Account cards ─────────────────────────────────────────────────────────────

if not accounts:
    st.info("No accounts yet. Add your first account above.")
else:
    for a in accounts:
        bal  = a["current_balance"]
        tags = a.get("tags") or []
        bc   = "#ef4444" if bal < 0 else "#10b981"
        editing = st.session_state.get(f"edit_{a['id']}", False)

        with st.container():
            c1, c2, c3 = st.columns([5, 1, 1])
            with c1:
                st.markdown(
                    f"**{TYPE_EMOJI.get(a['account_type'],'🏦')} {a['name']}**"
                    + (f"  ·  {a['bank']}" if a.get("bank") else "")
                    + f"  —  <span style='color:{bc}'>{fmt_inr(bal)}</span>"
                    + f"  <span style='color:#64748b;font-size:0.8rem'>({a['tx_count']} txns)</span>",
                    unsafe_allow_html=True,
                )
                if tags:
                    st.caption("  ".join(f"`{t}`" for t in tags))
            with c2:
                if st.button("✏️ Edit", key=f"btn_edit_{a['id']}"):
                    st.session_state[f"edit_{a['id']}"] = not editing
                    st.rerun()
            with c3:
                if st.button("🗑️ Remove", key=f"del_{a['id']}"):
                    update("accounts", {"is_active": 0}, id=a["id"])
                    st.cache_data.clear(); st.rerun()

        # ── Inline edit form ──────────────────────────────────────────────────
        if editing:
            with st.form(f"edit_form_{a['id']}"):
                st.markdown(f"**Editing: {a['name']}**")
                c1, c2 = st.columns(2)
                new_name    = c1.text_input("Name",         value=a["name"])
                new_bank    = c2.text_input("Bank",         value=a.get("bank") or "")
                new_type    = c1.selectbox("Type",
                    ["savings","current","credit","investment","cash"],
                    index=["savings","current","credit","investment","cash"].index(a["account_type"]),
                    format_func=lambda t: f"{TYPE_EMOJI[t]} {t.title()}")
                new_bal     = c2.number_input("Opening Balance (₹)",
                    value=float(a["opening_balance"]), step=100.0)
                try:
                    _od = datetime.strptime(a.get("opening_date","2024-01-01"), "%Y-%m-%d").date()
                except Exception:
                    _od = date.today()
                new_date_d  = c1.date_input("Balance as of", value=_od, key=f"od_{a['id']}")
                new_date    = new_date_d.isoformat()
                new_color   = c2.selectbox("Color", COLORS,
                    index=COLORS.index(a["color"]) if a["color"] in COLORS else 0)
                new_tags    = st.multiselect("Tags", PRESET_TAGS, default=[t for t in tags if t in PRESET_TAGS])
                new_custom  = st.text_input("Custom tag", value="")
                new_notes   = st.text_input("Notes", value=a.get("notes") or "")

                sv, ca = st.columns(2)
                saved  = sv.form_submit_button("💾 Save", type="primary", use_container_width=True)
                cancel = ca.form_submit_button("Cancel", use_container_width=True)

            if saved:
                all_tags = new_tags + ([new_custom.strip()] if new_custom.strip() else [])
                update("accounts", {
                    "name":            new_name.strip(),
                    "bank":            new_bank or None,
                    "account_type":    new_type,
                    "opening_balance": new_bal,
                    "opening_date":    new_date,
                    "color":           new_color,
                    "notes":           new_notes or None,
                    "tags":            all_tags,
                }, id=a["id"])
                st.session_state.pop(f"edit_{a['id']}", None)
                st.success("Saved!")
                st.cache_data.clear(); st.rerun()
            if cancel:
                st.session_state.pop(f"edit_{a['id']}", None); st.rerun()

        st.divider()
