import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report
import time
from main import load_and_preprocess_data

def evaluate_models():
    filepath = 'ev_charging_station_data 2.csv'
    # Use a 10% sample for faster evaluation of multiple algorithms
    X, y, encoders = load_and_preprocess_data(filepath, sample_frac=0.1)
    
    # Chronological split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=False
    )
    
    models = {
        "Logistic Regression": LogisticRegression(class_weight='balanced', max_iter=1000, n_jobs=-1),
        "Decision Tree": DecisionTreeClassifier(class_weight='balanced', max_depth=15, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=100, max_depth=15, class_weight='balanced', random_state=42, n_jobs=-1),
        "Hist Gradient Boosting": HistGradientBoostingClassifier(max_depth=15, random_state=42) # HistGradientBoosting does not support class_weight natively in the same way, but it's very robust
    }
    
    results = []
    
    print("\n--- Starting Model Benchmarking ---\n")
    for name, model in models.items():
        print(f"Training {name}...")
        start_time = time.time()
        
        try:
            model.fit(X_train, y_train)
            train_time = time.time() - start_time
            
            y_pred = model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            f1 = f1_score(y_test, y_pred, average='weighted')
            
            results.append({
                "Model": name,
                "Accuracy": round(accuracy, 4),
                "Weighted F1": round(f1, 4),
                "Train Time (s)": round(train_time, 2)
            })
            print(f"  Accuracy: {accuracy:.4f}, F1: {f1:.4f}, Time: {train_time:.2f}s")
            
        except Exception as e:
            print(f"  Error training {name}: {e}")
            
    print("\n--- Final Results Spreadsheet ---")
    results_df = pd.DataFrame(results)
    results_df = results_df.sort_values(by='Weighted F1', ascending=False)
    print(results_df.to_string(index=False))

if __name__ == "__main__":
    evaluate_models()
