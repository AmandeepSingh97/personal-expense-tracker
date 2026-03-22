"""Database helpers — Supabase HTTP client (no direct PostgreSQL connection needed).

Uses supabase-py which connects via HTTPS port 443 — works from any network.
Secrets required in .streamlit/secrets.toml:
  SUPABASE_URL = "https://[ref].supabase.co"
  SUPABASE_KEY = "eyJ..."  # anon public key
"""

import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def _client() -> Client:
    try:
        url = st.secrets["SUPABASE_URL"]
        key = st.secrets["SUPABASE_KEY"]
    except Exception:
        import os
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_KEY", "")

    if not url or not key:
        st.error(
            "**Supabase credentials not configured.**\n\n"
            "Go to your Streamlit Cloud app → ⋮ → **Settings → Secrets** and add:\n"
            "```toml\n"
            'SUPABASE_URL = "https://[ref].supabase.co"\n'
            'SUPABASE_KEY = "eyJ..."\n'
            "```\n"
            "Get these from Supabase → **Settings → API**."
        )
        st.stop()

    return create_client(url, key)


# ── SELECT helpers ────────────────────────────────────────────────────────────

def select(table: str, columns: str = "*", limit: int = None, **eq_filters) -> list:
    """Fetch rows from a table with optional equality filters."""
    q = _client().table(table).select(columns)
    for col, val in eq_filters.items():
        if val is not None:
            q = q.eq(col, val)
    if limit:
        q = q.limit(limit)
    return q.execute().data or []


def select_all(table: str, columns: str = "*") -> list:
    """Fetch all rows (up to 10,000)."""
    return _client().table(table).select(columns).execute().data or []


# ── WRITE helpers ─────────────────────────────────────────────────────────────

def insert(table: str, data: dict):
    """Insert a row. Returns inserted row or None."""
    result = _client().table(table).insert(data).execute()
    rows = result.data or []
    return rows[0] if rows else None


def upsert(table: str, data: dict, on_conflict: str = ""):
    """Upsert a row."""
    q = _client().table(table).upsert(data)
    if on_conflict:
        q = _client().table(table).upsert(data, on_conflict=on_conflict)
    return q.execute().data


def update(table: str, data: dict, **eq_filters):
    """Update rows matching eq_filters."""
    q = _client().table(table).update(data)
    for col, val in eq_filters.items():
        q = q.eq(col, val)
    return q.execute().data


def delete(table: str, **eq_filters):
    """Delete rows matching eq_filters."""
    q = _client().table(table).delete()
    for col, val in eq_filters.items():
        q = q.eq(col, val)
    return q.execute().data
