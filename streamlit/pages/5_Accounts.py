"""Accounts — balance tracking."""

import streamlit as st, json
from datetime import date
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
    cols = st.columns(min(len(accounts), 3))
    for i, a in enumerate(accounts):
        bal  = a["current_balance"]
        tags = a.get("tags") or []
        bc   = "#ef4444" if bal < 0 else "#10b981"
        with cols[i % 3]:
            st.markdown(f"""
<div style='border:1px solid #334155;border-radius:12px;padding:16px;
            border-top:4px solid {a["color"]}'>
  <div style='font-weight:600'>{TYPE_EMOJI.get(a['account_type'],'🏦')} {a['name']}</div>
  <div style='color:#94a3b8;font-size:0.8rem'>{a.get('bank') or ''}</div>
  <div style='font-size:1.5rem;font-weight:700;color:{bc};margin:6px 0'>{fmt_inr(bal)}</div>
  <div style='color:#64748b;font-size:0.75rem'>{a['tx_count']} transactions</div>
  <div style='margin-top:6px'>{''.join(f"<span style='background:#1e293b;color:#94a3b8;border-radius:20px;padding:2px 8px;font-size:0.7rem;margin-right:4px'>{t}</span>" for t in tags)}</div>
</div>""", unsafe_allow_html=True)
            if st.button("🗑️", key=f"del_{a['id']}", help="Remove account"):
                update("accounts", {"is_active": 0}, id=a["id"])
                st.cache_data.clear(); st.rerun()
