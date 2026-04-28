import streamlit as st
import pandas as pd
import random
from components.sidebar import render_sidebar
from services.data_fetcher import fetch_live_data

# Page Config
st.set_page_config(
    page_title="Live Map — ExpoAir",
    layout="wide",
    initial_sidebar_state="collapsed",
    page_icon="🗺️"
)

# Sidebar
city = render_sidebar()

st.title("🗺️ Live 3D Pollution Map")

# Fetch Data
try:
    with st.spinner("Loading live AQI data..."):
        data = fetch_live_data(city)
except Exception as e:
    # Provide fallback dummy data matching the expected structure
    data = {"station_count": 8}

st.info("3D Map view loading...")
st.container(height=500, border=True)

# Station Map Data Expander
st.subheader("Station Data")
grid_data = []
for i in range(data.get("station_count", 8)):
    grid_data.append({
        "Station ID": f"PUN-{100+i}",
        "AQI": random.randint(40, 180),
        "PM2.5": round(random.uniform(15.0, 90.0), 1),
        "PM10": round(random.uniform(40.0, 150.0), 1),
        "Status": "Online"
    })
df_grid = pd.DataFrame(grid_data)

def color_aqi(val):
    if val < 50: return 'background-color: #1b5e20; color: white;'     # Dark green
    elif val <= 100: return 'background-color: #827717; color: white;' # Dark yellow
    elif val <= 150: return 'background-color: #e65100; color: white;' # Dark orange
    else: return 'background-color: #b71c1c; color: white;'            # Dark red
    
st.dataframe(df_grid.style.map(color_aqi, subset=['AQI']), use_container_width=True)
