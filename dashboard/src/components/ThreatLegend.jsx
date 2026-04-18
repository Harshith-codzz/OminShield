/**
 * ThreatLegend — always-visible strip explaining all 4 threat types + FP.
 * Unique to OmniShield AI — makes the system EXPLAINABLE at a glance.
 */
import { useAlertStore } from '../store.js'

const THREAT_DEFS = [
  {
    key:      'brute_force',
    icon:     '🔑',
    name:     'Brute Force',
    mitre:    'T1110',
    tactic:   'Credential Access',
    color:    '#ef4444',
    explain:  'Attacker hammers login attempts — trying thousands of passwords until one works.',
  },
  {
    key:      'c2_beacon',
    icon:     '📡',
    name:     'C2 Beaconing',
    mitre:    'T1071',
    tactic:   'Command & Control',
    color:    '#f97316',
    explain:  'Compromised host secretly "phones home" to a hacker\'s server every few seconds.',
  },
  {
    key:      'exfiltration',
    icon:     '📤',
    name:     'Exfiltration',
    mitre:    'T1048',
    tactic:   'Data Theft',
    color:    '#eab308',
    explain:  'Large volumes of data being shipped out of the network to an external destination.',
  },
  {
    key:      'lateral_movement',
    icon:     '🔀',
    name:     'Lateral Movement',
    mitre:    'T1021',
    tactic:   'Pivot & Spread',
    color:    '#818cf8',
    explain:  'Intruder pivots from one internal machine to another, spreading through the network.',
  },
  {
    key:      '_fp',
    icon:     '✓',
    name:     'False Positive',
    mitre:    '—',
    tactic:   'Suppressed',
    color:    '#22d3ee',
    explain:  'Admin\'s scheduled nightly backup — looks like exfiltration but is legitimate.',
  },
]

export default function ThreatLegend() {
  const alerts  = useAlertStore(s => s.alerts)

  // Count per threat type from the ring buffer
  const counts = {}
  for (const a of alerts) {
    if (a.threat_type) counts[a.threat_type] = (counts[a.threat_type] ?? 0) + 1
    if (a.is_false_positive_candidate) counts['_fp'] = (counts['_fp'] ?? 0) + 1
  }

  return (
    <div className="flex-none border-t border-[rgba(34,211,238,0.08)] bg-[rgba(2,4,15,0.7)]
                    backdrop-blur-xl px-4 py-2">
      <div className="flex items-stretch gap-2">
        {/* Section label */}
        <div className="flex items-center pr-3 border-r border-[rgba(34,211,238,0.1)]">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
            Threat<br/>Types
          </span>
        </div>

        {THREAT_DEFS.map(({ key, icon, name, mitre, tactic, color, explain }) => {
          const count = counts[key] ?? 0
          return (
            <div
              key={key}
              className="flex-1 flex items-start gap-2 px-3 py-1.5 rounded-lg
                         border border-transparent transition-colors hover:border-[rgba(34,211,238,0.12)]
                         hover:bg-[rgba(34,211,238,0.02)]"
            >
              {/* Icon + count */}
              <div className="flex-none flex flex-col items-center gap-0.5 pt-0.5">
                <span className="text-base leading-none">{icon}</span>
                <span className="font-mono text-[10px] font-bold tabular-nums"
                      style={{ color }}>
                  {count > 0 ? count.toLocaleString() : '0'}
                </span>
              </div>

              {/* Text */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold" style={{ color }}>{name}</span>
                  {mitre !== '—' && (
                    <span className="badge text-[9px]"
                          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                      {mitre}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-600">{tactic}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight line-clamp-2">
                  {explain}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
