import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import joblib

def load_and_preprocess_data(filepath, sample_frac=0.1):
    """
    Loads and preprocesses the EV Charging Station dataset for predictive maintenance.
    """
    print(f"Loading data from {filepath} (sample_frac={sample_frac})...")
    df = pd.read_csv(filepath)
    
    # Ensure timestamp is a datetime object so we can sort chronologically
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp', ascending=True)
    
    # Take chronological sample representing the oldest/newest combined if frac < 1.0
    # Or just use the whole sorted dataframe
    if sample_frac < 1.0:
        # To maintain chronological order but reduce size, take the most recent fraction
        # as that's the most relevant for predicting future events.
        num_rows = int(len(df) * sample_frac)
        df = df.tail(num_rows).copy()
    
    print(f"Data shape after sampling: {df.shape}")

    # Columns that leak the status or are identifiers and not helpful for generalized prediction
    columns_to_drop = [
        'station_id', 'station_name', 'timestamp', 'city', 'state',
        'latitude', 'longitude', 'amenities_nearby', 
        'ports_available', 'ports_occupied', 'ports_out_of_service'
    ]
    df = df.drop(columns=columns_to_drop, errors='ignore')
    
    # Handle any potential missing values (using ffill for time-series-like continuity if needed, 
    # though sampling randomized the order, so just filling with 0 or median is safer.)
    df = df.fillna(0)
    
    print("Encoding categorical features...")
    categorical_cols = [
        'network', 'location_type', 'charger_type', 
        'pricing_type', 'weather_condition', 'local_event'
    ]
    
    label_encoders = {}
    for col in categorical_cols:
        if col in df.columns:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            label_encoders[col] = le
            
    # Target variable for Predictive Maintenance
    target_col = 'station_status'
    
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    return X, y, label_encoders

def train_predictive_maintenance_model(X, y):
    """
    Trains a Random Forest classifier to predict station status anomalies.
    """
    print("Splitting data into chronological time-series train/test sets...")
    # Because X and y are already sorted by time (oldest to newest), setting shuffle=False 
    # ensures the first 80% (older data) is used for training, and the newest 20% is testing.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=False
    )
    
    print("Training Random Forest Classifier (handling class imbalance)...")
    # Using class_weight='balanced' is critical here due to the vast majority of 'operational' logs.
    model = RandomForestClassifier(
        n_estimators=100, 
        max_depth=15, 
        class_weight='balanced', 
        random_state=42, 
        n_jobs=-1
    )
    
    model.fit(X_train, y_train)
    
    print("\n--- Model Evaluation ---")
    y_pred = model.predict(X_test)
    
    print("Classification Report:")
    print(classification_report(y_test, y_pred))
    
    print("Top 10 Feature Importances:")
    importances = model.feature_importances_
    feature_imp_df = pd.DataFrame({
        'Feature': X.columns, 
        'Importance': importances
    }).sort_values(by='Importance', ascending=False)
    
    print(feature_imp_df.head(10))
    
    return model, feature_imp_df

def train_anomaly_clusterer(X, y):
    """
    Trains an unsupervised KMeans model purely on failing rows to categorize Root Causes.
    """
    print("\n--- Training Root Cause Anomaly Clusterer ---")
    
    # Isolate only the rows where the station actually failed
    failure_mask = y.isin(['partial_outage', 'offline'])
    X_failures = X[failure_mask]
    
    print(f"Isolated {len(X_failures)} historical failure events for clustering.")
    
    if len(X_failures) < 4:
        print("Not enough failure data to cluster. Skipping.")
        return None
        
    # Cluster these failures into 4 common "types" or "root causes"
    # (e.g., Heat-Induced, Traffic-Induced, Weather-Induced, Random Hardware)
    kmeans = KMeans(n_clusters=4, random_state=42, n_init='auto')
    kmeans.fit(X_failures)
    
    # We could analyze the cluster centers here to automatically map them to English descriptions,
    # but the API can just map the 4 IDs to hardcoded English interpretations based on the dataset logic.
    print("Successfully trained KMeans on failure prototypes.")
    return kmeans

if __name__ == "__main__":
    filepath = 'ev_charging_station_data 2.csv'
    
    # We use a 10% sample for rapid demonstration.
    # To train on the full 1.3M rows, set sample_frac to 1.0.
    X, y, encoders = load_and_preprocess_data(filepath, sample_frac=1.0)
    
    model, importances = train_predictive_maintenance_model(X, y)
    
    # Train the Anomaly Analyzer
    clusterer = train_anomaly_clusterer(X, y)
    
    # Save the models and encoders for deployment in the AI Assistant
    joblib.dump(model, 'predictive_maintenance_model.pkl')
    joblib.dump(encoders, 'label_encoders.pkl')
    
    if clusterer:
        joblib.dump(clusterer, 'anomaly_clusterer.pkl')
        
    print(f"\nModels and encoders saved successfully to disk.")
