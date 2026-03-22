"""Import — upload CSV/Excel/PDF and categorize transactions."""

import streamlit as st
import pandas as pd
import pdfplumber
import io, hashlib, re
from datetime import datetime

from utils.db import query, execute
from utils.categorizer import categorize
from utils.categories import ALL_BUDGET_CATEGORIES, cat_emoji
from utils.formatters import fmt_inr

st.set_page_config(page_title="Import", page_icon="📥", layout="wide")
st.title("📥 Import Transactions")

# ── Helpers ───────────────────────────────────────────────────────────────────

def norm_date(val) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    s = str(val).strip()
    for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"]:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None

def norm_amount(val) -> float | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(str(val).replace(",", "").replace("₹", "").strip())
    except ValueError:
        return None

def extract_pdf_text(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)

def parse_icici_text(text: str) -> list[dict]:
    """Heuristic ICICI PDF parser — balance-diff driven."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    skip = re.compile(r"^(S No\.|Transaction|Cheque|Withdrawal|Deposit|Balance|www\.|Please|Never|Dial|BRANCH|AMANDEEP|Statement|Sincerely|Legends)", re.I)
    tx_start = re.compile(r"^(\d{1,4})(\d{2}\.\d{2}\.\d{4})(.*)")
    amt_only  = re.compile(r"^(\d+\.\d{2})(\d+\.\d{2})$")

    txns, cur = [], None
    for line in lines:
        if skip.search(line):
            continue
        m = tx_start.match(line)
        if m:
            if cur:
                txns.append(cur)
            cur = {"date": _parse_dot_date(m.group(2)), "narr_lines": [m.group(3).strip()], "balance": None}
        elif cur:
            ma = amt_only.match(line)
            if ma:
                cur["balance"] = float(ma.group(2))
            else:
                cur["narr_lines"].append(line)

    if cur:
        txns.append(cur)

    result = []
    for i, tx in enumerate(txns):
        if tx["balance"] is None:
            continue
        prev_bal = txns[i-1]["balance"] if i > 0 else None
        if prev_bal is None:
            continue
        amount = round(tx["balance"] - prev_bal, 2)
        if amount == 0:
            continue
        narr = " ".join(tx["narr_lines"]).strip()
        result.append({"date": tx["date"], "description": narr, "amount": amount})

    return result

def _parse_dot_date(s: str) -> str:
    try:
        return datetime.strptime(s, "%d.%m.%Y").date().isoformat()
    except Exception:
        return s


# ── File upload ───────────────────────────────────────────────────────────────

accounts = query("SELECT name FROM accounts WHERE is_active=1 ORDER BY created_at")
acct_names = [a["name"] for a in accounts] or ["Manual"]

account_name = st.selectbox("Import to account", acct_names)
uploaded = st.file_uploader("Upload CSV, Excel, or PDF", type=["csv", "xlsx", "xls", "pdf"])

if uploaded:
    ext = uploaded.name.lower().split(".")[-1]

    # ── Parse ─────────────────────────────────────────────────────────────────

    if ext in ("xlsx", "xls"):
        df_raw = pd.read_excel(uploaded, header=0)
        st.write("**Preview (first 3 rows):**")
        st.dataframe(df_raw.head(3))

        col1, col2, col3, col4, col5 = st.columns(5)
        cols = ["—"] + list(df_raw.columns)
        date_col  = col1.selectbox("Date column",  cols)
        desc_col  = col2.selectbox("Description",  cols)
        amt_col   = col3.selectbox("Amount (single)", cols)
        debit_col = col4.selectbox("Debit column", cols)
        credit_col= col5.selectbox("Credit column",cols)

        if st.button("Preview extraction"):
            rows_out = []
            for _, row in df_raw.iterrows():
                d = norm_date(row.get(date_col) if date_col != "—" else None)
                desc = str(row.get(desc_col, "") or "").strip() if desc_col != "—" else ""
                if amt_col != "—":
                    amt = norm_amount(row.get(amt_col))
                elif debit_col != "—" and credit_col != "—":
                    deb = norm_amount(row.get(debit_col)) or 0
                    cred = norm_amount(row.get(credit_col)) or 0
                    amt = cred - deb
                else:
                    amt = None
                if d and desc and amt is not None:
                    cat = categorize(desc)
                    rows_out.append({"date": d, "description": desc, "amount": amt, **cat})
            st.session_state["import_rows"] = rows_out
            st.success(f"Extracted {len(rows_out)} transactions.")

    elif ext == "csv":
        content = uploaded.read().decode("utf-8", errors="replace")
        df_raw = pd.read_csv(io.StringIO(content))
        st.write("**Preview (first 3 rows):**")
        st.dataframe(df_raw.head(3))

        col1, col2, col3, col4, col5 = st.columns(5)
        cols = ["—"] + list(df_raw.columns)
        date_col  = col1.selectbox("Date column",  cols, key="csv_date")
        desc_col  = col2.selectbox("Description",  cols, key="csv_desc")
        amt_col   = col3.selectbox("Amount",       cols, key="csv_amt")
        debit_col = col4.selectbox("Debit",        cols, key="csv_deb")
        credit_col= col5.selectbox("Credit",       cols, key="csv_cred")

        if st.button("Preview extraction"):
            rows_out = []
            for _, row in df_raw.iterrows():
                d = norm_date(row.get(date_col) if date_col != "—" else None)
                desc = str(row.get(desc_col, "") or "").strip() if desc_col != "—" else ""
                if amt_col != "—":
                    amt = norm_amount(row.get(amt_col))
                elif debit_col != "—" and credit_col != "—":
                    deb = norm_amount(row.get(debit_col)) or 0
                    cred = norm_amount(row.get(credit_col)) or 0
                    amt = cred - deb
                else:
                    amt = None
                if d and desc and amt is not None:
                    cat = categorize(desc)
                    rows_out.append({"date": d, "description": desc, "amount": amt, **cat})
            st.session_state["import_rows"] = rows_out
            st.success(f"Extracted {len(rows_out)} transactions.")

    elif ext == "pdf":
        st.info("Extracting transactions from PDF (ICICI format)…")
        text = extract_pdf_text(uploaded.read())
        rows_out = parse_icici_text(text)
        for r in rows_out:
            r.update(categorize(r["description"]))
        st.session_state["import_rows"] = rows_out
        st.success(f"Extracted {len(rows_out)} transactions.")

    # ── Review + import ───────────────────────────────────────────────────────

    if "import_rows" in st.session_state and st.session_state["import_rows"]:
        rows_out = st.session_state["import_rows"]
        st.subheader(f"Review {len(rows_out)} transactions")

        df_preview = pd.DataFrame([{
            "Date":        r["date"],
            "Description": r["description"][:55],
            "Amount":      float(r["amount"]),
            "Category":    r["category"],
        } for r in rows_out])
        st.dataframe(df_preview, use_container_width=True, hide_index=True)

        total_debit  = sum(abs(float(r["amount"])) for r in rows_out if float(r["amount"]) < 0)
        total_credit = sum(float(r["amount"]) for r in rows_out if float(r["amount"]) > 0)
        c1, c2 = st.columns(2)
        c1.metric("Total Spend", fmt_inr(total_debit))
        c2.metric("Total Credit", fmt_inr(total_credit))

        if st.button("✅ Import All", type="primary"):
            imported, skipped = 0, 0
            for r in rows_out:
                h = hashlib.sha256(f"{r['date']}|{r['description']}|{r['amount']}".encode()).hexdigest()
                cnt, _ = execute("""
                    INSERT INTO transactions
                      (date,description,amount,account_name,category,sub_category,merchant_name,
                       is_recurring,is_investment,is_transfer,manually_corrected,dedup_hash)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s)
                    ON CONFLICT(dedup_hash) DO NOTHING
                """, (r["date"], r["description"], float(r["amount"]), account_name,
                       r["category"], r.get("sub_category"), r.get("merchant_name"),
                       int(r.get("is_recurring", False)), int(r.get("is_investment", False)),
                       int(r.get("is_transfer", False)), h))
                if cnt > 0:
                    imported += 1
                else:
                    skipped += 1

            st.success(f"✅ Imported **{imported}** transactions. Skipped **{skipped}** duplicates.")
            st.session_state.pop("import_rows", None)
            st.cache_data.clear()
