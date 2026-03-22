"""Import — upload CSV/Excel/PDF."""

import streamlit as st
import pandas as pd
import pdfplumber
import io, hashlib, re
from datetime import datetime

from utils.db import select, insert
from utils.categorizer import categorize
from utils.categories import ALL_BUDGET_CATEGORIES, cat_emoji
from utils.formatters import fmt_inr

st.set_page_config(page_title="Import", page_icon="📥", layout="wide")
st.title("📥 Import Transactions")

def norm_date(val):
    if val is None or (isinstance(val, float) and pd.isna(val)): return None
    if isinstance(val, datetime): return val.date().isoformat()
    s = str(val).strip()
    for fmt in ["%d/%m/%Y","%d-%m-%Y","%d.%m.%Y","%Y-%m-%d","%d/%m/%y","%d-%m-%y"]:
        try: return datetime.strptime(s, fmt).date().isoformat()
        except: pass
    return None

def norm_amount(val):
    if val is None or (isinstance(val, float) and pd.isna(val)): return None
    try: return float(str(val).replace(",","").replace("₹","").strip())
    except: return None

def parse_icici_pdf(file_bytes):
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)

    skip = re.compile(r"^(S No\.|Transaction|Cheque|Withdrawal|Deposit|Balance|www\.|Please|Never|Dial|BRANCH|Statement|Sincerely|Legends)", re.I)
    tx_start = re.compile(r"^(\d{1,4})(\d{2}\.\d{2}\.\d{4})(.*)")
    amt_only = re.compile(r"^(\d+\.\d{2})(\d+\.\d{2})$")

    txns, cur = [], None
    for line in [l.strip() for l in text.split("\n") if l.strip()]:
        if skip.search(line): continue
        m = tx_start.match(line)
        if m:
            if cur: txns.append(cur)
            d = datetime.strptime(m.group(2), "%d.%m.%Y").date().isoformat()
            cur = {"date": d, "narr": [m.group(3).strip()], "balance": None}
        elif cur:
            ma = amt_only.match(line)
            if ma: cur["balance"] = float(ma.group(2))
            else:  cur["narr"].append(line)

    if cur: txns.append(cur)

    result = []
    for i, tx in enumerate(txns):
        if tx["balance"] is None or i == 0: continue
        amount = round(tx["balance"] - txns[i-1]["balance"], 2)
        if amount == 0: continue
        result.append({"date": tx["date"], "description": " ".join(tx["narr"]).strip(), "amount": amount})
    return result

# ── UI ─────────────────────────────────────────────────────────────────────────

accounts = select("accounts", is_active=1)
acct_names = [a["name"] for a in accounts] or ["Manual"]
account_name = st.selectbox("Import to account", acct_names)
uploaded = st.file_uploader("Upload CSV, Excel, or PDF", type=["csv","xlsx","xls","pdf"])

if not uploaded:
    st.stop()

ext = uploaded.name.lower().rsplit(".", 1)[-1]

if ext in ("xlsx","xls"):
    df_raw = pd.read_excel(uploaded, header=0)
    st.write("**Preview:**"); st.dataframe(df_raw.head(3))
    cs = ["—"] + list(df_raw.columns)
    c1,c2,c3,c4,c5 = st.columns(5)
    dc = c1.selectbox("Date",   cs, key="xd")
    nc = c2.selectbox("Desc",   cs, key="xn")
    ac = c3.selectbox("Amount", cs, key="xa")
    db = c4.selectbox("Debit",  cs, key="xb")
    cr = c5.selectbox("Credit", cs, key="xc")

    if st.button("Extract"):
        rows = []
        for _, row in df_raw.iterrows():
            d = norm_date(row.get(dc) if dc!="—" else None)
            n = str(row.get(nc,"") or "").strip() if nc!="—" else ""
            if ac!="—": amt = norm_amount(row.get(ac))
            elif db!="—" and cr!="—":
                amt = (norm_amount(row.get(cr)) or 0) - (norm_amount(row.get(db)) or 0)
            else: amt = None
            if d and n and amt is not None:
                rows.append({"date":d,"description":n,"amount":amt,**categorize(n)})
        st.session_state["import_rows"] = rows
        st.success(f"Extracted {len(rows)} transactions.")

elif ext == "csv":
    df_raw = pd.read_csv(io.StringIO(uploaded.read().decode("utf-8","replace")))
    st.write("**Preview:**"); st.dataframe(df_raw.head(3))
    cs = ["—"] + list(df_raw.columns)
    c1,c2,c3,c4,c5 = st.columns(5)
    dc = c1.selectbox("Date",   cs, key="cd")
    nc = c2.selectbox("Desc",   cs, key="cn")
    ac = c3.selectbox("Amount", cs, key="ca")
    db = c4.selectbox("Debit",  cs, key="cb")
    cr = c5.selectbox("Credit", cs, key="cc")

    if st.button("Extract"):
        rows = []
        for _, row in df_raw.iterrows():
            d = norm_date(row.get(dc) if dc!="—" else None)
            n = str(row.get(nc,"") or "").strip() if nc!="—" else ""
            if ac!="—": amt = norm_amount(row.get(ac))
            elif db!="—" and cr!="—":
                amt = (norm_amount(row.get(cr)) or 0) - (norm_amount(row.get(db)) or 0)
            else: amt = None
            if d and n and amt is not None:
                rows.append({"date":d,"description":n,"amount":amt,**categorize(n)})
        st.session_state["import_rows"] = rows
        st.success(f"Extracted {len(rows)} transactions.")

elif ext == "pdf":
    st.info("Extracting from PDF (ICICI format)…")
    rows = parse_icici_pdf(uploaded.read())
    for r in rows: r.update(categorize(r["description"]))
    st.session_state["import_rows"] = rows
    st.success(f"Extracted {len(rows)} transactions.")

# ── Review + Import ───────────────────────────────────────────────────────────

if st.session_state.get("import_rows"):
    rows = st.session_state["import_rows"]
    st.subheader(f"Review {len(rows)} transactions")

    df_p = pd.DataFrame([{"Date":r["date"],"Description":r["description"][:55],
                           "Amount":float(r["amount"]),"Category":r["category"]} for r in rows])
    st.dataframe(df_p, use_container_width=True, hide_index=True)

    c1, c2 = st.columns(2)
    c1.metric("Total Spend",  fmt_inr(sum(abs(float(r["amount"])) for r in rows if float(r["amount"])<0)))
    c2.metric("Total Credit", fmt_inr(sum(float(r["amount"]) for r in rows if float(r["amount"])>0)))

    if st.button("✅ Import All", type="primary"):
        imp, skip = 0, 0
        for r in rows:
            h = hashlib.sha256(f"{r['date']}|{r['description']}|{r['amount']}".encode()).hexdigest()
            # Check for duplicate
            existing = select("transactions", dedup_hash=h)
            if existing:
                skip += 1; continue
            row = {
                "date": r["date"], "description": r["description"], "amount": float(r["amount"]),
                "account_name": account_name, "category": r["category"],
                "sub_category": r.get("sub_category"), "merchant_name": r.get("merchant_name"),
                "is_recurring": int(r.get("is_recurring", False)),
                "is_investment": int(r.get("is_investment", False)),
                "is_transfer": int(r.get("is_transfer", False)),
                "manually_corrected": 0, "dedup_hash": h,
            }
            result = insert("transactions", row)
            if result: imp += 1
            else: skip += 1

        st.success(f"✅ Imported **{imp}** | Skipped **{skip}** duplicates")
        st.session_state.pop("import_rows", None)
        st.cache_data.clear()
