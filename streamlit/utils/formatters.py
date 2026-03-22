"""Display helpers — INR formatting, date formatting, etc."""

from datetime import date, datetime


def fmt_inr(amount, show_sign: bool = False) -> str:
    """Format amount as Indian Rupees with lakh/crore abbreviation."""
    if amount is None:
        return "—"
    amount = float(amount)
    sign   = ""
    if show_sign:
        sign = "+" if amount >= 0 else "-"
    abs_amt = abs(amount)

    if abs_amt >= 1_00_00_000:   # 1 crore
        return f"{sign}₹{abs_amt/1_00_00_000:.2f}Cr"
    if abs_amt >= 1_00_000:       # 1 lakh
        return f"{sign}₹{abs_amt/1_00_000:.1f}L"
    return f"{sign}₹{abs_amt:,.0f}"


def fmt_date(d) -> str:
    if not d:
        return "—"
    if isinstance(d, (date, datetime)):
        return d.strftime("%d %b %Y")
    try:
        return datetime.strptime(str(d)[:10], "%Y-%m-%d").strftime("%d %b %Y")
    except Exception:
        return str(d)


def color_amount(amount) -> str:
    """Return green/red CSS color based on sign."""
    return "#10b981" if float(amount or 0) >= 0 else "#ef4444"
