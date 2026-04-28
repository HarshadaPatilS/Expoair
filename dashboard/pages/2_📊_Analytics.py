import streamlit as st
import pandas as pd
import random
from components.sidebar import render_sidebar
from components.source_chart import render_source_donut, render_aqi_timeline_3d

# Page Config
st.set_page_config(
    page_title="Analytics — ExpoAir",
    layout="wide",
    initial_sidebar_state="collapsed",
    page_icon="📊"
)

# Sidebar
city = render_sidebar()

st.title("📊 AQI Analytics & Source Apportionment")
st.markdown("---")

# 2 columns (source chart + timeline)
col_bot1, col_bot2 = st.columns(2)

with col_bot1:
    st.subheader("Source Apportionment")
    source_data = {"Vehicular": 62, "Industrial": 18, "Construction": 12, "Biomass": 8}
    render_source_donut(source_data)

with col_bot2:
    st.subheader("AQI Timeline")
    sources = ["Vehicular", "Industrial", "Construction", "Biomass", "Other"]
    hourly_data = []
    for h in range(24):
        hourly_data.append({
            "hour": h,
            "aqi": random.randint(50, 200),
            "source": random.choice(sources)
        })
    hourly_df = pd.DataFrame(hourly_data)
    render_aqi_timeline_3d(hourly_df)
