### TODO

##### Admin/Client switch view 

    Admin --> Fleet Management ✅
          --> Weather
          --> Location for service center (center, 2 per city)
          --> Dispatch technician above 80% risk score
    
    Client --> Show just the map with stations ✅
           --> Gamify the experience
           --> Random location for user

##### Microphone for chat bot ✅
    --> Just a simple chat bot with microphone support
    --> Format response in cards

##### Toast notifications
    --> Toast alerts not working ✅


##### UI Refactor
    --> Heatmap update
    --> Cards and graphs
    --> 

##### Color Palette
    --> #f7f4eb (Background secondary)
    
### Mathematical Models

#### 1. Predictive Risk Calculation
The base Risk Score is calculated using the prediction probabilities from our trained Random Forest Classifier. For any given data frame feature row $X$, let $P(c|X)$ be the model's confidence probability that the station is in class $c$.

$$ \text{Risk Score} = P(\text{partial\_outage} | X) + P(\text{offline} | X) $$

If the model is unavailable, the system defaults to a heuristic fallback based on utilization:
$$ \text{Risk Score}_{fallback} = (\text{Utilization Rate}) \times 0.8 $$

A station is flagged for needs_maintenance if $\text{Risk Score} > 0.45$.

#### 2. Nearest Station & Routing Cost
To find the optimal charging destination for the user, we first calculate the geographical distance in kilometers using the Haversine formula:

$$ d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right) $$
Where:
* $r = 6371$ km (Earth's radius)
* $\phi_1, \phi_2$ = latitudes in radians
* $\Delta\phi, \Delta\lambda$ = difference in latitude and longitude, respectively

The Optimal Station Score (lower is better) balances driving distance with the real-time charging price (current_price):

$$ \text{Navigation Score} = (d \times 0.7) + (\text{current\_price} \times 10) $$

The station with the lowest Navigation Score is selected, and its coordinates are passed to the OSRM API for final polyline routing mapping.