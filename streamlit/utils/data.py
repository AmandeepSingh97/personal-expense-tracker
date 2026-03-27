"""Data processing — fetch from Supabase, aggregate in Python/pandas."""

import streamlit as st
import pandas as pd
from datetime import datetime
from dateutil.relativedelta import relativedelta
from utils.db import select, select_all, exists
from utils.budget_period import current_period, last_n_periods, period_range


def _period(date_str: str) -> str:
    """Python equivalent of the SQL period CASE expression."""
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except Exception:
        return ""
    return d.strftime("%Y-%m") if d.day >= 25 else (d - relativedelta(months=1)).strftime("%Y-%m")


@st.cache_data(ttl=30)
def _all_transactions() -> pd.DataFrame:
    """Fetch all transactions once, cache for 30 s."""
    rows = select_all("transactions")
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["amount"]       = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
    df["is_transfer"]  = df["is_transfer"].astype(int)
    df["is_investment"]= df.get("is_investment", pd.Series(0, index=df.index)).astype(int)
    df["period"]       = df["date"].apply(_period)
    return df


def get_transactions(period: str = None, account_name: str = None,
                     include_transfers: bool = False) -> pd.DataFrame:
    df = _all_transactions()
    if df.empty:
        return df
    if not include_transfers:
        df = df[df["is_transfer"] == 0]
    if period:
        df = df[df["period"] == period]
    if account_name and account_name != "All":
        df = df[df["account_name"] == account_name]
    return df.reset_index(drop=True)


@st.cache_data(ttl=30)
def get_summary(period: str) -> dict:
    df = get_transactions(period=period)
    if df.empty:
        return {"spend": {}, "income": 0.0, "invest": 0.0}
    spend  = df[df["amount"] < 0].groupby("category")["amount"].apply(lambda x: abs(x.sum())).to_dict()
    income = float(df[df["amount"] > 0]["amount"].sum())
    invest = float(df[df["is_investment"] == 1]["amount"].apply(abs).sum())
    return {"spend": spend, "income": income, "invest": invest}


@st.cache_data(ttl=30)
def get_trend(n: int = 6) -> list:
    periods = last_n_periods(n)
    df = _all_transactions()
    if df.empty:
        return [{"period": p, "spent": 0.0, "income": 0.0} for p in periods]
    df = df[df["is_transfer"] == 0]
    result = []
    for p in periods:
        sub = df[df["period"] == p]
        result.append({
            "period": p,
            "spent":  float(sub[sub["amount"] < 0]["amount"].apply(abs).sum()),
            "income": float(sub[sub["amount"] > 0]["amount"].sum()),
        })
    return result


@st.cache_data(ttl=30)
def get_budgets_with_spend(period: str) -> list:
    budgets   = select_all("budgets")
    df        = get_transactions(period=period)
    spend_map = {} if df.empty else (
        df[df["amount"] < 0].groupby("category")["amount"].apply(lambda x: abs(x.sum())).to_dict()
    )
    result = []
    for b in budgets:
        cat   = b["category"]
        spent = float(spend_map.get(cat, 0))
        limit = float(b["monthly_limit"])
        pct   = int(spent / limit * 100) if limit > 0 else 0
        result.append({
            **b, "spent": spent, "pct": pct,
            "status": "exceeded" if pct >= 100 else "warning" if pct >= b["alert_threshold_pct"] else "ok",
        })
    return result


@st.cache_data(ttl=30)
def get_accounts_with_balance() -> list:
    accounts = select("accounts", is_active=1)
    if not accounts:
        return []
    # Only fetch once, filter in Python — avoids N account queries
    df_all = _all_transactions()
    result = []
    for a in accounts:
        sub = df_all[df_all["account_name"] == a["name"]] if not df_all.empty else pd.DataFrame()
        tx_total = float(sub["amount"].sum()) if not sub.empty else 0.0
        tx_count = len(sub)
        tags = a.get("tags") or []
        if isinstance(tags, str):
            import json
            try: tags = json.loads(tags)
            except: tags = []
        result.append({
            **a,
            "current_balance": round(float(a["opening_balance"]) + tx_total, 2),
            "tx_count": tx_count,
            "tags": tags,
        })
    return result


@st.cache_data(ttl=60)
def get_account_balance_history(n: int = 6) -> tuple:
    accounts = select("accounts", is_active=1)
    if not accounts:
        return [], []
    df_all  = _all_transactions()
    periods = last_n_periods(n)
    history = []
    for p in periods:
        _, end = period_range(p)
        row = {"period": p}
        for a in accounts:
            sub = df_all[df_all["account_name"] == a["name"]] if not df_all.empty else pd.DataFrame()
            tx_sum = float(sub[sub["date"] <= end]["amount"].sum()) if not sub.empty else 0.0
            row[a["name"]] = round(float(a["opening_balance"]) + tx_sum, 2)
        history.append(row)
    return accounts, history


@st.cache_data(ttl=60)
def get_investment_summary() -> dict:
    df = _all_transactions()
    if df.empty:
        return {"contributed": [], "returns": [], "monthly": [], "total_contributed": 0.0, "total_returns": 0.0}

    df["is_investment"] = df["is_investment"].astype(int)
    inv_out = df[(df["is_investment"] == 1) & (df["amount"] < 0) & (df["is_transfer"] == 0)]
    inv_in  = df[(df["is_investment"] == 1) & (df["amount"] > 0) & (df["is_transfer"] == 0)]

    # Income from investments
    sub_cat = df["sub_category"] if "sub_category" in df.columns else pd.Series("", index=df.index)
    income_inv = df[(df["category"] == "Income") & sub_cat.isin(["MSFT Dividend","NPS","Dividend","SGB Interest"])]

    contributed = (
        inv_out.groupby("category").agg(
            total=("amount", lambda x: round(abs(x.sum()), 2)),
            count=("amount", "count"),
            first_date=("date", "min"),
            last_date=("date", "max"),
        ).reset_index().to_dict("records")
    )

    returns_df = pd.concat([inv_in, income_inv]).drop_duplicates()
    returns = []
    if not returns_df.empty:
        keep = [c for c in ["category","description","amount","date"] if c in returns_df.columns]
        returns = returns_df[keep].to_dict("records")

    inv_out = inv_out.copy()
    inv_out["period"] = inv_out["date"].apply(_period)
    monthly = (
        inv_out.groupby("period").agg(
            contributed=("amount", lambda x: round(abs(x.sum()), 2)),
            count=("amount", "count"),
        ).reset_index().sort_values("period").to_dict("records")
    )

    return {
        "contributed": contributed,
        "returns": returns,
        "monthly": monthly,
        "total_contributed": float(inv_out["amount"].apply(abs).sum()),
        "total_returns": float(returns_df["amount"].apply(abs).sum()) if not returns_df.empty else 0.0,
    }
