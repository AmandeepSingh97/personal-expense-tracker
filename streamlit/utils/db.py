"""Database helpers — thin wrapper around psycopg2 using Streamlit secrets."""

import streamlit as st
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager


def _dsn() -> str:
    try:
        return st.secrets["DATABASE_URL"]
    except Exception:
        import os
        return os.environ.get("DATABASE_URL", "")


@contextmanager
def _conn():
    """Open a connection, commit on success, rollback on error, always close."""
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
    """Run SELECT — returns list of dicts."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def query_one(sql: str, params: tuple = ()):
    """Run SELECT — returns first row or None."""
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()):
    """Run INSERT/UPDATE/DELETE — returns (rowcount, first_row_or_None)."""
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


def execute_many(sql: str, params_list: list[tuple]) -> int:
    """Run the same statement for multiple param sets."""
    with _conn() as conn:
        with conn.cursor() as cur:
            total = 0
            for params in params_list:
                cur.execute(sql, params)
                total += cur.rowcount
            return total
