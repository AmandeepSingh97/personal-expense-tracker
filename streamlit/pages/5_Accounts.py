"""Accounts — balance tracking with onboarding."""

import streamlit as st
import json

from utils.db import query, execute
from utils.formatters import fmt_inr, fmt_date

st.set_page_config(page_title="Accounts", page_icon="🏦", layout="wide")
st.title("🏦 Accounts")

ACCOUNT_TYPES = ["savings", "current", "credit", "investment", "cash"]
TYPE_EMOJI = {"savings": "🏦", "current": "🏢", "credit": "💳", "investment": "📈", "cash": "💵"}
COLORS = ["#6366f1","#3b82f6","#10b981","#f59e0b","#ec4899","#ef4444","#8b5cf6","#06b6d4","#84cc16","#fb923c"]
PRESET_TAGS = ["salary account","spending account","savings account","holiday fund",
               "Preet spend","joint expenses","car loan","emergency fund","investment"]

@st.cache_data(ttl=15)
def load_accounts():
    return query("""
        SELECT a.*, COALESCE(SUM(t.amount),0) AS tx_total, COUNT(t.id)::int AS tx_count
        FROM accounts a
        LEFT JOIN transactions t ON t.account_name=a.name AND t.is_transfer=0
        WHERE a.is_active=1
        GROUP BY a.id ORDER BY a.created_at
    """)

accounts = load_accounts()

# ── Net worth ─────────────────────────────────────────────────────────────────

if accounts:
    net_worth = sum(float(a["opening_balance"]) + float(a["tx_total"] or 0) for a in accounts)
    st.metric("💰 Net Worth", fmt_inr(net_worth))
    st.divider()

# ── Add account form ──────────────────────────────────────────────────────────

with st.expander("➕ Add / Edit Account", expanded=not accounts):
    with st.form("add_account"):
        st.subheader("New Account")

        # Quick suggestions
        existing_names = {a["name"] for a in accounts}
        suggestions = [n for n in ["ICICI Savings","HDFC Credit Card","Axis Joint Account",
                                    "Kotak Savings","IndusInd Savings","Canara Savings"]
                       if n not in existing_names]
        if suggestions:
            picked = st.selectbox("Quick select (or type below)", ["— type manually —"] + suggestions)
        else:
            picked = "— type manually —"

        col1, col2 = st.columns(2)
        default_name = "" if picked == "— type manually —" else picked
        name         = col1.text_input("Account Name *", value=default_name)
        bank         = col2.text_input("Bank name", placeholder="e.g. ICICI Bank")
        acct_type    = col1.selectbox("Type", ACCOUNT_TYPES, format_func=lambda t: f"{TYPE_EMOJI[t]} {t.title()}")
        opening_bal  = col2.number_input("Opening Balance (₹) *",
                                          help="Negative for credit cards if you owe money",
                                          step=100.0)
        from datetime import date
        opening_date = col1.date_input("Balance as of", value=date.today())
        color        = col2.selectbox("Color", COLORS, format_func=lambda c: c)

        st.markdown("**Account Tags**")
        selected_tags = st.multiselect("What does this account do?", PRESET_TAGS)
        custom_tag    = st.text_input("Custom tag (press Enter to add in multiselect)")

        notes = st.text_input("Notes (optional)")

        saved = st.form_submit_button("Add Account", type="primary", use_container_width=True)

    if saved:
        if not name.strip():
            st.error("Account name is required.")
        elif name.strip() in existing_names:
            st.error("Account already exists.")
        else:
            all_tags = selected_tags + ([custom_tag.strip()] if custom_tag.strip() else [])
            execute("""
                INSERT INTO accounts (name,bank,account_type,opening_balance,opening_date,color,notes,tags)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(name) DO NOTHING
            """, (name.strip(), bank or None, acct_type, opening_bal,
                   opening_date.isoformat(), color, notes or None, json.dumps(all_tags)))
            st.success(f"✅ Account **{name}** added!")
            st.cache_data.clear()
            st.rerun()

st.divider()

# ── Account cards ─────────────────────────────────────────────────────────────

if not accounts:
    st.info("No accounts yet. Add your first account above.")
else:
    cols = st.columns(min(len(accounts), 3))
    for i, a in enumerate(accounts):
        bal = round(float(a["opening_balance"]) + float(a["tx_total"] or 0), 2)
        is_credit = a["account_type"] == "credit"
        tags = a["tags"] if isinstance(a["tags"], list) else json.loads(a["tags"] or "[]")

        with cols[i % 3]:
            bal_color = "#ef4444" if (is_credit and bal < 0) or (not is_credit and bal < 0) else "#10b981"
            st.markdown(f"""
                <div style='border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:8px;
                            border-top:4px solid {a["color"]}'>
                    <div style='font-size:1.1rem;font-weight:600'>{TYPE_EMOJI.get(a['account_type'],'🏦')} {a['name']}</div>
                    <div style='color:#94a3b8;font-size:0.8rem'>{a.get('bank','') or ''}</div>
                    <div style='font-size:1.6rem;font-weight:700;color:{bal_color};margin:8px 0'>{fmt_inr(bal)}</div>
                    <div style='color:#64748b;font-size:0.75rem'>{a['tx_count']} transactions</div>
                    {"".join(f"<span style='background:#1e293b;color:#94a3b8;border-radius:20px;padding:2px 8px;font-size:0.7rem;margin-right:4px'>{t}</span>" for t in tags)}
                </div>
            """, unsafe_allow_html=True)

            if st.button("🗑️ Remove", key=f"del_{a['id']}", help="Archive this account"):
                execute("UPDATE accounts SET is_active=0 WHERE id=%s", (a["id"],))
                st.cache_data.clear()
                st.rerun()
