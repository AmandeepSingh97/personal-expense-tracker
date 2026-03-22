"""Data processing helpers — fetch from Supabase, aggregate in Python/pandas.

All complex SQL aggregations (GROUP BY, CASE WHEN period, SUM...) are replaced
with pandas operations on fetched data. Fast enough for personal-scale data.
"""

import streamlit as st
import pandas as pd
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from utils.db import select, select_all
from utils.budget_period import current_period, last_n_periods, period_range


def _get_period(date_str: str) -> str:
    """Python equivalent of the SQL CASE WHEN period expression."""
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except Exception:
        return ""
    return d.strftime("%Y-%m") if d.day >= 25 else (d - relativedelta(months=1)).strftime("%Y-%m")


@st.cache_data(ttl=30)
def get_transactions(period: str = None, account_name: str = None,
                     include_transfers: bool = False, limit: int = 2000) -> pd.DataFrame:
    """Fetch transactions, add period column, return DataFrame."""
    rows = select("transactions", limit=limit)
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["amount"]      = df["amount"].astype(float)
    df["period"]      = df["date"].apply(_get_period)
    df["is_transfer"] = df["is_transfer"].astype(int)
    df["is_investment"] = df.get("is_investment", pd.Series(0, index=df.index)).astype(int)

    if not include_transfers:
        df = df[df["is_transfer"] == 0]
    if period:
        df = df[df["period"] == period]
    if account_name and account_name != "All":
        df = df[df["account_name"] == account_name]

    return df.reset_index(drop=True)


@st.cache_data(ttl=30)
def get_summary(period: str) -> dict:
    """Spending and income totals per category for a period."""
    df = get_transactions(period=period)
    if df.empty:
        return {"spend": {}, "income": 0, "invest": 0}

    spend  = df[df["amount"] < 0].groupby("category")["amount"].apply(lambda x: abs(x.sum())).to_dict()
    income = df[df["amount"] > 0]["amount"].sum()
    invest = df[df["is_investment"] == 1]["amount"].apply(abs).sum()
    return {"spend": spend, "income": float(income), "invest": float(invest)}


@st.cache_data(ttl=30)
def get_trend(n: int = 6) -> list:
    """Spend + income totals per budget period, last N periods."""
    periods = last_n_periods(n)
    df = get_transactions()
    if df.empty:
        return []

    df = df[df["period"].isin(periods)]
    result = []
    for p in periods:
        sub = df[df["period"] == p]
        result.append({
            "period":  p,
            "spent":   float(sub[sub["amount"] < 0]["amount"].apply(abs).sum()),
            "income":  float(sub[sub["amount"] > 0]["amount"].sum()),
        })
    return result


@st.cache_data(ttl=30)
def get_budgets_with_spend(period: str) -> list:
    """Budget rows enriched with current-period spend."""
    budgets = select_all("budgets")
    df = get_transactions(period=period)
    spend_map = {}
    if not df.empty:
        spend_map = df[df["amount"] < 0].groupby("category")["amount"].apply(lambda x: abs(x.sum())).to_dict()

    result = []
    for b in budgets:
        cat   = b["category"]
        spent = float(spend_map.get(cat, 0))
        limit = float(b["monthly_limit"])
        pct   = int(spent / limit * 100) if limit > 0 else 0
        result.append({**b, "spent": spent, "pct": pct,
                        "status": "exceeded" if pct >= 100 else "warning" if pct >= b["alert_threshold_pct"] else "ok"})
    return result


@st.cache_data(ttl=30)
def get_accounts_with_balance() -> list:
    """Accounts enriched with current balance and tx count."""
    accounts = select("accounts", is_active=1)
    df_all   = pd.DataFrame(select("transactions")) if select("transactions") else pd.DataFrame()

    result = []
    for a in accounts:
        if not df_all.empty:
            sub = df_all[df_all["account_name"] == a["name"]]
            tx_total = sub["amount"].astype(float).sum() if not sub.empty else 0
            tx_count = len(sub)
        else:
            tx_total, tx_count = 0, 0

        bal = round(float(a["opening_balance"]) + float(tx_total), 2)
        tags = a.get("tags") or []
        if isinstance(tags, str):
            import json
            try: tags = json.loads(tags)
            except: tags = []
        result.append({**a, "current_balance": bal, "tx_count": tx_count, "tags": tags})

    return result


@st.cache_data(ttl=60)
def get_account_balance_history(n: int = 6) -> tuple:
    """Returns (accounts_meta, history_rows) for the balance trend chart."""
    accounts = select("accounts", is_active=1)
    if not accounts:
        return [], []

    df_all = pd.DataFrame(select("transactions"))
    periods = last_n_periods(n)
    history = []

    for p in periods:
        _, end = period_range(p)
        row = {"period": p}
        for a in accounts:
            sub = df_all[df_all["account_name"] == a["name"]] if not df_all.empty else pd.DataFrame()
            if not sub.empty:
                sub = sub[sub["date"] <= end]
                tx_sum = sub["amount"].astype(float).sum()
            else:
                tx_sum = 0
            row[a["name"]] = round(float(a["opening_balance"]) + float(tx_sum), 2)
        history.append(row)

    return accounts, history


@st.cache_data(ttl=60)
def get_investment_summary() -> dict:
    """Cumulative investment totals."""
    rows = select("transactions")
    if not rows:
        return {"contributed": [], "returns": [], "monthly": [], "total_contributed": 0, "total_returns": 0}

    df = pd.DataFrame(rows)
    df["amount"]      = df["amount"].astype(float)
    df["is_investment"] = df.get("is_investment", pd.Series(0)).astype(int)
    df["is_transfer"]   = df["is_transfer"].astype(int)

    inv_out = df[(df["is_investment"] == 1) & (df["amount"] < 0) & (df["is_transfer"] == 0)]
    inv_in  = df[(df["is_investment"] == 1) & (df["amount"] > 0)]
    # Also income from investments (dividends etc.)
    income_inv = df[(df["category"] == "Income") & (df.get("sub_category", pd.Series("")) .isin(["MSFT Dividend", "NPS", "Dividend", "SGB Interest"]))] if "sub_category" in df.columns else pd.DataFrame()

    contributed = inv_out.groupby("category").agg(
        total=("amount", lambda x: round(abs(x.sum()), 2)),
        count=("amount", "count"),
        first_date=("date", "min"),
        last_date=("date", "max"),
    ).reset_index().to_dict("records")

    returns_df = pd.concat([inv_in, income_inv]).drop_duplicates()
    returns = returns_df[["category", "description", "amount", "date"]].to_dict("records") if not returns_df.empty else []

    inv_out["period"] = inv_out["date"].apply(_get_period)
    monthly = inv_out.groupby("period").agg(
        contributed=("amount", lambda x: round(abs(x.sum()), 2)),
        count=("amount", "count"),
    ).reset_index().sort_values("period").to_dict("records")

    total_contributed = float(inv_out["amount"].apply(abs).sum())
    total_returns     = float(returns_df["amount"].apply(abs).sum()) if not returns_df.empty else 0.0

    return {
        "contributed": contributed, "returns": returns, "monthly": monthly,
        "total_contributed": total_contributed, "total_returns": total_returns,
    }
