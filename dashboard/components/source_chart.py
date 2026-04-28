import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px

def render_source_donut(source_data: dict) -> None:
    """
    Renders a Plotly Donut Chart indicating the source apportionment of the AQI.
    source_data e.g. {"Vehicular": 62, "Industrial": 18, "Construction": 12, "Biomass": 8}
    """
    labels = list(source_data.keys())
    values = list(source_data.values())
    
    # Determine dominant source
    dom_source = max(source_data, key=source_data.get) if source_data else ""
    dom_percent = source_data.get(dom_source, 0)
    
    # Specific colors mapping as requested
    color_map = {
        "Vehicular": "#f44336",     # Red
        "Industrial": "#ff9800",    # Orange
        "Construction": "#9c27b0",  # Purple
        "Biomass": "#4caf50"        # Green
    }
    colors = [color_map.get(label, "#555555") for label in labels]
    
    fig = go.Figure(data=[go.Pie(
        labels=labels,
        values=values,
        hole=0.65,
        marker=dict(colors=colors, line=dict(color='#000', width=1)),
        textinfo='none',
        hoverinfo='label+percent'
    )])
    
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=20, b=20, l=20, r=20),
        showlegend=True,
        # Displaying the main stat as the center annotation
        annotations=[dict(
            text=f"<span style='font-size:32px; color:{color_map.get(dom_source, '#fff')}'><b>{dom_percent}%</b></span><br><span style='font-size:16px; color:#e0e0e0'>{dom_source}</span>",
            x=0.5, y=0.5, showarrow=False
        )],
        # Add simple button for an animated interaction
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                y=1.1,
                x=1.0,
                xanchor="right",
                yanchor="top",
                buttons=[dict(
                    label="Play",
                    method="animate",
                    args=[None, {"frame": {"duration": 500, "redraw": True}, "fromcurrent": True}]
                )]
            )
        ]
    )
    
    st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

def render_aqi_timeline_3d(hourly_df: pd.DataFrame) -> None:
    """
    Renders a 3D Scatter plot mapping the AQI across the 24 hours of the day and source categories.
    hourly_df columns: hour (0-23), aqi, source
    """
    if hourly_df.empty:
        st.warning("No data available for timeline.")
        return

    # Map sources to Y axis categories
    sources = hourly_df['source'].unique()
    source_map = {src: i for i, src in enumerate(sources)}
    hourly_df['source_idx'] = hourly_df['source'].map(source_map)
    
    # We will build frames for playback animation
    # First frame has only hour 0. Last frame has all hours up to 23.
    hours = sorted(hourly_df['hour'].unique())
    frames = []
    
    for h in hours:
        # subset up to current hour to build the path incrementally
        frame_df = hourly_df[hourly_df['hour'] <= h]
        
        frame_data = go.Scatter3d(
            x=frame_df['hour'],
            y=frame_df['source_idx'],
            z=frame_df['aqi'],
            mode='lines+markers',
            marker=dict(
                size=5,
                color=frame_df['aqi'],
                colorscale='RdYlGn_r',
                cmin=0, cmax=300,
                line=dict(width=1, color='rgba(0,0,0,0.5)')
            ),
            line=dict(
                color=frame_df['aqi'],
                colorscale='RdYlGn_r',
                cmin=0, cmax=300,
                width=4
            ),
            text=frame_df.apply(lambda row: f"Hour: {int(row['hour'])}<br>AQI: {row['aqi']}<br>Src: {row['source']}", axis=1),
            hoverinfo='text'
        )
        frames.append(go.Frame(data=[frame_data], name=f"Hour {h}"))

    # Initial data is the first frame
    init_df = hourly_df[hourly_df['hour'] == hours[0]]
    initial_data = go.Scatter3d(
        x=init_df['hour'],
        y=init_df['source_idx'],
        z=init_df['aqi'],
        mode='lines+markers',
        marker=dict(
            size=5,
            color=init_df['aqi'],
            colorscale='RdYlGn_r',
            cmin=0, cmax=300
        ),
        line=dict(
            color=init_df['aqi'],
            colorscale='RdYlGn_r',
            cmin=0, cmax=300,
            width=4
        )
    )

    fig = go.Figure(data=[initial_data], frames=frames)
    
    # Teal color #1D9E75
    teal_color = '#1D9E75'

    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=0, b=0, l=0, r=0),
        scene=dict(
            bgcolor="rgba(0,0,0,0)",
            xaxis=dict(
                title='Hour of Day',
                range=[0, 23],
                gridcolor=teal_color,
                zerolinecolor=teal_color,
                showbackground=False
            ),
            yaxis=dict(
                title='Source Category',
                tickvals=list(source_map.values()),
                ticktext=list(source_map.keys()),
                gridcolor=teal_color,
                zerolinecolor=teal_color,
                showbackground=False
            ),
            zaxis=dict(
                title='AQI Value',
                range=[0, max(hourly_df['aqi'].max() + 50, 300)],
                gridcolor=teal_color,
                zerolinecolor=teal_color,
                showbackground=False
            ),
            camera=dict(
                eye=dict(x=1.5, y=-1.5, z=1.2)
            )
        ),
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                y=0.1,
                x=0.0,
                xanchor="right",
                yanchor="top",
                buttons=[
                    dict(label="Play", method="animate", args=[None, dict(frame=dict(duration=300, redraw=True), fromcurrent=True)]),
                    dict(label="Pause", method="animate", args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate", transition=dict(duration=0))])
                ]
            )
        ],
        sliders=[
            dict(
                active=0,
                yanchor="top",
                xanchor="left",
                currentvalue=dict(font=dict(size=14, color="#e0e0e0"), prefix="Time: ", visible=True, xanchor="right"),
                transition=dict(duration=300),
                pad=dict(b=10, t=50),
                len=0.9,
                x=0.1,
                y=0,
                steps=[dict(method="animate", args=[[f.name], dict(mode="immediate", frame=dict(duration=300, redraw=True), transition=dict(duration=0))], label=str(h)) for h, f in zip(hours, frames)]
            )
        ]
    )

    st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})
