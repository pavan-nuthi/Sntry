import fs from 'fs';

const content = fs.readFileSync('src/App.jsx', 'utf8');

const startTag = "{roleMode === 'admin' && (";
const endTag = "{/* Floating Chat Bubble */}";

let startIdx = content.indexOf(startTag);
let endIdx = content.indexOf(endTag);

if (startIdx !== -1 && endIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);

    // The exact right panel code, properly formatted
    const newPanel = `
                        {roleMode === 'admin' && (
                            <div className="flex flex-col gap-6 h-full min-h-0">
                                {/* Analytics Top Half */}
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4 flex-shrink-0">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-semibold text-white flex items-center gap-2"><Activity size={18} /> Predictive Analytics</h3>
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
                                        <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Revenue @ Risk</div>
                                            <div className="text-lg font-bold text-rose-400">\${totalRevenueAtRisk.toFixed(2)}</div>
                                        </div>
                                        <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
                                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Utilization</div>
                                            <div className="text-lg font-bold text-emerald-400">{(avgUtilization * 100).toFixed(1)}%</div>
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
                                            <div key={station.station_id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="font-medium text-slate-200 text-sm truncate pr-2" title={station.station_name}>{station.station_name}</div>
                                                    <div className={\`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap \${station.risk_score > 0.6 ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}\`}>
                                                        {(station.risk_score * 100).toFixed(0)}% Risk
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-400 flex justify-between items-center mt-2">
                                                    <span>Load: {(station.utilization_rate * 100).toFixed(1)}%</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleSimulate(station.station_id)} className="text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded bg-rose-500/10 transition-colors">Stress</button>
                                                        {station.risk_score > 0.4 && (
                                                            <button onClick={() => handleHeal(station.station_id)} className="text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded bg-emerald-500/10 transition-colors">Heal</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* System Logs Panel - Expanded */}
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3 flex-1 min-h-[350px]">
                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        <Activity size={18} /> Live Auto-Heal Logs
                                    </h3>
                                    <div className="overflow-y-auto space-y-2 text-xs font-mono hide-scrollbar h-full">
                                        {logs.length === 0 ? (
                                            <div className="text-slate-500 italic mt-2">Waiting for simulation events...</div>
                                        ) : (
                                            [...logs].reverse().map((log, i) => (
                                                <div key={i} className="text-slate-300 border-b border-slate-800 pb-2 mb-2">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                                        <span className="text-emerald-400 font-bold">{log.action}</span>
                                                    </div>
                                                    {log.action === 'TRAFFIC_SURGE_DETECTED' && log.details ? (
                                                        <div className="mt-1 space-y-0.5 bg-slate-800/50 p-1.5 rounded border border-amber-900/30">
                                                            <div className="flex justify-between">
                                                                <span className="truncate pr-2 max-w-[120px]" title={log.details.station}>
                                                                    Spike: {log.details.station?.split('-')[1] || log.details.station}
                                                                </span>
                                                                <span className="text-amber-400 font-medium">98% Load</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 mt-1">{log.details.warning}</div>
                                                        </div>
                                                    ) : log.details && log.details.stressed_station ? (
                                                        <div className="mt-1 space-y-0.5 bg-slate-800/50 p-1.5 rounded">
                                                            <div className="flex justify-between">
                                                                <span className="truncate pr-2 max-w-[120px]" title={log.details.stressed_station}>
                                                                    Surge: {log.details.stressed_station?.split('-')[1] || log.details.stressed_station}
                                                                </span>
                                                                <span className="text-rose-400 font-medium">{log.details.stressed_price_increase}</span>
                                                            </div>
                                                            {log.details.rerouted_station !== "None" && (
                                                                <div className="flex justify-between mt-0.5 border-t border-slate-700/50 pt-0.5">
                                                                    <span className="truncate pr-2 max-w-[120px]" title={log.details.rerouted_station}>
                                                                        Reroute: {log.details.rerouted_station?.split('-')[1] || log.details.rerouted_station}
                                                                    </span>
                                                                    <span className="text-emerald-400 font-medium">{log.details.rerouted_price_decrease}</span>
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

            `;

    fs.writeFileSync('src/App.jsx', before + newPanel.trimStart() + after);
    console.log("Successfully patched App.jsx");
} else {
    console.log("Could not find start or end tags");
}
