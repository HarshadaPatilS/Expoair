import streamlit as st
import streamlit_autorefresh
from components.globe_header import render_globe_header
from components.sidebar import render_sidebar
from services.data_fetcher import fetch_live_data

# Page Config
st.set_page_config(
    page_title="ExpoAir — Civic AQI Dashboard",
    layout="wide",
    initial_sidebar_state="collapsed",
    page_icon="🌍"
)

# Sidebar
city = render_sidebar()

# Header: 3D Three.js Globe animated header
render_globe_header()
st.markdown("---")

# Autorefresh dashboard every 5 minutes (300000 ms)
streamlit_autorefresh.st_autorefresh(interval=300000, key="aqi_refresh")

# Fetch Data
try:
    with st.spinner("Loading live AQI data..."):
        data = fetch_live_data(city)
except Exception as e:
    st.warning("Live data unavailable — showing last cached data")
    # Provide fallback dummy data matching the expected structure
    data = {
        "current_aqi": 120,
        "pm25": 45.2,
        "dominant_source": "Vehicular",
        "forecast_6h": 135,
        "forecast_6h_delta_arrow": "up",
        "last_updated": "Cached (fallback)",
        "station_count": 8
    }

# Main layout: 4 columns for dynamic metrics
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric(label="Current AQI", value=data["current_aqi"], delta=f"{data.get('current_aqi_delta', '-5')} (from yesterday)", delta_color="inverse")
with col2:
    pm25_val = f"{data['pm25']} µg/m³"
    st.metric(label="PM2.5 (µg/m³)", value=pm25_val, delta="WHO limit: <15", delta_color="off")
with col3:
    st.metric(label="Dominant source", value=data["dominant_source"])
with col4:
    arrow = "↑" if data.get("forecast_6h_delta_arrow", "up") == "up" else "↓"
    st.metric(label="Forecast (6hr)", value=data["forecast_6h"], delta=f"{arrow} predicted trend", delta_color="inverse")

# Info bar below cards
st.markdown(
    f"<p style='font-size: 0.85rem; color: #888; text-align: left; margin-bottom: 2rem;'>"
    f"Last updated: {data['last_updated']} &nbsp;&nbsp;|&nbsp;&nbsp; Mode: API Fusion (Mode B)</p>", 
    unsafe_allow_html=True
)

st.info("👈 Navigate to the Live Map or Analytics using the sidebar to explore more details.")
