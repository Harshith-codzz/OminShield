import { useAlertStore } from '../store.js'

const SEVERITY_COLOR = { Critical:'#ef4444', High:'#f97316', Medium:'#eab308', Low:'#22c55e' }

const CARDS = [
  {
    key: 'total', label: 'Events Ingested', icon: '◈',
    accent: '#22d3ee', sub: 'all time', gradient: 'from-cyan-900/40 to-transparent',
  },
  {
    key: 'eps', label: 'Events / sec', icon: '⚡',
    accent: '#818cf8', sub: '10s rolling', gradient: 'from-indigo-900/40 to-transparent',
    fmt: v => Number(v).toFixed(1),
  },
  {
    key: 'critical', label: 'Critical Threats', icon: '◉',
    accent: '#ef4444', sub: 'score > 0.85', gradient: 'from-red-900/40 to-transparent',
  },
  {
    key: 'high', label: 'High Severity', icon: '◈',
    accent: '#f97316', sub: 'score > 0.65', gradient: 'from-orange-900/40 to-transparent',
  },
]

export default function MetricCards() {
  const metrics = useAlertStore(s => s.metrics)

  return (
    <div className="grid grid-cols-4 gap-3">
      {CARDS.map(({ key, label, icon, accent, sub, gradient, fmt }) => {
        const raw = metrics[key] ?? 0
        const val = fmt ? fmt(raw) : Number(raw).toLocaleString()
        return (
          <div
            key={key}
            className={`sensor-card bg-gradient-to-br ${gradient} p-4 flex flex-col gap-2`}
            style={{ '--card-accent': accent, boxShadow: `0 4px 32px ${accent}18` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: accent, opacity: 0.85 }}>
                {label}
              </span>
              <span className="text-base opacity-60" style={{ color: accent }}>{icon}</span>
            </div>

            <div className="tabular-nums font-mono text-4xl font-bold leading-none"
                 style={{ color: accent, textShadow: `0 0 24px ${accent}55` }}>
              {val}
            </div>

            {/* Bottom accent bar */}
            <div className="flex items-center gap-2 mt-auto pt-1">
              <div className="h-1 flex-1 rounded-full overflow-hidden"
                   style={{ background: `${accent}18` }}>
                <div className="h-full rounded-full"
                     style={{
                       width: key === 'eps' ? `${Math.min(100, (raw/20)*100)}%` : '100%',
                       background: `linear-gradient(90deg, ${accent}88, ${accent})`,
                       transition: 'width 0.6s ease',
                     }} />
              </div>
              <span className="text-[10px] text-slate-500">{sub}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
