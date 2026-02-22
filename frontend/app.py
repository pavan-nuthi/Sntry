import streamlit as st
import pandas as pd
import requests
import plotly.express as px
import time

# --- Configuration ---
st.set_page_config(
    page_title="Data Pigeon | EV Predictive Maintenance",
    page_icon="🐦",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS for Premium Dark Mode Look
st.markdown("""
<style>
    .reportview-container {
        background: #0E1117;
    }
    .stMetric {
        background-color: #1E232F;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #2D3748;
    }
    .metric-red { color: #FC8181; font-weight: bold; }
    .metric-green { color: #68D391; font-weight: bold; }
    /* Enhance chat messages */
    .stChatMessage {
        border-radius: 10px;
        margin-bottom: 10px;
    }
</style>
""", unsafe_allow_html=True)

# API Endpoint (adjust if running on a different port)
API_URL = "http://localhost:8000"

# --- Helper Functions ---
@st.cache_data(ttl=1) # Cache data for 1 second for live feeling
def fetch_station_data():
    try:
        response = requests.get(f"{API_URL}/api/stations")
        response.raise_for_status()
        data = response.json()
        return pd.DataFrame(data)
    except Exception as e:
        st.error(f"Failed to connect to Data Pigeon backend: {e}")
        return pd.DataFrame()

def trigger_stress(station_id):
    try:
        requests.post(f"{API_URL}/api/simulate/{station_id}")
        st.toast(f"🚨 Anomalous usage detected on {station_id}!", icon="⚠️")
        time.sleep(1) # Let backend update
        st.rerun()
    except Exception as e:
        st.error(f"Error: {e}")

def trigger_healing(station_id):
    try:
        requests.post(f"{API_URL}/api/heal/{station_id}")
        st.toast(f"✅ Dynamic Pricing deployed. Load reducing on {station_id}.", icon="💸")
        time.sleep(1)
        st.rerun()
    except Exception as e:
        st.error(f"Error: {e}")
        
def send_chat_message(msg):
    try:
        res = requests.post(f"{API_URL}/api/chat", json={"message": msg})
        return res.json().get('reply', 'No response')
    except Exception:
        return "I am currently disconnected from the predictive model."

# --- Main App ---

st.title("🐦 Data Pigeon")
st.markdown("### Intelligent Incident Response & Predictive Maintenance")

# Load Data
df = fetch_station_data()

if df.empty:
    st.warning("Awaiting connection to Data Pigeon ML Node...")
    st.stop()
    
# Process data for visualizations
# Sort by risk for the sidebar
high_risk_stations = df.sort_values(by='risk_score', ascending=False).head(5)

# --- Layout: Sidebar Chat & Analytics ---
with st.sidebar:
    if st.button("🔄 Refresh Telemetry Map", use_container_width=True, type="primary"):
        st.rerun()
        
    st.header("💬 Triaging Agent")
    st.markdown("Ask Data Pigeon about network health, routing priorities, or anomalies.")
    
    # Simple Chat UI
    if "messages" not in st.session_state:
        st.session_state["messages"] = [
            {"role": "assistant", "content": "I'm monitoring 150 stations in real-time. How can I help you route maintenance today?"}
        ]

    for msg in st.session_state.messages:
        st.chat_message(msg["role"]).write(msg["content"])

    if prompt := st.chat_input("Ask about high-risk stations..."):
        st.session_state.messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)
        
        with st.spinner("Analyzing telemetry..."):
            reply = send_chat_message(prompt)
            st.session_state.messages.append({"role": "assistant", "content": reply})
            st.chat_message("assistant").write(reply)
            
    st.divider()
    st.markdown("### 🚨 Urgent Interventions")
    for _, row in high_risk_stations.iterrows():
        if row['risk_score'] > 0.4:
            st.error(f"**{row['station_id']}** - {row['station_name']}\n\nRisk: {row['risk_score']*100:.1f}% | Rev At Risk: ${row['revenue_at_risk_daily']:.2f}/day")
            
            col1, col2 = st.columns(2)
            with col1:
                if st.button("Fix", key=f"fix_{row['station_id']}", use_container_width=True):
                    trigger_healing(row['station_id'])
            with col2:
                if st.button("Route Tech", key=f"route_{row['station_id']}", use_container_width=True):
                    st.toast(f"Technician routed to {row['station_id']}", icon="🚚")
                    
# --- Main Content Area ---
tab1, tab2, tab3 = st.tabs(["🗺️ Predictive Map Routing", "⚙️ Self-Healing Analytics", "🔍 Root Cause Analyzer"])

with tab1:
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Active Stations", len(df))
    col2.metric("High Risk Anomalies", len(df[df['risk_score'] > 0.6]), delta=f"{len(df[df['risk_score'] > 0.6])} today", delta_color="inverse")
    col3.metric("Revenue Protected", f"${df[df['risk_score'] < 0.4]['revenue_at_risk_daily'].sum():,.0f}")
    col4.metric("Revenue At Risk", f"${df[df['risk_score'] >= 0.4]['revenue_at_risk_daily'].sum():,.0f}", delta="- Action Required", delta_color="inverse")

    st.markdown("### Live Network Health")
    
    # Plotly Map
    fig = px.scatter_mapbox(
        df,
        lat="latitude",
        lon="longitude",
        hover_name="station_name",
        hover_data={
            "risk_score": ":.2f",
            "revenue_at_risk_daily": ":.2f",
            "utilization_rate": ":.2f",
            "predicted_status": True,
            "latitude": False,
            "longitude": False
        },
        color="risk_score",
        color_continuous_scale=[(0, "green"), (0.4, "yellow"), (1.0, "red")],
        range_color=[0, 1],
        size_max=15,
        zoom=3.5
    )
    
    fig.update_layout(
        mapbox_style="carto-darkmatter", # Native dark style mapping
        margin={"r":0,"t":0,"l":0,"b":0},
        paper_bgcolor="#0E1117",
    )
    
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    st.header("⚡ Dynamic Pricing to Prevent Downtime")
    st.markdown("Hardware failure is often preceded by extreme load and temperature. Use predictive pricing to shed load before a thermal failure occurs.")
    
    # Pick a random healthy station to demonstrate
    demo_station = df[df['risk_score'] < 0.2].iloc[0] if len(df[df['risk_score'] < 0.2]) > 0 else df.iloc[0]
    
    col1, col2 = st.columns([1, 2])
    
    with col1:
        st.subheader("Simulate Failure Event")
        st.write(f"**Target:** {demo_station['station_name']}")
        st.write(f"**Current Load:** {demo_station['utilization_rate']*100:.1f}%")
        st.write(f"**Temperature:** {demo_station['temperature_f']}°F")
        if st.button("Simulate Weekend Surge (Load + Heat)", type="primary"):
            trigger_stress(demo_station['station_id'])
            
    with col2:
        st.subheader("System Response")
        if demo_station['risk_score'] > 0.6:
            st.error("🚨 CRITICAL LOAD DETECTED")
            st.metric("Predicted Failure Time", "48 mins")
            # Create a mock chart of util vs price
            chart_data = pd.DataFrame(
                [[0.98, demo_station['current_price']], [0.60, demo_station['current_price']*1.5]],
                columns=["Utilization", "Price ($)"],
                index=["T-0 (Danger)", "T+10m (Price Hike deployed)"]
            )
            st.line_chart(chart_data)
            
            if st.button("Enable Automated Self-Healing (Surge Price)"):
                 trigger_healing(demo_station['station_id'])
        else:
             st.success("Station Operating Normally within Thermal Limits")
             
with tab3:
    st.header("Root Cause Analyzer")
    anomaly = df[df['risk_score'] > 0.5]
    if not anomaly.empty:
        st.write("Recent ML model flags indicate the following anomaly clusters:")
        for _, row in anomaly.head(3).iterrows():
            with st.expander(f"{row['station_name']} - Risk {row['risk_score']*100:.1f}%"):
                st.write(f"**Likely Root Cause Analysis:**")
                st.write(f"- Network: {row['network']}")
                if row['temperature_f'] > 90: st.markdown("- 🔴 Warning: High ambient temperatures detected. Likely thermal throttling.")
                if row['utilization_rate'] > 0.8: st.markdown("- 🔴 Warning: Sustained maximum output. Component wear accelerated.")
                if row['estimated_wait_time_mins'] > 30: st.markdown("- 🔴 Warning: Queue length vs Session Duration mismatch. Likely Partial Outage on Node B.")
                st.button("Generate Dispatch Ticket", key=f"tkt_{row['station_id']}")
    else:
        st.info("No active anomalies requiring root cause diagnosis at this time.")
