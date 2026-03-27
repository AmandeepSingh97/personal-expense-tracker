"""Category Rules Manager — view, add, test, and delete custom categorization rules."""

import re
import streamlit as st
import pandas as pd

from utils.db import select, insert, delete
from utils.categories import cat_emoji, get_all_category_options, CATEGORY_META
from utils.categorizer import categorize, RULES
from utils.formatters import fmt_inr

st.title("⚙️ Category Rules Manager")
st.caption("Manage custom categorization rules and test how descriptions get categorized.")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_custom_rules() -> list[dict]:
    """Fetch all rows from category_corrections, newest first."""
    rows = select("category_corrections")
    return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)


def _match_custom_rule(description: str, rules: list[dict]) -> dict | None:
    """Check description against custom DB rules. Returns first match or None."""
    for rule in rules:
        pattern = rule.get("description_pattern", "")
        try:
            if re.search(pattern, description, re.IGNORECASE):
                return rule
        except re.error:
            # Fall back to plain substring match if regex is invalid
            if pattern.lower() in description.lower():
                return rule
    return None


def _test_description(description: str, custom_rules: list[dict]) -> dict:
    """Test a description: custom rules first, then built-in categorizer."""
    if not description.strip():
        return {"source": None, "category": None, "sub_category": None, "rule_info": None}

    # 1. Check custom DB rules first (they take priority)
    match = _match_custom_rule(description, custom_rules)
    if match:
        return {
            "source": "custom",
            "category": match["correct_category"],
            "sub_category": match.get("correct_sub_category"),
            "rule_info": f"Pattern: `{match['description_pattern']}`",
        }

    # 2. Fall back to built-in categorizer
    result = categorize(description)
    if result["category"] != "Uncategorized":
        # Find which built-in rule matched
        matched_pattern = None
        for rule in RULES:
            if rule.pattern.search(description):
                matched_pattern = rule.pattern.pattern
                break
        return {
            "source": "built-in",
            "category": result["category"],
            "sub_category": result.get("sub_category"),
            "rule_info": f"Pattern: `{matched_pattern}`" if matched_pattern else None,
        }

    return {
        "source": "none",
        "category": "Uncategorized",
        "sub_category": None,
        "rule_info": "No rule matched",
    }


# ── Section 1: Test a Description ────────────────────────────────────────────

st.subheader("🔍 Test a Description")
st.caption("Type a transaction description to see which rule matches and what category it assigns.")

custom_rules = _load_custom_rules()

test_input = st.text_input(
    "Transaction description",
    placeholder="e.g. SWIGGY ORDER, Kotak Mutual Fund, NOZIR AHME...",
    key="test_desc",
)

if test_input.strip():
    result = _test_description(test_input, custom_rules)

    if result["source"] == "custom":
        cat = result["category"]
        sub = result["sub_category"]
        st.success(
            f"**Custom rule match** {cat_emoji(cat)} **{cat}**"
            + (f" / {sub}" if sub else "")
        )
        st.caption(result["rule_info"])

    elif result["source"] == "built-in":
        cat = result["category"]
        sub = result["sub_category"]
        st.info(
            f"**Built-in rule match** {cat_emoji(cat)} **{cat}**"
            + (f" / {sub}" if sub else "")
        )
        st.caption(result["rule_info"])

    else:
        st.warning("**No rule matched** — this description would be categorized as **Uncategorized**.")

st.divider()

# ── Section 2: Add New Rule ──────────────────────────────────────────────────

st.subheader("➕ Add Custom Rule")
st.caption("Custom rules are checked before built-in rules. Use regex or plain text patterns.")

all_categories = get_all_category_options()

with st.form("add_rule", clear_on_submit=True):
    c1, c2 = st.columns(2)

    new_pattern = c1.text_input(
        "Description pattern *",
        placeholder="e.g. swiggy|zomato or NEFT.*TO.*HDFC",
        help="Regex pattern or plain text. Matched case-insensitively against transaction descriptions.",
    )
    new_category = c2.selectbox(
        "Target category *",
        all_categories,
        format_func=lambda c: f"{cat_emoji(c)} {c}",
    )
    new_sub = c1.text_input(
        "Sub-category (optional)",
        placeholder="e.g. Food Delivery, Car Service",
    )

    # Validate pattern preview
    if new_pattern.strip():
        try:
            re.compile(new_pattern)
            c2.caption("Pattern is valid regex")
        except re.error as e:
            c2.caption(f"Invalid regex (will use as plain text): {e}")

    submitted = st.form_submit_button("Save Rule", type="primary", use_container_width=True)

if submitted:
    if not new_pattern.strip():
        st.error("Enter a description pattern.")
    elif not new_category:
        st.error("Select a target category.")
    else:
        data = {
            "description_pattern": new_pattern.strip(),
            "correct_category": new_category,
        }
        if new_sub.strip():
            data["correct_sub_category"] = new_sub.strip()

        result = insert("category_corrections", data)
        if result:
            st.success(
                f"Rule added: `{new_pattern.strip()}` "
                f"{cat_emoji(new_category)} **{new_category}**"
                + (f" / {new_sub.strip()}" if new_sub.strip() else "")
            )
            st.rerun()
        else:
            st.error("Could not save rule — check Supabase connection.")

st.divider()

# ── Section 3: Existing Custom Rules ─────────────────────────────────────────

st.subheader("📋 Custom Rules")

# Reload after potential insert
custom_rules = _load_custom_rules()

if not custom_rules:
    st.info("No custom rules yet. Add one above to override or supplement built-in categorization.")
else:
    st.caption(f"{len(custom_rules)} custom rule(s) — these take priority over built-in rules.")

    # Display as a table with delete buttons
    for rule in custom_rules:
        rid = rule["id"]
        cat = rule["correct_category"]
        sub = rule.get("correct_sub_category") or ""
        pat = rule["description_pattern"]
        created = rule.get("created_at", "")[:10] if rule.get("created_at") else ""

        col_pat, col_cat, col_sub, col_date, col_del = st.columns([3, 2, 2, 1.5, 0.8])

        col_pat.code(pat, language=None)
        col_cat.write(f"{cat_emoji(cat)} {cat}")
        col_sub.write(sub if sub else "—")
        col_date.caption(created)

        if col_del.button("🗑️", key=f"del_rule_{rid}", help=f"Delete rule: {pat}"):
            delete("category_corrections", id=rid)
            st.success(f"Deleted rule: `{pat}`")
            st.rerun()

st.divider()

# ── Section 4: Built-in Rules Reference ──────────────────────────────────────

st.subheader("📖 Built-in Rules Reference")

with st.expander("View all built-in rules (read-only)", expanded=False):
    st.caption(
        f"{len(RULES)} built-in rules from `categorizer.py`. "
        "These cannot be edited here — add a custom rule above to override them."
    )

    builtin_data = []
    for rule in RULES:
        builtin_data.append({
            "Pattern": rule.pattern.pattern,
            "Category": f"{cat_emoji(rule.category)} {rule.category}",
            "Sub-category": rule.sub or "—",
            "Merchant": rule.merchant or "—",
            "Recurring": "Yes" if rule.recurring else "",
            "Investment": "Yes" if rule.is_investment else "",
            "Transfer": "Yes" if rule.is_transfer else "",
        })

    df = pd.DataFrame(builtin_data)
    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Pattern": st.column_config.TextColumn("Pattern", width="medium"),
            "Category": st.column_config.TextColumn("Category", width="medium"),
            "Sub-category": st.column_config.TextColumn("Sub-category", width="small"),
            "Merchant": st.column_config.TextColumn("Merchant", width="small"),
            "Recurring": st.column_config.TextColumn("Recurring", width="small"),
            "Investment": st.column_config.TextColumn("Investment", width="small"),
            "Transfer": st.column_config.TextColumn("Transfer", width="small"),
        },
    )
