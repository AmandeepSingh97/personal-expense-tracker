"""Database helpers — psycopg2 wrapper using Streamlit secrets."""

import streamlit as st
import psycopg2
from psycopg2.extras import RealDictCursor
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
            "Go to your Streamlit Cloud app → ⋮ menu → **Settings → Secrets** and add:\n"
            "```\nDATABASE_URL = \"postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres\"\n```"
        )
        st.stop()

    # Ensure SSL for Supabase (non-localhost)
    if "localhost" not in url and "127.0.0.1" not in url:
        if "sslmode=" not in url:
            url += "?sslmode=require"

    return url


@contextmanager
def _conn():
    conn = psycopg2.connect(_dsn(), cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def query_one(sql: str, params: tuple = ()):
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()):
    """Returns (rowcount, first_row_or_None)."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = None
            try:
                row = cur.fetchone()
                row = dict(row) if row else None
            except Exception:
                pass
            return cur.rowcount, row


def execute_many(sql: str, params_list: list) -> int:
    with _conn() as conn:
        with conn.cursor() as cur:
            total = 0
            for params in params_list:
                cur.execute(sql, params)
                total += cur.rowcount
            return total
