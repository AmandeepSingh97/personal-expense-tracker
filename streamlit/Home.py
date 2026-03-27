"""Personal Expense Tracker — grouped navigation."""

import streamlit as st

st.set_page_config(
    page_title="Expense Tracker",
    page_icon="💰",
    layout="wide",
    initial_sidebar_state="expanded",
)

pg = st.navigation({
    "Main": [
        st.Page("pages/1_Dashboard.py",        title="Dashboard",       icon="📊", default=True),
        st.Page("pages/17_Quick_Add.py",        title="Quick Add",       icon="⚡"),
        st.Page("pages/2_Transactions.py",      title="Transactions",    icon="📋"),
        st.Page("pages/3_Add_Transaction.py",   title="Add Transaction", icon="➕"),
    ],
    "Money": [
        st.Page("pages/4_Budgets.py",           title="Budgets",         icon="💰"),
        st.Page("pages/5_Accounts.py",          title="Accounts",        icon="🏦"),
        st.Page("pages/6_Investments.py",       title="Investments",     icon="📈"),
        st.Page("pages/13_Goals.py",            title="Goals",           icon="🎯"),
    ],
    "Analysis": [
        st.Page("pages/9_Insights.py",          title="Insights",        icon="🔍"),
        st.Page("pages/10_Cash_Flow.py",        title="Cash Flow",       icon="💹"),
        st.Page("pages/8_Recurring.py",         title="Recurring",       icon="🔄"),
        st.Page("pages/12_Net_Worth.py",        title="Net Worth",       icon="💎"),
        st.Page("pages/11_Annual_Summary.py",   title="Annual Summary",  icon="📑"),
    ],
    "Tools": [
        st.Page("pages/7_Import.py",            title="Import",          icon="📥"),
        st.Page("pages/15_Shared.py",           title="Shared Expenses", icon="👫"),
        st.Page("pages/16_Split.py",            title="Split Transaction", icon="✂️"),
        st.Page("pages/14_Rules.py",            title="Category Rules",  icon="⚙️"),
    ],
})

pg.run()
