"""Import — upload CSV/Excel/PDF with smart categorization."""

import streamlit as st
import pandas as pd
import pdfplumber
import io, hashlib, re
from datetime import datetime

from utils.db import select, insert, select_all
from utils.categorizer import categorize
from utils.categories import ALL_BUDGET_CATEGORIES, cat_emoji, get_category_links, create_mirror_transaction
from utils.formatters import fmt_inr

st.set_page_config(page_title="Import", page_icon="📥", layout="wide")
st.title("📥 Import Transactions")

# ── Joint expense splitter ────────────────────────────────────────────────────

JOINT_PATTERNS = [r"Jointexp", r"MonthExp", r"ExpenseOct", r"ExpenseDec",
                   r"ExpenseJan", r"ExpenseSep", r"ExpenseFeb", r"Rentplusexp"]

PREET_PATTERNS = [r"PreetPersonal\w*", r"Preetpers\w*"]
PREET_SPLIT    = [("Preet Badminton", 3000), ("Preet Beauty Products", 2000), ("Personal Expenses", 10000)]
PREET_TOTAL    = sum(a for _, a in PREET_SPLIT)   # 15,000

BASE_SPLIT = [
    ("Rent",        45000), ("Electricity", 1000),
    ("Cylinder",      500), ("Groceries",  10000),
    ("Petrol",       5000), ("Outing",      8000),
]
MAID_COOK  = [("Maid", 3000), ("Cook", 3500)]
BASE_TOTAL = sum(a for _, a in BASE_SPLIT)       # 69,500
FULL_TOTAL = BASE_TOTAL + sum(a for _, a in MAID_COOK)  # 76,000

def is_joint(desc: str) -> bool:
    return any(re.search(p, desc, re.I) for p in JOINT_PATTERNS)

def is_preet(desc: str) -> bool:
    return any(re.search(p, desc, re.I) for p in PREET_PATTERNS)

def split_preet(row: dict) -> list:
    return [
        {**row, "amount": -amt, "category": cat,
         "description": f"[{cat}] {row['description'][:50]}", "manually_corrected": 1}
        for cat, amt in PREET_SPLIT
    ]

def split_joint(row: dict) -> list:
    total = abs(float(row["amount"]))
    splits = BASE_SPLIT + MAID_COOK if abs(total - FULL_TOTAL) <= 200 else BASE_SPLIT
    return [
        {**row, "amount": -amt, "category": cat,
         "description": f"[{cat}] {row['description'][:50]}",
         "manually_corrected": 1}
        for cat, amt in splits
    ]

# ── Parsing helpers ───────────────────────────────────────────────────────────

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

def parse_icici_pdf(file_bytes: bytes) -> list:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)

    skip     = re.compile(r"^(S No\.|Transaction|Cheque|Withdrawal|Deposit|Balance|www\.|Please|Never|Dial|BRANCH|Statement|Sincerely|Legends)", re.I)
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

def build_rows(raw_rows: list) -> list:
    """Apply categorization, joint-expense splitting, and Preet Personal splitting."""
    result = []
    for r in raw_rows:
        if is_joint(r["description"]):
            result.extend(split_joint(r))
        elif is_preet(r["description"]):
            result.extend(split_preet(r))
        else:
            c = categorize(r["description"])
            result.append({**r, **c, "manually_corrected": 0})
    return result

# ── UI ─────────────────────────────────────────────────────────────────────────

accounts     = select("accounts", is_active=1)
acct_names   = [a["name"] for a in accounts] or ["Manual"]
account_name = st.selectbox("Import to account", acct_names)
uploaded     = st.file_uploader("Upload CSV, Excel or PDF", type=["csv","xlsx","xls","pdf"])

if not uploaded:
    st.info("Supported formats: ICICI PDF, any CSV or Excel with Date / Description / Debit / Credit columns.")
    st.stop()

ext = uploaded.name.lower().rsplit(".", 1)[-1]

# ── Parse ─────────────────────────────────────────────────────────────────────

raw_rows = []

if ext in ("xlsx", "xls"):
    df_raw = pd.read_excel(uploaded)
    st.write("**Preview:**"); st.dataframe(df_raw.head(3))
    cs = ["—"] + list(df_raw.columns)
    c1,c2,c3,c4,c5 = st.columns(5)
    dc = c1.selectbox("Date",   cs, key="xd")
    nc = c2.selectbox("Desc",   cs, key="xn")
    ac = c3.selectbox("Amount", cs, key="xa")
    db = c4.selectbox("Debit",  cs, key="xb")
    cr = c5.selectbox("Credit", cs, key="xc")
    if st.button("Extract & categorize"):
        for _, row in df_raw.iterrows():
            d = norm_date(row.get(dc) if dc != "—" else None)
            n = str(row.get(nc,"") or "").strip() if nc != "—" else ""
            if ac != "—": amt = norm_amount(row.get(ac))
            elif db != "—" and cr != "—":
                amt = (norm_amount(row.get(cr)) or 0) - (norm_amount(row.get(db)) or 0)
            else: amt = None
            if d and n and amt is not None:
                raw_rows.append({"date": d, "description": n, "amount": amt})
        st.session_state["import_rows"] = build_rows(raw_rows)

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
    if st.button("Extract & categorize"):
        for _, row in df_raw.iterrows():
            d = norm_date(row.get(dc) if dc != "—" else None)
            n = str(row.get(nc,"") or "").strip() if nc != "—" else ""
            if ac != "—": amt = norm_amount(row.get(ac))
            elif db != "—" and cr != "—":
                amt = (norm_amount(row.get(cr)) or 0) - (norm_amount(row.get(db)) or 0)
            else: amt = None
            if d and n and amt is not None:
                raw_rows.append({"date": d, "description": n, "amount": amt})
        st.session_state["import_rows"] = build_rows(raw_rows)

elif ext == "pdf":
    st.info("Detecting transactions from ICICI PDF…")
    raw_rows = parse_icici_pdf(uploaded.read())
    st.session_state["import_rows"] = build_rows(raw_rows)
    if raw_rows:
        st.success(f"Extracted {len(raw_rows)} raw transactions → {len(st.session_state['import_rows'])} after splitting joint expenses.")

# ── Review + Import ───────────────────────────────────────────────────────────

if st.session_state.get("import_rows"):
    rows = st.session_state["import_rows"]

    # Summary by category
    cat_counts = {}
    for r in rows:
        c = r.get("category","Uncategorized")
        cat_counts[c] = cat_counts.get(c,0) + 1

    st.subheader(f"📋 {len(rows)} transactions ready to import")

    # Stats row
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total",       len(rows))
    c2.metric("Spend",       fmt_inr(sum(abs(float(r["amount"])) for r in rows if float(r["amount"]) < 0)))
    c3.metric("Income",      fmt_inr(sum(float(r["amount"]) for r in rows if float(r["amount"]) > 0)))
    c4.metric("Uncategorized", cat_counts.get("Uncategorized",0))

    # Category breakdown
    with st.expander("Category breakdown", expanded=True):
        cats_sorted = sorted(cat_counts.items(), key=lambda x: -x[1])
        for cat, cnt in cats_sorted:
            st.markdown(f"{cat_emoji(cat)} **{cat}** — {cnt} transactions")

    # Full preview
    with st.expander("View all transactions"):
        df_p = pd.DataFrame([{
            "Date": r["date"], "Description": r["description"][:55],
            "Amount": float(r["amount"]), "Category": r.get("category","?"),
        } for r in rows])
        st.dataframe(df_p, use_container_width=True, hide_index=True)

    if st.button("✅ Import All", type="primary", use_container_width=True):
        imp = skip = mirrors = 0
        # Fetch ALL existing hashes in ONE call — avoids N separate API calls
        existing_hashes = {
            r["dedup_hash"] for r in select_all("transactions", columns="dedup_hash")
            if r.get("dedup_hash")
        }
        # Pre-fetch category→account links once for the whole batch
        links = get_category_links()
        progress = st.progress(0)
        for i, r in enumerate(rows):
            h = hashlib.sha256(f"{r['date']}|{r['description']}|{r['amount']}|{account_name}".encode()).hexdigest()
            if h in existing_hashes:
                skip += 1
            else:
                existing_hashes.add(h)   # prevent in-batch duplicates
                tx_row = {
                    "date": r["date"], "description": r["description"],
                    "amount": float(r["amount"]), "account_name": account_name,
                    "category": r.get("category"), "sub_category": r.get("sub_category"),
                    "merchant_name": r.get("merchant_name"),
                    "is_recurring":  int(r.get("is_recurring",  False)),
                    "is_investment": int(r.get("is_investment", False)),
                    "is_transfer":   int(r.get("is_transfer",   False)),
                    "manually_corrected": int(r.get("manually_corrected", 0)),
                    "dedup_hash": h,
                }
                insert("transactions", tx_row)
                imp += 1
                # Auto-mirror to linked account if configured
                if create_mirror_transaction({**tx_row, "account_name": account_name}, links):
                    mirrors += 1
            progress.progress((i + 1) / len(rows))

        msg = f"✅ Imported **{imp}** transactions. Skipped **{skip}** duplicates."
        if mirrors:
            msg += f" Created **{mirrors}** mirror transactions in linked accounts."
        st.success(msg)
        st.session_state.pop("import_rows", None)
        st.cache_data.clear()
