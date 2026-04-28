import streamlit as st
from datetime import date

def render_sidebar():
    with st.sidebar:
        st.title("Controls")
        
        # We use a key so the state persists across pages
        city = st.selectbox("City", ["Pune", "Mumbai", "Delhi"], key="global_city")
        
        date_range = st.date_input(
            "Date Range",
            value=(date.today(), date.today()),
            key="global_date_range"
        )
        
        if st.button("Refresh", type="primary", use_container_width=True):
            with st.spinner("Refreshing data..."):
                import time
                time.sleep(1)
                
        st.markdown("---")
        st.caption("Data source: OpenAQ + Open-Meteo (live)")
        
        return city
