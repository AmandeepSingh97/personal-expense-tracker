"""Budget period logic — cycle runs 25th to 24th of next month."""

from datetime import date
from dateutil.relativedelta import relativedelta


# PostgreSQL CASE expression for grouping dates into budget periods
PERIOD_SQL = """CASE
    WHEN EXTRACT(DAY FROM {col}::date)::int >= 25
        THEN TO_CHAR({col}::date, 'YYYY-MM')
        ELSE TO_CHAR({col}::date - INTERVAL '1 month', 'YYYY-MM')
END"""


def period_expr(col: str = "date") -> str:
    return PERIOD_SQL.format(col=col)


def current_period() -> str:
    """Return the current budget period key (YYYY-MM)."""
    today = date.today()
    if today.day >= 25:
        return today.strftime("%Y-%m")
    return (today - relativedelta(months=1)).strftime("%Y-%m")


def period_range(key: str) -> tuple[str, str]:
    """Return (start_date, end_date) ISO strings for a period key."""
    year, month = map(int, key.split("-"))
    start = date(year, month, 25)
    end   = start + relativedelta(months=1) - relativedelta(days=1)
    return start.isoformat(), end.isoformat()


def period_label(key: str) -> str:
    """Human label: '25 Sep – 24 Oct '25'"""
    year, month = map(int, key.split("-"))
    start = date(year, month, 25)
    end   = start + relativedelta(months=1) - relativedelta(days=1)
    year_short = end.strftime("%y")
    return f"{start.strftime('%-d %b')} – {end.strftime('%-d %b')}" + f" '{year_short}"


def last_n_periods(n: int = 6) -> list[str]:
    """Return last N period keys, oldest first."""
    periods = []
    key = current_period()
    for _ in range(n):
        periods.insert(0, key)
        year, month = map(int, key.split("-"))
        prev = date(year, month, 1) - relativedelta(months=1)
        key  = prev.strftime("%Y-%m")
    return periods
