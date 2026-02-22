from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import joblib
import pandas as pd
import os
import uvicorn
import httpx # For Mock LLM
from contextlib import asynccontextmanager
import sys
import json
from google import genai
from google.genai import types

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import load_and_preprocess_data, train_predictive_maintenance_model
from data_manager import DataManager

# Global variables to hold model state
app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load ML Model and Encoders
    try:
        model_path = os.path.join(os.path.dirname(__file__), '..', 'predictive_maintenance_model.pkl')
        encoder_path = os.path.join(os.path.dirname(__file__), '..', 'label_encoders.pkl')
        
        # We need the data file to act as our live DB.
        data_path = os.path.join(os.path.dirname(__file__), '..', 'ev_charging_station_data 2.csv')
        
        print("Loading Predictive Maintenance Model...")
        app_state['model'] = joblib.load(model_path)
        app_state['encoders'] = joblib.load(encoder_path)
        
        clusterer_path = os.path.join(os.path.dirname(__file__), '..', 'anomaly_clusterer.pkl')
        if os.path.exists(clusterer_path):
             print("Loading Root Cause Anomaly Clusterer...")
             app_state['clusterer'] = joblib.load(clusterer_path)
        else:
             app_state['clusterer'] = None
        
        print("Initializing DataManager...")
        app_state['db'] = DataManager(data_path, num_stations=150)
        app_state['db'].load_data()
        
        print("Startup Complete!")
    except Exception as e:
        print(f"Error during startup: {e}")
        print("Did you run `python main.py` first to generate the .pkl files?")
    yield
    # Clean up here if needed
    print("Shutting down SNTRY AI backend...")

app = FastAPI(title="SNTRY AI API", lifespan=lifespan)

# Allow Streamlit frontend to communicate with API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For hackathon development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the SNTRY AI Predictive Maintenance API"}

def _enrich_stations_with_predictions(stations, db, model, encoders, clusterer):
    prediction_batch = []
    
    for station in stations:
        try:
            features_df = db.get_station_features_for_prediction(df_row=pd.DataFrame([station]))
            if features_df is None or features_df.empty:
                continue
            prediction_batch.append(features_df)
        except Exception as e:
            print(f"Error preparing row for {station.get('station_id')}: {e}")
            
    if prediction_batch:
        try:
            batch_df = pd.concat(prediction_batch, ignore_index=True)
            for col, le in encoders.items():
                if col in batch_df.columns:
                    try:
                        batch_df[col] = batch_df[col].astype(str)
                        known_classes = set(le.classes_)
                        batch_df[col] = batch_df[col].apply(lambda x: x if x in known_classes else str(le.classes_[0]))
                        batch_df[col] = le.transform(batch_df[col])
                    except Exception as e:
                        print(f"Encoding Error on col {col}: {e}")
            
            expected_features = model.feature_names_in_ if hasattr(model, 'feature_names_in_') else None
            if expected_features is not None:
                for col in expected_features:
                    if col not in batch_df.columns:
                        batch_df[col] = 0
                batch_df = batch_df[expected_features]          

            predictions = model.predict(batch_df)
            probabilities = model.predict_proba(batch_df)
            classes = model.classes_
            
            cluster_preds = None
            if clusterer is not None:
                 try:
                      cluster_preds = clusterer.predict(batch_df)
                 except Exception as c_err:
                      pass
                      
            cluster_reasons = {
                0: "Traffic-Induced Overload (Wait Times > 60m)",
                1: "Heat-Induced Hardware Degradation (Temp > 95°F)",
                2: "Software/Network Disconnect (Low Utilization / Error)",
                3: "General Hardware Failure (Routine Wear & Tear)"
            }
            
            for i, station in enumerate(stations):
                 station['predicted_status'] = predictions[i]
                 
                 risk = 0.0
                 for j, cls_name in enumerate(classes):
                      if cls_name in ['partial_outage', 'offline']:
                           risk += probabilities[i][j]
                 
                 station['risk_score'] = float(risk)
                 station['needs_maintenance'] = bool(risk > 0.45)
                 
                 if station['needs_maintenance'] and cluster_preds is not None:
                      cid = int(cluster_preds[i])
                      station['root_cause_diagnosis'] = cluster_reasons.get(cid, "Unknown Anomaly Pattern")
                 else:
                      station['root_cause_diagnosis'] = "Nominal"
                
        except Exception as e:
            print(f"Error during batch prediction: {e}")
            # Fallback if model fails
            for station in stations:
                station['risk_score'] = float(station.get('utilization_rate', 0.5) * 0.8)
                station['needs_maintenance'] = bool(station['risk_score'] > 0.45)
    else:
        # Fallback if no stations could be prepared
        for station in stations:
            # Simple heuristic fallback: high utilization = higher risk
            risk_score = station.get('utilization_rate', 0.5) * 0.8
            station['risk_score'] = float(risk_score)
            
            # Create a boolean flag for easy frontend mapping (ensure it's native Python bool, not numpy.bool_)
            station['needs_maintenance'] = bool(risk_score > 0.45)
            
    return stations

@app.get("/api/stations", response_model=Dict[str, Any])
def get_all_stations(timeframe: str = "0", start_date: str = None, end_date: str = None):
    """Returns all stations, current predicted risk scores, and available timeframes for filtering."""
    db: DataManager = app_state.get('db')
    model = app_state.get('model')
    encoders = app_state.get('encoders')
    clusterer = app_state.get('clusterer')
    
    if not db or not model:
        raise HTTPException(status_code=500, detail="Model or Data not loaded.")
        
    response_data = db.get_all_stations(timeframe, start_date, end_date)
    stations = response_data.get('stations', []) if isinstance(response_data, dict) else response_data
    
    available_timeframes = []
    if isinstance(response_data, dict) and 'available_timeframes' in response_data:
        available_timeframes = response_data.get('available_timeframes', [])
    elif isinstance(response_data, list):
         stations = response_data
         
    if not available_timeframes and hasattr(db, 'raw_data') and db.raw_data is not None:
         max_date = db.raw_data['timestamp'].max()
         for i in range(6):
            target_date = max_date - pd.DateOffset(months=i)
            label = f"Today ({max_date.strftime('%b %d, %Y')})" if i == 0 else target_date.strftime('%B %Y')
            available_timeframes.append({"id": str(i), "label": label})


    # Run predictions on all stations to score them
    stations = _enrich_stations_with_predictions(stations, db, model, encoders, clusterer)
    
    return {
        "timeframes": available_timeframes,
        "stations": stations
    }

@app.post("/api/simulate/{station_id}")
def simulate_stress(station_id: str):
    """Simulates a stress event, spiking temperature and utilization."""
    db: DataManager = app_state.get('db')
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    result = db.simulate_stress_event(station_id)
    if not result:
        raise HTTPException(status_code=404, detail="Station not found")
        
    return {"message": f"Stress simulated for {station_id}", "data": result}

@app.post("/api/heal/{station_id}")
def auto_heal(station_id: str):
    """Applies dynamic pricing to shift load away from a stressed node."""
    db: DataManager = app_state.get('db')
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    result = db.apply_self_healing_pricing(station_id)
    if not result:
         raise HTTPException(status_code=404, detail="Station not found or already healthy")
         
    return {"message": f"Self-healing applied for {station_id}", "data": result}
    
@app.post("/api/simulation/tick")
def simulation_tick(timestamp: str = Body(..., embed=True)):
    """Advances the simulation by simulating live data based on historical averages and applying auto-healing."""
    db: DataManager = app_state.get('db')
    model = app_state.get('model')
    encoders = app_state.get('encoders')
    clusterer = app_state.get('clusterer')
    
    if not db:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    db.simulate_live_tick(timestamp)
    
    # Re-enrich the new base state with updated ML predictions
    response_data = db.get_all_stations("0")
    stations = response_data.get('stations', []) if isinstance(response_data, dict) else response_data
    
    if model and encoders:
        stations = _enrich_stations_with_predictions(stations, db, model, encoders, clusterer)
        
    return {"message": "Tick processed", "stations": stations}

@app.get("/api/logs")
def get_system_logs():
    """Returns the system event logs (like surge pricing triggers)."""
    db: DataManager = app_state.get('db')
    if not db:
        return {"logs": []}
    return {"logs": db.logs}
    
@app.post("/api/train")
async def retrain_model():
    """Triggers a background execution of main.py to retrain the ML models, then reloads them."""
    import subprocess
    import os
    
    try:
        # Get path to main.py
        main_script_path = os.path.join(os.path.dirname(__file__), '..', 'main.py')
        
        # Run main.py synchronously to ensure models are overwritten before we load them
        print("Starting ML Retraining Pipeline...")
        process = subprocess.run(['python', main_script_path], capture_output=True, text=True, check=True)
        print("ML Retraining Finished.")
        
        # Reload models into memory
        model_path = os.path.join(os.path.dirname(__file__), '..', 'predictive_maintenance_model.pkl')
        encoder_path = os.path.join(os.path.dirname(__file__), '..', 'label_encoders.pkl')
        clusterer_path = os.path.join(os.path.dirname(__file__), '..', 'anomaly_clusterer.pkl')
        
        app_state['model'] = joblib.load(model_path)
        app_state['encoders'] = joblib.load(encoder_path)
        if os.path.exists(clusterer_path):
             app_state['clusterer'] = joblib.load(clusterer_path)
             
        # Reload full data table so risk scores reflect the new models
        db = app_state.get('db')
        if db: 
            db.load_data()
        
        return {
            "message": "Models retrained and reloaded successfully in memory.",
            "status": "success"
        }
    except subprocess.CalledProcessError as e:
        print(f"Subprocess Error:\n{e.stderr}")
        raise HTTPException(status_code=500, detail="Failed to execute training script.")
    except Exception as e:
        print(f"Error during retrain/reload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_data_pigeon(message: str = Body(..., embed=True), api_key: str = Body(None, embed=True)):
    """LLM Endpoint for the Triaging Agent using Google Gemini."""
    db: DataManager = app_state.get('db')
    model = app_state.get('model')
    encoders = app_state.get('encoders')
    clusterer = app_state.get('clusterer')
    
    # We must explicitly call get_all_stations() with '0' to get the processed logic
    response_data = db.get_all_stations("0")
    stations = response_data.get('stations', []) if isinstance(response_data, dict) else response_data
    
    # Run the ML models to assign risk scores and anomaly clusters to this station batch
    if model and encoders:
        stations = _enrich_stations_with_predictions(stations, db, model, encoders, clusterer)
    
    # Now we can safely filter by risk_score
    high_risk_stations = [s for s in stations if s.get('risk_score', 0) > 0.4]
    
    # Also grab the highest revenue at risk station just in case they ask about routing/money
    if stations:
         highest_rev_station = sorted(stations, key=lambda x: x.get('current_price', 0) * x.get('utilization_rate', 0) * x.get('avg_session_duration_mins', 0), reverse=True)[0]
         if highest_rev_station not in high_risk_stations:
             high_risk_stations.append(highest_rev_station)
        
    # Simplify the objects to save tokens
    context_data = []
    for s in high_risk_stations:
        context_data.append({
            "id": s['station_id'],
            "name": s['station_name'],
            "city": s['city'],
            "risk_score_percent": round(s.get('risk_score', 0) * 100, 1),
            "temp_f": s['temperature_f'],
            "utilization": round(s['utilization_rate'] * 100, 1),
            "revenue_at_risk": s.get('revenue_at_risk_daily', 0),
            "needs_maintenance": s.get('needs_maintenance', False),
            "root_cause_diagnosis": s.get('root_cause_diagnosis', 'Unknown')
        })

    system_instruction = f"""
    You are SNTRY AI, an AI Assistant for an EV Charging Network dispatcher.
    You help analyze the network and prioritize maintenance.
    The Random Forest Machine Learning model has flagged the following stations as HIGH RISK or in need of attention right now:
    {json.dumps(context_data, indent=2)}
    
    RULES:
    1. Answer the user's question based ONLY on the JSON data provided above. 
    2. MUST FORMAT YOUR RESPONSE AS JSON. Return a JSON object with exactly two keys:
        - "message": A string containing your conversational response.
        - "cards": An array of objects, where each object represents a high-risk station. Each object MUST have:
            "city" (string), "station_name" (string), "risk_score" (string, e.g. "82.8%"), "reason" (string, the root cause diagnosis), and "details" (string, e.g. "Temperature 95F").
    3. If they ask about a city or station not in the JSON, politely state that you only have data on the currently flagged high-risk stations.
    """
    
    # If no API key was provided by the frontend, fallback to the mock logic temporarily
    if not api_key:
         msg_lower = message.lower()
         if "high risk" in msg_lower or "failure" in msg_lower or "break" in msg_lower:
             if context_data:
                 s = context_data[0]
                 return {
                     "message": "Here is the highest risk station right now (MOCK MODE):",
                     "cards": [{
                         "city": s['city'],
                         "station_name": s['name'],
                         "risk_score": f"{s['risk_score_percent']}%",
                         "reason": s['root_cause_diagnosis'],
                         "details": f"Wait, no API key provided. Temp: {s['temp_f']}F"
                     }]
                 }
             else:
                 return {"message": "[MOCK MODE] Currently, there are no stations displaying critical failure signatures across the network.", "cards": []}
         else:
             return {"message": "I am operating in MOCK MODE because no Gemini API key was provided. I can only answer basic queries about 'high risk' stations.", "cards": []}

    # 2. Call the Google Gemini API natively
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=message,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                system_instruction=system_instruction,
                temperature=0.3, 
            )
        )
        try:
            reply_data = json.loads(response.text)
            return reply_data
        except:
            return {"message": response.text, "cards": []}
    except Exception as e:
        print(f"Gemini API Error: {e}")
        raise HTTPException(status_code=500, detail=f"LLM Generation Failed (Check API Key): {str(e)}")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
