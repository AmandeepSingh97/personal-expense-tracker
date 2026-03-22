"""Database helpers — psycopg v3 wrapper using Streamlit secrets."""

import streamlit as st
import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager


def _dsn() -> str:
    """Get DATABASE_URL from Streamlit secrets or environment."""
    try:
        url = st.secrets["DATABASE_URL"]
    except Exception:
        import os
        url = os.environ.get("DATABASE_URL", "")

    if not url:
        st.error(
            "**DATABASE_URL not configured.**\n\n"
            "Go to your Streamlit Cloud app → ⋮ → **Settings → Secrets** and add:\n"
            "```toml\nDATABASE_URL = \"postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres\"\n```"
        )
        st.stop()

    return url


@contextmanager
def _conn():
    """Open a connection, commit on success, rollback on error."""
    with psycopg.connect(_dsn(), row_factory=dict_row) as conn:
        yield conn


def query(sql: str, params: tuple = ()) -> list:
    """Run SELECT — returns list of dicts."""
    with _conn() as conn:
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: tuple = ()):
    """Run SELECT — returns first row dict or None."""
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()):
    """Run INSERT/UPDATE/DELETE — returns (rowcount, first_row_or_None)."""
    with _conn() as conn:
        cur = conn.execute(sql, params)
        row = None
        try:
            row = cur.fetchone()
        except Exception:
            pass
        return cur.rowcount, row


def execute_many(sql: str, params_list: list) -> int:
    with _conn() as conn:
        total = 0
        for params in params_list:
            cur = conn.execute(sql, params)
            total += cur.rowcount
        return total
