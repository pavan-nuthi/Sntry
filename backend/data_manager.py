import pandas as pd
import numpy as np

class DataManager:
    def __init__(self, filepath, num_stations=100):
        self.filepath = filepath
        self.num_stations = num_stations
        self.raw_data = None
        self.active_stations = None
        self.logs = []
        
    def log_event(self, action, details):
        """Records a system event (like surge pricing). Keeps the last 50 logs."""
        import datetime
        self.logs.append({
            "timestamp": datetime.datetime.now().isoformat(),
            "action": action,
            "details": details
        })
        if len(self.logs) > 50:
            self.logs.pop(0)
        
    def load_data(self):
        """Loads a subset of stations to act as our 'live' database."""
        print(f"Loading data from {self.filepath}...")
        df = pd.read_csv(self.filepath)
        
        # Ensure timestamp is parsed properly
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            
        # Get a list of unique stations and sample them
        unique_stations = df['station_id'].unique()
        sampled_station_ids = np.random.choice(unique_stations, self.num_stations, replace=False)
        
        # Filter for only those stations and sort chronologically
        self.raw_data = df[df['station_id'].isin(sampled_station_ids)].copy()
        self.raw_data = self.raw_data.sort_values('timestamp')
        
        # Calculate historical averages (excluding the very last most recent timestamp)
        # We group by station_id and take all but the last row
        historical_data = self.raw_data.groupby('station_id').apply(lambda x: x.iloc[:-1]).reset_index(drop=True)
        hist_utilization = historical_data.groupby('station_id')['utilization_rate'].mean().reset_index()
        hist_utilization = hist_utilization.rename(columns={'utilization_rate': 'historical_utilization_avg'})
        
        # Keep the most recent timestamp for each station to act as 'current state'
        self.active_stations = self.raw_data.groupby('station_id').tail(1).copy()
        
        # Merge in the historical trend analysis
        self.active_stations = pd.merge(self.active_stations, hist_utilization, on='station_id', how='left')
        
        # Ensure 'current_price' exists and is strictly positive
        if 'current_price' not in self.active_stations.columns:
            self.active_stations['current_price'] = 0.45
        else:
            # If there's missing data for pricing, fill with standard $0.45 pricing
            self.active_stations['current_price'] = self.active_stations['current_price'].fillna(0.45)
            # Ensure no prices are secretly 0.0 in the CSV which breaks the multiplier logic
            self.active_stations.loc[self.active_stations['current_price'] <= 0.0, 'current_price'] = 0.45

        # Assign the requested Revenue at Risk metric for routing priority
        # User formula: current_price × utilization_rate × avg_session_duration_mins
        self.active_stations['revenue_at_risk_daily'] = (
            self.active_stations['current_price'] * 
            self.active_stations['utilization_rate'] * 
            self.active_stations['avg_session_duration_mins']
        )
        
        print(f"Loaded {len(self.active_stations)} active stations.")
        
    def get_all_stations(self, timeframe='0', start_date=None, end_date=None):
        """Returns the state of all tracked stations based on the requested timeframe or explicit date bounds."""
        if self.active_stations is None:
            self.load_data()
            
        max_date = self.raw_data['timestamp'].max()
        
        # Calculate available timeframes dynamically based on the max date
        available_timeframes = []
        for i in range(6):
            target_date = max_date - pd.DateOffset(months=i)
            label = f"Today ({max_date.strftime('%b %d, %Y')})" if i == 0 else target_date.strftime('%B %Y')
            available_timeframes.append({"id": str(i), "label": label})
            
        # Custom Date Range Override
        if start_date and end_date:
            try:
                start_dt = pd.to_datetime(start_date)
                end_dt = pd.to_datetime(end_date)
                
                past_data = self.raw_data[(self.raw_data['timestamp'] >= start_dt) & (self.raw_data['timestamp'] <= end_dt)]
                
                if not past_data.empty:
                    target_stations = past_data.groupby('station_id').tail(1).copy()
                    
                    historical_data = past_data.groupby('station_id').apply(lambda x: x.iloc[:-1]).reset_index(drop=True)
                    if not historical_data.empty:
                        hist_utilization = historical_data.groupby('station_id')['utilization_rate'].mean().reset_index()
                        hist_utilization = hist_utilization.rename(columns={'utilization_rate': 'historical_utilization_avg'})
                        target_stations = pd.merge(target_stations, hist_utilization, on='station_id', how='left')
                    else:
                        target_stations['historical_utilization_avg'] = target_stations['utilization_rate']
                    
                    target_stations['revenue_at_risk_daily'] = (
                        target_stations['current_price'] * 
                        target_stations['utilization_rate'] * 
                        target_stations['avg_session_duration_mins']
                    )
                else:
                    target_stations = self.active_stations.copy()
            except Exception as e:
                print(f"Date Parsing Error: {e}")
                target_stations = self.active_stations.copy()
        else:
            # Fall back to the predefined monthly timeframes
            try:
                months_ago = int(timeframe)
            except ValueError:
                months_ago = 0
                
            if months_ago > 0:
                cutoff = max_date - pd.DateOffset(months=months_ago)
                past_data = self.raw_data[self.raw_data['timestamp'] <= cutoff]
                
                if not past_data.empty:
                    target_stations = past_data.groupby('station_id').tail(1).copy()
                    
                    historical_data = past_data.groupby('station_id').apply(lambda x: x.iloc[:-1]).reset_index(drop=True)
                    if not historical_data.empty:
                        hist_utilization = historical_data.groupby('station_id')['utilization_rate'].mean().reset_index()
                        hist_utilization = hist_utilization.rename(columns={'utilization_rate': 'historical_utilization_avg'})
                        target_stations = pd.merge(target_stations, hist_utilization, on='station_id', how='left')
                    else:
                        target_stations['historical_utilization_avg'] = target_stations['utilization_rate']
                    
                    target_stations['revenue_at_risk_daily'] = (
                        target_stations['current_price'] * 
                        target_stations['utilization_rate'] * 
                        target_stations['avg_session_duration_mins']
                    )
                else:
                    target_stations = self.active_stations.copy()
            else:
                target_stations = self.active_stations.copy()
        
        # Clean up data for JSON serialization (convert NaN to None, numpy types to native)
        df_clean = target_stations.replace({np.nan: None})
        
        # Convert numpy booleans and integers to python native types
        for col in df_clean.columns:
            if df_clean[col].dtype == 'bool' or df_clean[col].dtype.name == 'bool':
                df_clean[col] = df_clean[col].astype(bool)
            elif pd.api.types.is_integer_dtype(df_clean[col]):
                df_clean[col] = df_clean[col].astype(int)
            elif pd.api.types.is_float_dtype(df_clean[col]):
                df_clean[col] = df_clean[col].astype(float)
                
        return df_clean.to_dict(orient='records')
        
    def get_station_features_for_prediction(self, station_id=None, df_row=None):
        """Prepares a row of data exactly as the ML model expects it."""
        if df_row is None:
            if self.active_stations is None:
                self.load_data()
            df_row = self.active_stations[self.active_stations['station_id'] == station_id].copy()
            
        if df_row.empty:
            return None
            
        # The exact columns dropped during training in main.py
        columns_to_drop = [
            'station_id', 'station_name', 'timestamp', 'city', 'state',
            'latitude', 'longitude', 'amenities_nearby', 
            'ports_available', 'ports_occupied', 'ports_out_of_service',
            'station_status', 'revenue_at_risk_daily' # Drop our added column and the target
        ]
        
        features = df_row.drop(columns=columns_to_drop, errors='ignore')
        return features

    def simulate_stress(self, station_id):
        """Artificially spikes utilization and temperature to demonstrate predictive failure."""
        if self.active_stations is None:
            self.load_data()
            
        idx = self.active_stations.index[self.active_stations['station_id'] == station_id].tolist()
        if not idx:
            return None
            
        # Spike the metrics
        idx = idx[0]
        self.active_stations.at[idx, 'utilization_rate'] = 0.98
        self.active_stations.at[idx, 'temperature_f'] = 105.0
        self.active_stations.at[idx, 'estimated_wait_time_mins'] = 45.0
        
        return self.active_stations.loc[idx].replace({np.nan: None}).to_dict()
        
    def apply_self_healing_pricing(self, station_id):
        """Simulates dynamic pricing hike to lower demand on a stressed station, while dropping the price of a nearby healthy node to reroute traffic."""
        if self.active_stations is None:
            self.load_data()
            
        # Find the stressed station
        stressed_idx = self.active_stations.index[self.active_stations['station_id'] == station_id].tolist()
        if not stressed_idx:
            return None
            
        stressed_idx = stressed_idx[0]
        stressed_lat = self.active_stations.at[stressed_idx, 'latitude']
        stressed_lon = self.active_stations.at[stressed_idx, 'longitude']
        
        # 1. Surge Pricing on Stressed Station
        current_price = self.active_stations.at[stressed_idx, 'current_price']
        new_price = current_price * 1.75 # 75% surge
        self.active_stations.at[stressed_idx, 'current_price'] = new_price
        
        # The higher price mathematically lowers utilization and wait times in our simulation
        old_util = self.active_stations.at[stressed_idx, 'utilization_rate']
        self.active_stations.at[stressed_idx, 'utilization_rate'] = max(0.20, old_util - 0.40) # Drastically cut traffic
        self.active_stations.at[stressed_idx, 'estimated_wait_time_mins'] = 2.0
        
        # 2. Find closest healthy station to reroute traffic
        # Healthy: utilization < 0.6
        healthy_mask = self.active_stations['utilization_rate'] < 0.6
        # don't select the stressed one
        healthy_mask.loc[stressed_idx] = False
        
        healthy_stations = self.active_stations[healthy_mask].copy()
        
        if not healthy_stations.empty:
            # Calculate simple euclidian distance for nearest neighbor
            healthy_stations['dist'] = np.sqrt(
                (healthy_stations['latitude'] - stressed_lat)**2 + 
                (healthy_stations['longitude'] - stressed_lon)**2
            )
            nearest_idx = healthy_stations['dist'].idxmin()
            
            # Lower price at the nearest healthy station by 30% to attract drivers
            healthy_price = self.active_stations.at[nearest_idx, 'current_price']
            self.active_stations.at[nearest_idx, 'current_price'] = healthy_price * 0.70
            
            # Attracting drivers raises its utilization
            self.active_stations.at[nearest_idx, 'utilization_rate'] = min(0.85, self.active_stations.at[nearest_idx, 'utilization_rate'] + 0.3)
            
            self.log_event("AUTO_SURGE_PRICING", {
                "stressed_station": self.active_stations.loc[stressed_idx]['station_name'],
                "stressed_price_increase": f"${current_price:.2f} ➔ ${new_price:.2f}",
                "rerouted_station": self.active_stations.loc[nearest_idx]['station_name'],
                "rerouted_price_decrease": f"${healthy_price:.2f} ➔ ${self.active_stations.at[nearest_idx, 'current_price']:.2f}"
            })
            
            return {
                "stressed_station": self.active_stations.loc[stressed_idx].replace({np.nan: None}).to_dict(),
                "rerouted_station": self.active_stations.loc[nearest_idx].replace({np.nan: None}).to_dict()
            }
            
        self.log_event("AUTO_SURGE_PRICING_NO_REROUTE", {
            "stressed_station": self.active_stations.loc[stressed_idx]['station_name'],
            "stressed_price_increase": f"${current_price:.2f} ➔ ${new_price:.2f}",
            "rerouted_station": "None",
            "rerouted_price_decrease": "N/A"
        })
            
        return {
             "stressed_station": self.active_stations.loc[stressed_idx].replace({np.nan: None}).to_dict(),
             "rerouted_station": None
        }

    def simulate_live_tick(self, timestamp_str):
        """
        Advances the simulation by simulating live data based on historical averages 
        at the same time last year, then applies a small chance of randomness for surges.
        """
        if self.active_stations is None:
            self.load_data()
            
        try:
            current_dt = pd.to_datetime(timestamp_str)
        except Exception:
            current_dt = pd.Timestamp.now()
            
        target_month = current_dt.month
        target_hour = current_dt.hour
        
        # Filter raw data for similar month and hour historicals
        hist_data = self.raw_data[(self.raw_data['timestamp'].dt.month == target_month) & 
                                  (self.raw_data['timestamp'].dt.hour == target_hour)]
                                  
        for idx, row in self.active_stations.iterrows():
            station_id = row['station_id']
            
            # 1. Base the new metrics historically
            if not hist_data.empty:
                station_hist = hist_data[hist_data['station_id'] == station_id]
                if not station_hist.empty:
                    sample = station_hist.sample(1).iloc[0]
                    base_util = sample['utilization_rate']
                    base_temp = sample['temperature_f']
                else:
                    base_util = row['utilization_rate']
                    base_temp = row['temperature_f']
            else:
                base_util = row['utilization_rate']
                base_temp = row['temperature_f']
                
            # 2. Add very small randomness
            noise_util = np.random.normal(0, 0.05)
            new_util = max(0.0, min(1.0, base_util + noise_util))
            new_temp = base_temp + np.random.normal(0, 2)
            
            self.active_stations.at[idx, 'utilization_rate'] = new_util
            self.active_stations.at[idx, 'temperature_f'] = new_temp
            
            # Recalculate revenue at risk matching the formula
            self.active_stations.at[idx, 'revenue_at_risk_daily'] = (
                self.active_stations.at[idx, 'current_price'] * 
                new_util * 
                self.active_stations.at[idx, 'avg_session_duration_mins']
            )

        # 3. Ambient Random Surge (The "Problem Generator")
        # 10% chance per tick to artificially force an extreme utilization spike on a GROUP of stations
        if np.random.random() < 0.05:
            healthy_pool = self.active_stations[self.active_stations['utilization_rate'] < 0.50]
            # Pick a random number of stations to stress out simultaneously (1 to 5)
            num_victims = np.random.randint(1, min(6, len(healthy_pool) + 1))
            
            if not healthy_pool.empty:
                victims = healthy_pool.sample(n=num_victims)
                
                for _, random_victim in victims.iterrows():
                    idx = self.active_stations.index[self.active_stations['station_id'] == random_victim['station_id']].tolist()[0]
                    
                    # Force a massive, sudden surge in traffic/wait time
                    self.active_stations.at[idx, 'utilization_rate'] = 0.98
                    self.active_stations.at[idx, 'estimated_wait_time_mins'] = 45.0
                    self.active_stations.at[idx, 'temperature_f'] = random_victim['temperature_f'] + 20.0 # Heats up
                    
                    self.log_event("TRAFFIC_SURGE_DETECTED", {
                        "station": random_victim['station_name'],
                        "warning": f"Unexpected traffic spike! Utilization hit 98%."
                    })

        # 4. Systematic Auto-Healing Sweep 
        # Scan the network for stations that have crossed the pain threshold and haven't been dynamically priced yet
        # Pain Threshold: Utilization > 60%
        critical_stations = self.active_stations[
            (self.active_stations['utilization_rate'] > 0.60) & 
            (self.active_stations['current_price'] < 0.50) # Assuming <$0.50 means it hasn't been surged recently
        ]
        
        # Limit auto-heal to 2 stations per tick so the cascading effects happen gradually over time
        for _, station in critical_stations.head(2).iterrows():
            self.apply_self_healing_pricing(station['station_id'])
            
        # Return updated JSON
        return self.get_all_stations()
