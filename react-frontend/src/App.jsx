import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { AlertCircle, Zap, Activity, RefreshCw, MessageSquare } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast, { Toaster } from 'react-hot-toast';
import Mapillary from './components/Mapillary';
import ChatAgent from './components/ChatAgent';

export default function App() {
  const [stations, setStations] = useState([]);
  const [availableTimeframes, setAvailableTimeframes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('0');
  const [isRetraining, setIsRetraining] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [logs, setLogs] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Dashboard Views
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'historical'
  const [roleMode, setRoleMode] = useState('admin'); // 'admin' | 'client'

  const fetchStations = async () => {
    setLoading(true);
    try {
      let url = `http://localhost:8000/api/stations?timeframe=${timeframe}`;
      if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      const response = await axios.get(url);
      setStations(response.data.stations || []);
      if (response.data.timeframes) {
        setAvailableTimeframes(response.data.timeframes);
      }
    } catch (err) {
      console.error("Failed to fetch stations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [timeframe, roleMode]); // Added roleMode to dependencies to refetch when role changes

  useEffect(() => {
    if (viewMode === 'historical' || roleMode === 'client') return; // Stop polling if in client mode

    // Poll for live simulation updates and system logs every 10 seconds
    const interval = setInterval(async () => {
      try {
        const now = new Date().toISOString();
        const res = await axios.post('http://localhost:8000/api/simulation/tick', { timestamp: now });
        if (res.data.stations) {
          setStations(res.data.stations);
        }
        const logRes = await axios.get('http://localhost:8000/api/logs');
        if (logRes.data.logs) {
          const newLogs = logRes.data.logs;
          setLogs(prevLogs => {
            // Check if new logs were added that mention a traffic surge
            if (prevLogs.length > 0 && newLogs.length > prevLogs.length) {
              const latestLog = newLogs[newLogs.length - 1];
              if (latestLog.action === 'TRAFFIC_SURGE_DETECTED' && latestLog.details) {
                const stName = latestLog.details.station?.split('-')[1] || latestLog.details.station;
                toast.error(`Traffic Surge Detected: ${stName}! Auto-Heal engaging...`, {
                  style: { background: '#1e293b', color: '#fb7185', border: '1px solid #9f1239' },
                  duration: 4000
                });
              }
            }
            return newLogs;
          });
        }
      } catch (err) {
        console.error("Live simulation tick failed", err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [viewMode, roleMode]); // Added roleMode to dependencies

  // Toast alerts for high risk stations (above 60%)
  const notifiedHighRiskRef = useRef(new Set());

  useEffect(() => {
    if (!stations || stations.length === 0) return;

    stations.forEach(s => {
      if (s.risk_score > 0.80) {
        if (!notifiedHighRiskRef.current.has(s.station_id)) {
          toast.error(`High Risk Alert: ${s.station_name.split('-')[1] || s.station_name} hit ${(s.risk_score * 100).toFixed(0)}% risk!`, {
            icon: '🚨',
            style: { background: '#1e293b', color: '#fb7185', border: '1px solid #9f1239' },
            duration: 5000
          });
          notifiedHighRiskRef.current.add(s.station_id);
        }
      } else {
        // If it drops below 60%, remove it so it can alert again later if needed
        if (notifiedHighRiskRef.current.has(s.station_id)) {
          notifiedHighRiskRef.current.delete(s.station_id);
        }
      }
    });
  }, [stations]);

  const handleHeal = async (stationId) => {
    try {
      await axios.post(`http://localhost:8000/api/heal/${stationId}`);
      await fetchStations(); // Refresh the map data to see the new prices and lower utilization
    } catch (err) {
      console.error("Failed to trigger self-healing", err);
    }
  };

  const handleSimulate = async (stationId) => {
    try {
      await axios.post(`http://localhost:8000/api/simulate/${stationId}`);
      await fetchStations(); // Refresh to see the spiked metrics
    } catch (err) {
      console.error("Failed to simulate stress", err);
    }
  };

  const handleRetrain = async () => {
    setIsRetraining(true);
    try {
      // Send the POST request to trigger ML retraining
      const res = await axios.post(`http://localhost:8000/api/train`);
      console.log(res.data.message);
      // Re-fetch stations to run them through the freshly loaded model
      await fetchStations();
    } catch (err) {
      console.error("Failed to retrain model", err);
    } finally {
      setIsRetraining(false);
    }
  };

  const highRiskCount = stations.filter(s => s.risk_score > 0.6).length;
  const totalRevenueAtRisk = stations.reduce((acc, s) => acc + (s.needs_maintenance ? (s.revenue_at_risk_daily || 0) : 0), 0);
  const avgUtilization = stations.length > 0 ? (stations.reduce((acc, s) => acc + (s.utilization_rate || 0), 0) / stations.length) : 0;

  // Prepare data for the Bar Chart: Top 5 stations by risk score
  const chartData = [...stations]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 5)
    .map(s => ({
      name: s.station_name.split('-')[1] || s.station_name, // Shorten name for the chart X-axis
      risk: Number((s.risk_score * 100).toFixed(0))
    }));

  return (
    <div className="min-h-screen text-warm-900" style={{background: 'radial-gradient(circle at 70% 30%, var(--color-peach-50) 0%, var(--color-warm-100) 60%, var(--color-peach-100) 100%)'}}>
      <Toaster position="top-right" />
      <header className="border-b border-warm-300 p-4 sticky top-0 bg-warm-50/80 backdrop-blur-md z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap className="text-peach-400" />
            <h1 className="text-xl font-bold tracking-tight text-warm-900">Data Pigeon</h1>
          </div>

          {/* Top Right Controls */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">

            {/* Role Mode Toggle */}
            <div className="flex bg-warm-200/80 p-1 rounded-lg border border-warm-400 w-auto gap-1 mr-4">
              <button
                onClick={() => { setRoleMode('admin'); }}
                className={`px-4 py-1.5 text-sm font-bold transition-all rounded-md flex items-center gap-1 ${roleMode === 'admin' ? 'bg-peach-400 text-warm-900' : 'text-peach-400'}`}
              >
                Admin
              </button>
              <button
                onClick={() => { setRoleMode('client'); setViewMode('live'); }}
                className={`px-4 py-1.5 text-sm font-bold transition-all rounded-md flex items-center gap-1 ${roleMode === 'client' ? 'bg-peach-500 text-warm-900 shadow-md border border-peach-400' : 'text-warm-600 hover:text-warm-900 hover:bg-warm-300/50'}`}
              >
                Client
              </button>
            </div>

            {/* View Mode Toggle */}
            {roleMode === 'admin' && (
              <div className="flex bg-warm-200/80 p-1 rounded-lg border border-warm-400 w-auto gap-1 flex-shrink-0">
                <button
                  onClick={() => { setViewMode('live'); setStartDate(''); setEndDate(''); setTimeframe('0'); fetchStations(); }}
                  className={`px-3 py-1 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${viewMode === 'live' ? 'bg-warm-50 text-peach-600 shadow-md border border-warm-300' : 'text-warm-600 hover:text-warm-900 hover:bg-warm-300/50'}`}
                >
                  <Zap size={14} /> Live View
                </button>
                <button
                  onClick={() => { setViewMode('historical'); }}
                  className={`px-3 py-1 rounded-md text-sm font-bold transition-all flex items-center gap-1 ${viewMode === 'historical' ? 'bg-warm-50 text-indigo-400 shadow-md border border-warm-300' : 'text-warm-600 hover:text-warm-900 hover:bg-warm-300/50'}`}
                >
                  <Activity size={14} /> Historical
                </button>
              </div>
            )}

            {/* Historical Data Filter Tools */}
            {roleMode === 'admin' && viewMode === 'historical' && (
              <>
                <div className="flex bg-warm-200/80 p-1 rounded-lg border border-warm-400 w-auto overflow-x-auto gap-1 hide-scrollbar">
                  {availableTimeframes.filter(tf => tf.id !== '0').map((tf) => (
                    <button
                      key={tf.id}
                      onClick={() => {
                        setStartDate('');
                        setEndDate('');
                        setTimeframe(tf.id);
                      }}
                      className={`whitespace-nowrap py-1 px-3 rounded-md text-sm font-bold transition-all ${timeframe === tf.id && !startDate
                        ? 'bg-warm-50 text-indigo-400 shadow-md border border-warm-300'
                        : 'text-warm-600 hover:text-warm-900 hover:bg-warm-300/50'
                        }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Range Picker */}
                <div className="flex items-center gap-2 bg-warm-100 border border-warm-400 rounded-lg p-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-warm-200 text-warm-800 text-sm px-2 py-1 rounded border-none focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <span className="text-warm-500 text-sm">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-warm-200 text-warm-800 text-sm px-2 py-1 rounded border-none focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    onClick={fetchStations}
                    disabled={!startDate || !endDate}
                    className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-bold px-3 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Activity size={16} className="text-warm-400" /> {stations.length} Active Node{stations.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-2">
              <AlertCircle size={16} className={highRiskCount > 0 ? "text-rose-400" : "text-warm-400"} />
              {highRiskCount} Risk Alerts
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 flex-1 flex flex-col h-[calc(100vh-80px)]">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-peach-400"></div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${roleMode === 'admin' ? 'md:grid-cols-3 gap-6' : 'md:grid-cols-1'} h-full min-h-0`}>

            <div className={`${roleMode === 'admin' ? 'md:col-span-2' : ''} h-full min-h-[500px] rounded-md overflow-hidden border border-warm-300 shadow-2xl`}>
              <div className="h-full relative overflow-hidden flex flex-col">
                <Mapillary
                  stations={stations}
                  roleMode={roleMode}
                  onSimulate={handleSimulate}
                  onHeal={handleHeal}
                />
              </div>
            </div>

            {/* Right Panel: Analytics & Extruded Logs */}
            {roleMode === 'admin' && (
              <div className="flex flex-col gap-6 h-full min-h-0">
                {/* Analytics Top Half */}
                <div className="bg-warm-100 border border-warm-300 rounded-md p-5 shadow-xl flex flex-col gap-4 flex-shrink-0">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-warm-900 flex items-center gap-2"><Activity size={18} /> Predictive Analytics</h3>
                    <button
                      onClick={handleRetrain}
                      disabled={isRetraining}
                      className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={isRetraining ? "animate-spin" : ""} />
                      {isRetraining ? "Training..." : "Retrain Model"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-warm-200/50 p-2 rounded border border-warm-400">
                      <div className="text-[10px] text-warm-600 uppercase tracking-wide">Revenue @ Risk</div>
                      <div className="text-lg font-bold text-rose-400">${totalRevenueAtRisk.toFixed(2)}</div>
                    </div>
                    <div className="bg-warm-200/50 p-2 rounded border border-warm-400">
                      <div className="text-[10px] text-warm-600 uppercase tracking-wide">Avg Utilization</div>
                      <div className="text-lg font-bold text-peach-600">{(avgUtilization * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="h-40 w-full mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }} itemStyle={{ color: '#fb7185' }} cursor={{ fill: '#334155' }} />
                        <Bar dataKey="risk" fill="#fb7185" radius={[4, 4, 0, 0]} name="Risk Score (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-4 overflow-y-auto max-h-[300px] hide-scrollbar">
                    {stations.sort((a, b) => b.risk_score - a.risk_score).slice(0, 3).map(station => (
                      <div key={station.station_id} className="p-3 bg-warm-200/50 rounded-lg border border-warm-400">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-warm-900 text-sm truncate pr-2" title={station.station_name}>{station.station_name}</div>
                          <div className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${station.risk_score > 0.6 ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {(station.risk_score * 100).toFixed(0)}% Risk
                          </div>
                        </div>
                        <div className="text-xs text-warm-600 flex justify-between items-center mt-2">
                          <span>Load: {(station.utilization_rate * 100).toFixed(1)}%</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleSimulate(station.station_id)} className="text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded bg-rose-500/10 transition-colors">Stress</button>
                            {station.risk_score > 0.4 && (
                              <button onClick={() => handleHeal(station.station_id)} className="text-peach-600 hover:text-emerald-300 font-medium px-2 py-1 rounded bg-peach-400/10 transition-colors">Heal</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System Logs Panel - Expanded */}
                <div className="bg-warm-100 border border-warm-300 rounded-md p-5 shadow-xl flex flex-col gap-3 flex-1 min-h-[350px]">
                  <h3 className="font-semibold text-warm-900 flex items-center gap-2">
                    <Activity size={18} /> Live Auto-Heal Logs
                  </h3>
                  <div className="overflow-y-auto space-y-2 text-xs font-mono hide-scrollbar h-full">
                    {logs.length === 0 ? (
                      <div className="text-warm-500 italic mt-2">Waiting for simulation events...</div>
                    ) : (
                      [...logs].slice(-10).reverse().map((log, i) => (
                        <div key={i} className="text-warm-800 border-b border-warm-300 pb-2 mb-2">
                          <div className="flex justify-between">
                            <span className="text-warm-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className="text-peach-600 font-bold">{log.action}</span>
                          </div>
                          {log.action === 'TRAFFIC_SURGE_DETECTED' && log.details ? (
                            <div className="mt-1 space-y-0.5 bg-warm-200/50 p-1.5 rounded border border-amber-900/30">
                              <div className="flex justify-between">
                                <span className="truncate pr-2 max-w-[120px]" title={log.details.station}>
                                  Spike: {log.details.station?.split('-')[1] || log.details.station}
                                </span>
                                <span className="text-amber-400 font-medium">98% Load</span>
                              </div>
                              <div className="text-[10px] text-warm-600 mt-1">{log.details.warning}</div>
                            </div>
                          ) : log.details && log.details.stressed_station ? (
                            <div className="mt-1 space-y-0.5 bg-warm-200/50 p-1.5 rounded">
                              <div className="flex justify-between">
                                <span className="truncate pr-2 max-w-[120px]" title={log.details.stressed_station}>
                                  Surge: {log.details.stressed_station?.split('-')[1] || log.details.stressed_station}
                                </span>
                                <span className="text-rose-400 font-medium">{log.details.stressed_price_increase}</span>
                              </div>
                              {log.details.rerouted_station !== "None" && (
                                <div className="flex justify-between mt-0.5 border-t border-warm-400/50 pt-0.5">
                                  <span className="truncate pr-2 max-w-[120px]" title={log.details.rerouted_station}>
                                    Reroute: {log.details.rerouted_station?.split('-')[1] || log.details.rerouted_station}
                                  </span>
                                  <span className="text-peach-600 font-medium">{log.details.rerouted_price_decrease}</span>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Floating Chat Bubble */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {isChatOpen && (
          <div className="w-[350px] shadow-2xl animate-fade-in-up origin-bottom-right">
            <ChatAgent />
          </div>
        )}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`p-4 rounded-full shadow-2xl shadow-peach-400/20 transition-all hover:scale-105 active:scale-95 ${isChatOpen ? 'bg-warm-200 text-warm-600 border border-warm-400' : 'bg-peach-400 text-warm-900'}`}
        >
          <MessageSquare size={24} />
        </button>
      </div>
    </div>
  );
}

