/**
 * StatusRibbon — replaces MetricCards
 * A horizontal strip of 4 metric cards each with a live SVG sparkline.
 * Numbers animate via tabular-nums. Sparklines draw themselves as data arrives.
 */
import { useMemo } from 'react'
import { useAlertStore } from '../store.js'

const SEV_COLOR = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

const CARDS = [
  {
    key:      'total',
    label:    'Events Ingested',
    sub:      'all time',
    color:    '#00f5ff',
    sparkKey: 'total',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
        <circle cx="9" cy="9" r="3" fill="currentColor" opacity="0.7"/>
      </svg>
    ),
  },
  {
    key:      'eps',
    label:    'Events / sec',
    sub:      'live throughput',
    color:    '#9d4edd',
    sparkKey: 'eps',
    fmt:      v => Number(v).toFixed(0),
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 14L6 8L10 11L14 4L16 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="14,2 18,6 14,6" fill="currentColor" opacity="0.7"/>
      </svg>
    ),
  },
  {
    key:      'critical',
    label:    'Critical Threats',
    sub:      'score > 0.85',
    color:    '#ef4444',
    sparkKey: 'critical',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2L16 14H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
        <line x1="9" y1="8" x2="9" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="9" cy="13" r="0.8" fill="currentColor"/>
      </svg>
    ),
  },
  {
    key:      'high',
    label:    'High Severity',
    sub:      'score > 0.65',
    color:    '#f97316',
    sparkKey: 'high',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="10" width="3" height="6" rx="1" fill="currentColor" opacity="0.4"/>
        <rect x="7" y="6"  width="3" height="10" rx="1" fill="currentColor" opacity="0.65"/>
        <rect x="12" y="2" width="3" height="14" rx="1" fill="currentColor"/>
      </svg>
    ),
  },
]

/** Build an SVG polyline path string from an array of values */
function buildSparkPath(values, w, h) {
  if (!values || values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = (max - min) || 1
  const step  = w / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / range) * h * 0.85 - h * 0.075
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function Sparkline({ values, color, w = 90, h = 32 }) {
  const path = useMemo(() => buildSparkPath(values, w, h), [values, w, h])
  if (!path) return <svg width={w} height={h} />

  const areaPath = path + ` L${w},${h} L0,${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#sg-${color.replace('#','')})`}/>
      {/* Line */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="sparkline-path"/>
      {/* Latest dot */}
      {values.length >= 2 && (() => {
        const min   = Math.min(...values)
        const max   = Math.max(...values)
        const range = (max - min) || 1
        const lastY = h - ((values[values.length - 1] - min) / range) * h * 0.85 - h * 0.075
        return <circle cx={w} cy={lastY.toFixed(1)} r="2.5" fill={color}/>
      })()}
    </svg>
  )
}

export default function StatusRibbon() {
  const metrics   = useAlertStore(s => s.metrics)
  const sparklines = useAlertStore(s => s.sparklines)

  return (
    <div className="flex gap-2">
      {CARDS.map(({ key, label, sub, color, sparkKey, fmt, icon }) => {
        const raw = metrics[key] ?? 0
        const val = fmt ? fmt(raw) : Number(raw).toLocaleString()

        return (
          <div
            key={key}
            className="ribbon-card flex-1 px-4 py-3 flex items-center gap-4"
            style={{ '--card-glow': `${color}08` }}
          >
            {/* Icon */}
            <div className="flex-none opacity-60" style={{ color }}>
              {icon}
            </div>

            {/* Number + label */}
            <div className="flex-1 min-w-0">
              <div
                className="font-orbitron font-bold tabular-nums leading-none"
                style={{
                  fontSize: 26,
                  color,
                  textShadow: `0 0 20px ${color}60`,
                }}
              >
                {val}
              </div>
              <div className="text-[10px] uppercase tracking-widest mt-1 font-semibold"
                   style={{ color, opacity: 0.55 }}>
                {label}
              </div>
              <div className="text-[9px] text-[#2a4060] mt-0.5">{sub}</div>
            </div>

            {/* Sparkline */}
            <div className="flex-none opacity-80">
              <Sparkline values={sparklines[sparkKey] ?? []} color={color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
