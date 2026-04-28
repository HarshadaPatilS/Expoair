import streamlit as st
import pandas as pd
import pydeck as pdk

def render_3d_aqi_map(df: pd.DataFrame):
    """
    Renders a 3D pydeck map for AQI data.
    DataFrame must have columns: lat, lng, aqi, source_label, pm25
    """
    
    # 1. HexagonLayer (3D extruded hexagonal bins)
    layer_hex = pdk.Layer(
        "HexagonLayer",
        data=df,
        get_position=["lng", "lat"],
        get_elevation_weight="aqi",
        elevation_scale=50,
        radius=300,
        elevation_range=[0, 1500],
        extruded=True,
        pickable=True,
        color_range=[
            [0, 128, 0],         # Good
            [255, 255, 0],       # Moderate
            [255, 165, 0],       # Poor
            [255, 69, 0],        # Unhealthy
            [139, 0, 0],         # Severe
            [75, 0, 130]         # Hazardous
        ]
    )

    # 2. ScatterplotLayer (sensor reading dots)
    layer_scatter = pdk.Layer(
        "ScatterplotLayer",
        data=df,
        get_position=["lng", "lat"],
        get_radius=100,
        get_fill_color=[255, 100, 0, 160],
        pickable=True
    )

    # 3. ViewState (Initial view focused on Pune)
    view_state = pdk.ViewState(
        latitude=18.52,
        longitude=73.86,
        zoom=12,
        pitch=55,
        bearing=-20
    )

    # 4. Map configuration & rendering
    tooltip = {"html": "<b>{elevationValue}</b><br/>AQI in this zone"}
    deck = pdk.Deck(
        layers=[layer_hex, layer_scatter],
        initial_view_state=view_state,
        map_style="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        tooltip=tooltip
    )

    st.pydeck_chart(deck, use_container_width=True, height=520)

    # 5. Color Legend (HTML badges)
    st.markdown(
        """
        <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; margin-top: 5px; font-size: 13px; color: #e0e0e0;">
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(0,128,0); margin-right: 6px; border-radius: 3px;"></span> Good (<50)</div>
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(255,255,0); margin-right: 6px; border-radius: 3px;"></span> Moderate (51-100)</div>
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(255,165,0); margin-right: 6px; border-radius: 3px;"></span> Poor (101-200)</div>
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(255,69,0); margin-right: 6px; border-radius: 3px;"></span> Unhealthy (201-300)</div>
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(139,0,0); margin-right: 6px; border-radius: 3px;"></span> Severe (301-400)</div>
            <div style="display: flex; align-items: center;"><span style="display: inline-block; width: 14px; height: 14px; background: rgb(75,0,130); margin-right: 6px; border-radius: 3px;"></span> Hazardous (>400)</div>
        </div>
        """,
        unsafe_allow_html=True
    )
