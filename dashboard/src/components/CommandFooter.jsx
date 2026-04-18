/**
 * CommandFooter — replaces ThreatLegend + LiveIndicator
 * Slim footer bar with: threat type legend, live status, system health.
 */
import { useAlertStore, SEVERITY_COLOR } from '../store.js'

const THREATS = [
  { key: 'brute_force',      icon: '🔑', name: 'Brute Force',     mitre: 'T1110', color: '#ef4444' },
  { key: 'c2_beacon',        icon: '📡', name: 'C2 Beaconing',    mitre: 'T1071', color: '#f97316' },
  { key: 'exfiltration',     icon: '📤', name: 'Exfiltration',    mitre: 'T1048', color: '#eab308' },
  { key: 'lateral_movement', icon: '🔀', name: 'Lateral Movement',mitre: 'T1021', color: '#9d4edd' },
  { key: '_fp',              icon: '✓',  name: 'False Positive',  mitre: '—',     color: '#00f5ff' },
]

export default function CommandFooter({ readyState }) {
  const alerts  = useAlertStore(s => s.alerts)
  const metrics = useAlertStore(s => s.metrics)
  const live    = readyState === 1

  // Count per threat type
  const counts = {}
  for (const a of alerts) {
    if (a.threat_type) counts[a.threat_type] = (counts[a.threat_type] ?? 0) + 1
    if (a.is_false_positive_candidate) counts['_fp'] = (counts['_fp'] ?? 0) + 1
  }

  return (
    <div className="flex-none border-t border-[rgba(0,245,255,0.06)]
                    bg-[rgba(1,4,9,0.8)] backdrop-blur-xl px-4 py-2">
      <div className="flex items-center gap-2">

        {/* System label */}
        <div className="flex items-center gap-2 pr-3 border-r border-[rgba(0,245,255,0.07)] flex-none">
          <div className={`relative w-2 h-2 rounded-full flex-none ${live ? 'bg-[#39ff14] pulse-live' : 'bg-slate-600'}`}/>
          <div className="flex flex-col leading-none">
            <span className={`text-[10px] font-bold tracking-widest font-orbitron ${live ? 'text-[#39ff14]' : 'text-slate-500'}`}>
              {live ? 'LIVE' : 'RECONNECTING'}
            </span>
            <span className="text-[8px] text-[#1a3050]">SENTINEL</span>
          </div>
        </div>

        {/* EPS readout */}
        <div className="flex-none px-3 border-r border-[rgba(0,245,255,0.07)]">
          <span className="font-mono text-[10px] font-bold text-[#00f5ff] tabular-nums">
            {Number(metrics.eps ?? 0).toFixed(0)}
          </span>
          <span className="text-[9px] text-[#1a3050] ml-1">EPS</span>
        </div>

        {/* Threat type legend */}
        <div className="flex items-center gap-1 flex-1 flex-wrap">
          {THREATS.map(({ key, icon, name, mitre, color }) => {
            const count = counts[key] ?? 0
            return (
              <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded
                                        bg-[rgba(0,245,255,0.02)] border border-transparent
                                        hover:border-[rgba(0,245,255,0.08)] transition-colors">
                <span className="text-xs">{icon}</span>
                <span className="text-[10px] font-semibold" style={{ color }}>{name}</span>
                {mitre !== '—' && (
                  <span className="text-[8px] px-1 py-0.5 rounded"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
                    {mitre}
                  </span>
                )}
                {count > 0 && (
                  <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color }}>
                    {count.toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* System tags */}
        <div className="flex-none flex items-center gap-2 pl-2 border-l border-[rgba(0,245,255,0.07)]">
          <span className="text-[9px] text-[#1a3050] border border-[rgba(0,245,255,0.06)]
                           px-2 py-0.5 rounded font-mono">MITRE ATT&CK v14</span>
          <span className="text-[9px] text-[#1a3050] border border-[rgba(0,245,255,0.06)]
                           px-2 py-0.5 rounded font-mono">ECS 8.11</span>
        </div>
      </div>
    </div>
  )
}
