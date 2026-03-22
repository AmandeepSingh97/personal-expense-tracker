"""Database helpers — Supabase HTTP client (HTTPS port 443, works everywhere).

Secrets in .streamlit/secrets.toml:
  SUPABASE_URL = "https://[ref].supabase.co"
  SUPABASE_KEY = "eyJ..."   # anon public key from Supabase → Settings → API
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


# ── SELECT ────────────────────────────────────────────────────────────────────

def select(table: str, columns: str = "*", limit: int = None, **eq_filters) -> list:
    """Fetch rows with optional equality filters."""
    q = _client().table(table).select(columns)
    for col, val in eq_filters.items():
        if val is not None:
            q = q.eq(col, val)
    if limit:
        q = q.limit(limit)
    return q.execute().data or []


def select_all(table: str, columns: str = "*") -> list:
    """Fetch ALL rows, handling Supabase's 1000-row page limit."""
    all_rows, page_size, offset = [], 1000, 0
    while True:
        rows = (_client().table(table).select(columns)
                .range(offset, offset + page_size - 1).execute().data or [])
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


# ── WRITE ─────────────────────────────────────────────────────────────────────

def insert(table: str, data: dict):
    """Insert one row. Returns the inserted row dict or None."""
    rows = _client().table(table).insert(data).execute().data or []
    return rows[0] if rows else None


def insert_many(table: str, rows: list) -> int:
    """Bulk-insert a list of dicts. Returns number inserted."""
    if not rows:
        return 0
    result = _client().table(table).insert(rows).execute().data or []
    return len(result)


def upsert(table: str, data: dict, on_conflict: str = ""):
    """Upsert one row. on_conflict is the unique column name(s)."""
    # Fix: build ONE query, not two
    if on_conflict:
        return _client().table(table).upsert(data, on_conflict=on_conflict).execute().data
    return _client().table(table).upsert(data).execute().data


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


def exists(table: str, **eq_filters) -> bool:
    """Return True if at least one row matches."""
    return len(select(table, columns="id", limit=1, **eq_filters)) > 0
