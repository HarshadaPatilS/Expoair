import streamlit as st
import pandas as pd
import pydeck as pdk
import networkx as nx
import osmnx as ox
import numpy as np
from scipy.spatial import KDTree

@st.cache_resource(show_spinner="Loading Pune Street Network (this happens only once)...")
def get_pune_network():
    """Fetches and caches the walking network graph for Pune via OSMnx."""
    return ox.graph_from_place("Pune, Maharashtra, India", network_type="walk")

def assign_aqi_weights(G, aqi_grid_df):
    """
    Rapidly assigns AQI weights to network edges based on nearest neighbor in aqi_grid_df.
    We convert lat/lng to radians for spatial KDTree nearest-lookup.
    """
    # Build KDTree from AQI grid
    grid_coords = aqi_grid_df[['lat', 'lng']].values
    tree = KDTree(grid_coords)
    
    # Iterate over multi-graph edges
    for u, v, k, data in G.edges(keys=True, data=True):
        if 'geometry' in data:
            mid_lon, mid_lat = data['geometry'].centroid.x, data['geometry'].centroid.y
        else:
            mid_lon = (G.nodes[u]['x'] + G.nodes[v]['x']) / 2.0
            mid_lat = (G.nodes[u]['y'] + G.nodes[v]['y']) / 2.0
            
        edge_coord = np.array([[mid_lat, mid_lon]])
        dist, idx = tree.query(edge_coord)
        
        # Get AQI value directly
        aqi_val = aqi_grid_df.iloc[idx[0]]['aqi']
        # Distance inherently calculated by OSMnx in meters
        length = data.get('length', 1.0)
        
        data['aqi'] = aqi_val
        data['aqi_weight'] = aqi_val * length

def get_route_stats(G, route_nodes):
    total_length = 0
    total_aqi_exposure = 0
    
    for i in range(len(route_nodes)-1):
        u = route_nodes[i]
        v = route_nodes[i+1]
        
        # OSMnx yields MultiDigraph, we select the shortest edge between u, v
        edge_data = min(G.get_edge_data(u, v).values(), key=lambda d: d.get('length', float('inf')))
        length = edge_data.get('length', 0)
        aqi = edge_data.get('aqi', 50)
        
        total_length += length
        total_aqi_exposure += (length * aqi)
        
    # Assume average walking speed is 5 km/h, which is ~83.33 meters/min
    time_min = total_length / 83.33
    avg_aqi = (total_aqi_exposure / total_length) if total_length > 0 else 0
    
    return {
        "length_km": total_length / 1000.0,
        "time_min": time_min,
        "avg_aqi": avg_aqi
    }

def route_to_path(G, route_nodes):
    """Extract lat/lng list from route nodes for Pydeck mapping."""
    path = []
    for node in route_nodes:
        x = G.nodes[node]['x']
        y = G.nodes[node]['y']
        path.append([x, y])
    return path

def render_route_comparison(origin: dict, destination: dict, aqi_grid_df: pd.DataFrame):
    """
    Main component to run routing operations and visualize the comparison 
    between distance-optimal maps and AQI-optimal paths.
    """
    G = get_pune_network()
    
    # Check if aqi_grid is valid
    if aqi_grid_df.empty:
        st.warning("AQI Grid is empty. Cannot compute cleanest route.")
        return
        
    assign_aqi_weights(G, aqi_grid_df)
    
    # Map points to nearest nodes on the graph
    origin_node = ox.distance.nearest_nodes(G, origin['lng'], origin['lat'])
    dest_node = ox.distance.nearest_nodes(G, destination['lng'], destination['lat'])
    
    # Extract Paths
    try:
        fastest_route = nx.shortest_path(G, origin_node, dest_node, weight="length")
        cleanest_route = nx.shortest_path(G, origin_node, dest_node, weight="aqi_weight")
    except nx.NetworkXNoPath:
        st.error("No valid walking path found between points.")
        return

    # Aggregate Statistics
    fast_stats = get_route_stats(G, fastest_route)
    clean_stats = get_route_stats(G, cleanest_route)
    
    path_data = [
        {
            "name": "Fastest Route",
            "color": [255, 165, 0, 180], # Orange
            "path": route_to_path(G, fastest_route),
            "width": 4
        },
        {
            "name": "Cleanest Route",
            "color": [29, 158, 117, 220], # Teal
            "path": route_to_path(G, cleanest_route),
            "width": 6
        }
    ]

    labels_data = [
        {"text": "Start", "position": [origin['lng'], origin['lat']]},
        {"text": "End", "position": [destination['lng'], destination['lat']]}
    ]
    
    # Map visual layers
    path_layer = pdk.Layer(
        "PathLayer",
        data=path_data,
        get_path="path",
        get_color="color",
        width_scale=5,
        width_min_pixels=3,
        get_width="width",
        pickable=True
    )
    
    text_layer = pdk.Layer(
        "TextLayer",
        data=labels_data,
        get_position="position",
        get_text="text",
        get_size=18,
        get_color=[255, 255, 255],
        get_alignment_baseline="'bottom'",
        font_family="Inter",
        background=True,
        get_background_color=[10, 10, 10, 200] # Semi-transparent black outline
    )
    
    view_state = pdk.ViewState(
        latitude=(origin['lat'] + destination['lat']) / 2,
        longitude=(origin['lng'] + destination['lng']) / 2,
        zoom=13.5,
        pitch=40,
        bearing=5
    )
    
    deck = pdk.Deck(
        layers=[path_layer, text_layer],
        initial_view_state=view_state,
        map_style="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        tooltip={"text": "{name}"}
    )
    
    st.markdown("### CleanCommute™ Route Planner")
    st.pydeck_chart(deck, use_container_width=True, height=520)
    
    # Present metrics comparison side by side
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown(f"#### 🏃‍♂️ Fastest Route")
        st.markdown(f"<p style='color: #ff9800;'><strong>Distance:</strong> {fast_stats['length_km']:.2f} km</p>", unsafe_allow_html=True)
        st.markdown(f"<p style='color: #ff9800;'><strong>Time:</strong> {int(fast_stats['time_min'])} min walk</p>", unsafe_allow_html=True)
        st.markdown(f"<p style='color: #ff9800;'><strong>Avg AQI Exposure:</strong> {int(fast_stats['avg_aqi'])}</p>", unsafe_allow_html=True)

    # Calculate Deltas
    dist_delta = (clean_stats['length_km'] - fast_stats['length_km']) / max(fast_stats['length_km'], 0.001) * 100
    time_delta = (clean_stats['time_min'] - fast_stats['time_min']) / max(fast_stats['time_min'], 0.001) * 100
    aqi_delta = (fast_stats['avg_aqi'] - clean_stats['avg_aqi']) / max(fast_stats['avg_aqi'], 1) * 100
    
    with col2:
        st.markdown(f"#### 🍃 Cleanest Route")
        st.markdown(f"<p style='color: #1D9E75;'><strong>Distance:</strong> {clean_stats['length_km']:.2f} km <small style='color:#e65100'>(+{dist_delta:.1f}%)</small></p>", unsafe_allow_html=True)
        st.markdown(f"<p style='color: #1D9E75;'><strong>Time:</strong> {int(clean_stats['time_min'])} min walk <small style='color:#e65100'>(+{time_delta:.1f}%)</small></p>", unsafe_allow_html=True)
        st.markdown(f"<p style='color: #1D9E75;'><strong>Avg AQI Exposure:</strong> {int(clean_stats['avg_aqi'])} <small style='color:#1D9E75;'>(-{aqi_delta:.1f}% less)</small></p>", unsafe_allow_html=True)
