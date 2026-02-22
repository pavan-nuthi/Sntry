import { useState, useMemo, useEffect, useRef } from 'react';
import Map, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { AlertTriangle } from 'lucide-react';
import useSupercluster from 'use-supercluster';
import 'maplibre-gl/dist/maplibre-gl.css';

const superclusterOptions = {
  radius: 50, // Smaller radius means stations need to be closer together to cluster
  maxZoom: 6, // The threshold zoom level where all clusters break apart into individual pins
  map: (props) => ({
    healthy: props.category === 'healthy' ? 1 : 0,
    warning: props.category === 'warning' ? 1 : 0,
    critical: props.category === 'critical' ? 1 : 0,
  }),
  reduce: (accumulated, props) => {
    accumulated.healthy += props.healthy;
    accumulated.warning += props.warning;
    accumulated.critical += props.critical;
  }
};

export default function Mapillary({ stations, roleMode = 'admin', onSimulate, onHeal }) {
  const mapRef = useRef();
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(10);
  const [nearestStations, setNearestStations] = useState([]);

  const [popupInfo, setPopupInfo] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [bestRoute, setBestRoute] = useState(null);
  const [isRouting, setIsRouting] = useState(false);

  // Admin Features
  const [serviceCenters, setServiceCenters] = useState([]);
  const [technicianRoute, setTechnicianRoute] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Generate service centers exactly once when stations load
  useEffect(() => {
    if (stations.length > 0 && serviceCenters.length === 0) {
      const centers = [];
      const cities = [...new Set(stations.map(s => s.city))].filter(Boolean);
      cities.forEach(city => {
        const cityStations = stations.filter(s => s.city === city);
        if (cityStations.length > 0) {
          const ref1 = cityStations[0];
          const ref2 = cityStations[cityStations.length - 1]; // Could be the same if only 1 node
          centers.push({
            id: `sc-${city}-1`,
            name: `${city} Service Center A`,
            longitude: ref1.longitude + 0.05,
            latitude: ref1.latitude + 0.05
          });
          centers.push({
            id: `sc-${city}-2`,
            name: `${city} Service Center B`,
            longitude: ref2.longitude - 0.05,
            latitude: ref2.latitude - 0.05
          });
        }
      });
      setServiceCenters(centers);
    }
  }, [stations, serviceCenters.length]);

  // Generate a random user location near an existing station exactly once when stations load
  useEffect(() => {
    if (stations.length > 0 && !userLocation) {
      // Pick a random station to act as the "city center"
      const randomCityCenter = stations[Math.floor(Math.random() * stations.length)];
      // Offset the user's location by a random small amount (roughly 2-5 miles)
      const latOffset = (Math.random() - 0.5) * 0.05;
      const lonOffset = (Math.random() - 0.5) * 0.05;
      setUserLocation([randomCityCenter.longitude + lonOffset, randomCityCenter.latitude + latOffset]);
    }
  }, [stations, userLocation]);

  // Haversine Distance Formula
  const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Compute the top 3 nearest stations for the Client View
  useEffect(() => {
    if (roleMode === 'client' && userLocation && stations.length > 0) {
      const distances = stations.map(s => {
        const distKm = getDistanceInKm(userLocation[1], userLocation[0], s.latitude, s.longitude);
        return { ...s, distance: distKm };
      });
      const sorted = distances.sort((a, b) => a.distance - b.distance).slice(0, 3);
      setNearestStations(sorted);
    }
  }, [userLocation, stations, roleMode]);

  const handleFindBestRoute = async () => {
    if (!userLocation) return;
    setIsRouting(true);

    // Find the best station by weighing distance and price
    // Filter out broken/offline stations
    const healthyStations = stations.filter(s => !s.needs_maintenance && s.utilization_rate < 0.90);

    let optimalStation = null;
    let bestScore = Infinity;

    healthyStations.forEach(s => {
      const distKm = getDistanceInKm(userLocation[1], userLocation[0], s.latitude, s.longitude);
      // Heuristic Score: 10km of driving roughly equals $1 penalty
      // Lower score is better
      const price = s.current_price || 0.45;
      const score = (distKm / 10) + price;

      if (score < bestScore) {
        bestScore = score;
        optimalStation = s;
      }
    });

    if (optimalStation) {
      // Fetch precise turn-by-turn geometry from Open Source Routing Machine
      const url = `https://router.project-osrm.org/route/v1/driving/${userLocation[0]},${userLocation[1]};${optimalStation.longitude},${optimalStation.latitude}?geometries=geojson&overview=full`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          setBestRoute({
            type: 'Feature',
            geometry: data.routes[0].geometry
          });
          setPopupInfo(optimalStation); // Auto-open the popup for the destination
        }
      } catch (err) {
        console.error("Failed to fetch OSRM route:", err);
      }
    }
    setIsRouting(false);
  };

  const handleDispatchTechnician = async () => {
    if (!popupInfo) return;
    setIsDispatching(true);

    // Find the nearest service center
    let nearestCenter = null;
    let minDistance = Infinity;
    serviceCenters.forEach(sc => {
      const dist = getDistanceInKm(popupInfo.latitude, popupInfo.longitude, sc.latitude, sc.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestCenter = sc;
      }
    });

    if (nearestCenter) {
      // Fetch precise turn-by-turn geometry for the Technician
      const url = `https://router.project-osrm.org/route/v1/driving/${nearestCenter.longitude},${nearestCenter.latitude};${popupInfo.longitude},${popupInfo.latitude}?geometries=geojson&overview=full`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          setTechnicianRoute({
            type: 'Feature',
            geometry: data.routes[0].geometry
          });
        }
      } catch (err) {
        console.error("Failed to fetch OSRM route for tech:", err);
      }
    }
    setIsDispatching(false);
  };

  const points = useMemo(() => {
    return stations.map(station => {
      let category = 'healthy';
      if (station.risk_score > 0.6) category = 'critical';
      else if (station.risk_score > 0.4) category = 'warning';

      return {
        type: "Feature",
        properties: {
          cluster: false,
          stationId: station.station_id,
          category,
          station
        },
        geometry: {
          type: "Point",
          coordinates: [station.longitude, station.latitude]
        }
      };
    });
  }, [stations]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom,
    options: superclusterOptions
  });

  const clusterMarkers = clusters.map(cluster => {
    const [longitude, latitude] = cluster.geometry.coordinates;
    const { cluster: isCluster, point_count } = cluster.properties;

    if (isCluster) {
      const { healthy, warning, critical } = cluster.properties;
      const total = healthy + warning + critical;

      const healthyPct = (healthy / total) * 100;
      const warningPct = (warning / total) * 100;
      const criticalPct = (critical / total) * 100;

      const gradient = `conic-gradient(
        #10B981 0% ${healthyPct}%, 
        #F59E0B ${healthyPct}% ${healthyPct + warningPct}%, 
        #F43F5E ${healthyPct + warningPct}% 100%
      )`;

      const size = 30 + (point_count / points.length) * 40;

      return (
        <Marker key={`cluster-${cluster.id}`} latitude={latitude} longitude={longitude}>
          <div
            className="rounded-full shadow-lg border-2 border-white/80 cursor-pointer flex justify-center items-center text-[10px] font-bold transition-transform hover:scale-110 text-slate-800"
            style={{
              width: `${size}px`, height: `${size}px`,
              background: gradient
            }}
            onClick={e => {
              if (!mapRef.current) return;

              const currentZoom = mapRef.current.getZoom();
              // Calculate the exact zoom level required to break apart this specific cluster
              let expansionZoom;
              try {
                expansionZoom = Math.min(
                  supercluster.getClusterExpansionZoom(cluster.id),
                  50 // Max zoom map limit
                );
              } catch (err) {
                // Fallback if supercluster fails to calculate
                expansionZoom = currentZoom + 3;
              }

              // If the expansion zoom is somehow less than or equal to current zoom, force a zoom in
              if (expansionZoom <= currentZoom) {
                expansionZoom = currentZoom + 2.5;
              }

              console.log(`Zooming into cluster ${cluster.id} from zoom ${currentZoom} to ${expansionZoom}`);

              mapRef.current.flyTo({
                center: [longitude, latitude],
                zoom: expansionZoom,
                speed: 1.2,
                curve: 1.4,
                essential: true
              });
            }}
          >
            <div className="bg-[#FDFBF7]/90 rounded-full w-[80%] h-[80%] flex items-center justify-center pointer-events-none">
              {point_count}
            </div>
          </div>
        </Marker >
      );
    }

    // Single point rendering
    const station = cluster.properties.station;
    let color = '#10B981'; // Emerald 500
    if (station.risk_score > 0.6) color = '#F43F5E'; // Rose 500
    else if (station.risk_score > 0.4) color = '#F59E0B'; // Amber 500

    return (
      <Marker
        key={`station-${station.station_id}`}
        longitude={station.longitude}
        latitude={station.latitude}
        anchor="bottom"
        onClick={e => {
          e.originalEvent.stopPropagation();
          setPopupInfo(station);
        }}
      >
        <div className="relative flex items-center justify-center">
          {station.risk_score > 0.45 && station.revenue_at_risk_daily > 10 && (
            <div className="absolute w-8 h-8 rounded-full border-2 border-rose-500/50 animate-ping" />
          )}
          <div
            className={`rounded-full border-2 border-white/70 shadow-lg cursor-pointer transition-transform hover:scale-125 hover:z-50 ${station.risk_score > 0.45 ? 'w-5 h-5' : 'w-4 h-4'}`}
            style={{ backgroundColor: color }}
          />
        </div>
      </Marker>
    );
  });

  // Calculate optimal maintenance route (highest revenue at risk first)
  const [showRoute, setShowRoute] = useState(false);
  const routeData = useMemo(() => {
    const failingStations = stations.filter(s => s.needs_maintenance || s.risk_score > 0.45);
    // Sort by revenue at risk descending to prioritize the most expensive outages
    const sortedStations = failingStations.sort((a, b) => (b.revenue_at_risk_daily || 0) - (a.revenue_at_risk_daily || 0));

    const coordinates = sortedStations.map(s => [s.longitude, s.latitude]);

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      }
    };
  }, [stations]);

  const routeLayerStyle = {
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#F43F5E', // Rose 500
      'line-width': 3,
      'line-dasharray': [2, 2],
      'line-opacity': 0.8
    }
  };

  const bestRouteLayerStyle = {
    id: 'best-route-line',
    type: 'line',
    source: 'best-route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#3B82F6', // Blue 500
      'line-width': 5,
      'line-opacity': 0.9
    }
  };

  const techRouteLayerStyle = {
    id: 'tech-route-line',
    type: 'line',
    source: 'tech-route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#F59E0B', // Amber 500
      'line-width': 5,
      'line-opacity': 0.9
    }
  };

  return (
    <div className="w-full h-full relative border border-warm-300 rounded-md overflow-hidden shadow-2xl">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -95.7129,
          latitude: 37.0902,
          zoom: 3.5,
          pitch: 0,
        }}
        onMove={e => {
          if (mapRef.current) {
            setBounds(mapRef.current.getMap().getBounds().toArray().flat());
            setZoom(e.viewState.zoom);
          }
        }}
        onLoad={() => {
          if (mapRef.current) {
            setBounds(mapRef.current.getMap().getBounds().toArray().flat());
            setZoom(mapRef.current.getMap().getZoom());
          }
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        mapLib={maplibregl}
        interactiveLayerIds={['data']}
      >
        <NavigationControl position="top-right" />

        {roleMode === 'admin' && showRoute && routeData.geometry.coordinates.length > 1 && (
          <Source id="route" type="geojson" data={routeData}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {roleMode === 'client' && bestRoute && (
          <Source id="best-route" type="geojson" data={bestRoute}>
            <Layer {...bestRouteLayerStyle} />
          </Source>
        )}

        {roleMode === 'admin' && technicianRoute && (
          <Source id="tech-route" type="geojson" data={technicianRoute}>
            <Layer {...techRouteLayerStyle} />
          </Source>
        )}

        {/* The User's Car Pin */}
        {roleMode === 'client' && userLocation && (
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-8 h-8 rounded-full border-2 border-blue-400/50 animate-ping" />
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.5)] z-50 transition-transform hover:scale-125" />
            </div>
          </Marker>
        )}

        {/* Service Centers */}
        {roleMode === 'admin' && serviceCenters.map(sc => (
          <Marker key={sc.id} longitude={sc.longitude} latitude={sc.latitude} anchor="bottom">
            <div className="text-2xl filter drop-shadow shadow-black/50 hover:scale-125 transition-transform cursor-pointer" title={sc.name}>
              🏠
            </div>
          </Marker>
        ))}

        {clusterMarkers}

        {popupInfo && (
          <Popup
            anchor="top"
            longitude={Number(popupInfo.longitude)}
            latitude={Number(popupInfo.latitude)}
            onClose={() => setPopupInfo(null)}
            className="z-50"
            closeButton={false}
          >
            <div className="p-3 bg-warm-100 border border-warm-400 rounded-md shadow-2xl min-w-[200px] text-warm-900">
              <div className="font-bold text-sm mb-1 text-warm-900">{popupInfo.station_name}</div>
              <div className="text-xs text-warm-600 mb-3">{popupInfo.network}</div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-warm-600">Risk Score:</span>
                  <span className={`font-bold ${popupInfo.risk_score > 0.4 ? 'text-rose-400' : 'text-peach-600'}`}>
                    {(popupInfo.risk_score * 100).toFixed(1)}%
                  </span>
                </div>

                {/* Anomaly Auto-Diagnosis */}
                {popupInfo.needs_maintenance && popupInfo.root_cause_diagnosis && (
                  <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded text-xs">
                    <span className="text-rose-400 font-semibold block mb-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> Auto-Diagnosis
                    </span>
                    <span className="text-warm-800">{popupInfo.root_cause_diagnosis}</span>
                  </div>
                )}

                <div className="flex justify-between border-b border-warm-300 pb-1">
                  <span className="text-warm-600">Price/kWh</span>
                  <span className="font-medium text-amber-400">${popupInfo.current_price?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex flex-col border-b border-warm-300 pb-1">
                  <div className="flex justify-between">
                    <span className="text-warm-600">Live Utilization</span>
                    <span className="font-medium">{(popupInfo.utilization_rate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-warm-600 text-[10px] italic">Historical Avg</span>
                    <span className="font-medium text-[10px] text-warm-600">{(popupInfo.historical_utilization_avg * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-warm-600">Temp</span>
                  <span className="font-medium">{popupInfo.temperature_f}°F</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {/* <button
                                    onClick={() => onSimulate(popupInfo.station_id)}
                                    className="flex-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 text-xs font-bold py-1.5 px-3 rounded transition-colors"
                                >
                                    Stress
                                </button> */}
                {popupInfo.risk_score > 0.4 && roleMode === 'admin' && (
                  <button
                    onClick={() => onHeal(popupInfo.station_id)}
                    className="flex-1 bg-green-400/70 hover:bg-[#FFCDD2]/80 text-slate-900/80 text-xs font-bold py-1.5 px-3 rounded transition-colors shadow-lg shadow-[#FFCDD2]/20"
                  >
                    Surge Price
                  </button>
                )}
              </div>

              {/* Dispatch Technician (Admin Only) */}
              {roleMode === 'admin' && popupInfo.risk_score > 0.6 && (
                <button
                  onClick={handleDispatchTechnician}
                  disabled={isDispatching}
                  className="mt-2 w-full flex-1 bg-[#FB923C] hover:bg-[#FB923C]/80 text-slate-900/80 text-xs font-bold py-2 px-3 rounded transition-colors shadow-lg shadow-[#FB923C]/20 flex justify-center items-center gap-2"
                >
                  {isDispatching ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> : 'Dispatch Technician'}
                </button>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {/* Top Left Floating Panel (Nearest Stations) */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        {roleMode === 'client' && nearestStations.length > 0 && (
          <div className="bg-[#FDFBF7]/90 backdrop-blur-md border border-[#C7BFA5] rounded-xl p-3 shadow-xl pointer-events-auto w-64 transition-all">
            <h3 className="text-sm font-bold text-slate-900/80 mb-2 flex items-center gap-1">
              Nearest Stations
            </h3>
            <div className="space-y-2">
              {nearestStations.map((station, idx) => (
                <div key={idx} className="bg-[#EBE7DE]/80 border border-[#C7BFA5] rounded-lg p-2.5 text-xs relative cursor-pointer hover:bg-[#DBD6C9]/60 transition-colors shadow-sm"
                  onClick={() => {
                    setPopupInfo(station);
                    mapRef.current?.flyTo({ center: [station.longitude, station.latitude], zoom: 14, duration: 800 });
                  }}>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="font-bold text-slate-900/80 truncate pr-2 leading-tight max-w-[150px]">{station.station_name}</span>
                    <span className="text-[10px] font-bold text-slate-900/50 bg-[#C7BFA5]/20 px-1.5 py-0.5 rounded whitespace-nowrap">{station.distance.toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className={`${station.risk_score > 0.45 ? 'text-rose-500 font-bold' : 'text-slate-900/70 font-medium'}`}>
                      Stress: {(station.utilization_rate * 100).toFixed(0)}%
                    </span>
                    <span className="font-bold text-amber-500/90 text-xs">${station.current_price?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        {roleMode === 'client' && (
          <button
            onClick={handleFindBestRoute}
            disabled={isRouting || !userLocation}
            className="px-4 py-3 rounded-lg font-bold text-sm shadow-xl transition-all border bg-blue-600 hover:bg-blue-500 text-white border-blue-400 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isRouting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              'Find Optimal Charger'
            )}
          </button>
        )}

        {roleMode === 'admin' && (
          <button
            onClick={() => setShowRoute(!showRoute)}
            className={`px-4 py-2 rounded-lg font-bold text-sm shadow-xl transition-all border ${showRoute
              ? 'bg-rose-500/20 text-rose-400 border-rose-500 hover:bg-rose-500/30'
              : 'bg-warm-100/80 text-warm-900 border-warm-400 hover:bg-warm-200'
              }`}
          >
            {showRoute ? 'Hide Priority Route' : 'Show Revenue Priority Route'}
          </button>
        )}
      </div>
    </div>
  );
}
