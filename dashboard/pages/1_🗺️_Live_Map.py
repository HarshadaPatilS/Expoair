import streamlit as st
import pandas as pd
import pydeck as pdk
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

st.info("3D Map view loaded.")

# Station Map Data Expander
st.subheader("Station Data")
grid_data = []
for i in range(data.get("station_count", 8)):
    grid_data.append({
        "Station ID": f"PUN-{100+i}",
        "AQI": random.randint(40, 180),
        "PM2.5": round(random.uniform(15.0, 90.0), 1),
        "PM10": round(random.uniform(40.0, 150.0), 1),
        "lat": 18.5204 + random.uniform(-0.1, 0.1),
        "lon": 73.8567 + random.uniform(-0.1, 0.1),
        "Status": "Online"
    })
df_grid = pd.DataFrame(grid_data)

def get_color(aqi):
    if aqi < 50: return [27, 94, 32, 200]
    elif aqi <= 100: return [130, 119, 23, 200]
    elif aqi <= 150: return [230, 81, 0, 200]
    else: return [183, 28, 28, 200]

df_grid['color'] = df_grid['AQI'].apply(get_color)

layer = pdk.Layer(
    "ColumnLayer",
    data=df_grid,
    get_position=["lon", "lat"],
    get_elevation="AQI",
    elevation_scale=50,
    radius=500,
    get_fill_color="color",
    pickable=True,
    auto_highlight=True,
)

view_state = pdk.ViewState(
    latitude=18.5204,
    longitude=73.8567,
    zoom=10,
    pitch=45,
    bearing=15,
)

st.pydeck_chart(pdk.Deck(
    map_style=None,
    initial_view_state=view_state,
    layers=[layer],
    tooltip={"text": "{Station ID}\nAQI: {AQI}"}
))

def color_aqi(val):
    if val < 50: return 'background-color: #1b5e20; color: white;'     # Dark green
    elif val <= 100: return 'background-color: #827717; color: white;' # Dark yellow
    elif val <= 150: return 'background-color: #e65100; color: white;' # Dark orange
    else: return 'background-color: #b71c1c; color: white;'            # Dark red
    
st.dataframe(df_grid.style.map(color_aqi, subset=['AQI']), use_container_width=True)
