import { useState, useCallback } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { useAlertStore } from '../store.js'

const SEV_COLOR = { Critical:'#ef4444', High:'#f97316', Medium:'#eab308', Low:'#22c55e' }
const SEV_BG    = { Critical:'bg-crit-dim', High:'bg-high-dim', Medium:'bg-med-dim', Low:'bg-low-dim' }
const FILTERS   = ['All','Critical','High','Medium','Low']

const THREAT_ICON = { brute_force:'🔑', c2_beacon:'📡', exfiltration:'📤', lateral_movement:'🔀' }

// One-line plain-English summary shown directly in every alert row
const THREAT_PLAIN = {
  brute_force:      'Password hammering attack on SSH',
  c2_beacon:        'Malware phoning home to attacker server',
  exfiltration:     'Large data transfer to external host',
  lateral_movement: 'Attacker pivoting inside the network',
}

const ITEM_HEIGHT = 86

function ConfBar({ score, color }) {
  return (
    <div className="conf-bar-track w-full" title={`Confidence: ${Math.round(score*100)}%`}>
      <div
        className="conf-bar-fill"
        style={{ width: `${Math.round(score * 100)}%`, background: color }}
      />
    </div>
  )
}

function AlertRow({ index, style, data }) {
  const { items, onSelect } = data
  const a = items[index]
  if (!a) return null

  const color   = SEV_COLOR[a.severity] ?? '#64748b'
  const icon    = THREAT_ICON[a.threat_type] ?? '⚠'
  const plain   = THREAT_PLAIN[a.threat_type] ?? (a.is_false_positive_candidate ? 'Admin scheduled backup (FP)' : 'Unknown activity')
  const time    = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--:--:--'
  const confPct = a.confidence_score != null ? Math.round(a.confidence_score * 100) + '%' : 'N/A'

  return (
    <div
      style={{ ...style, borderLeftColor: color }}
      className={`alert-row flex flex-col justify-center px-3 gap-1
                  ${SEV_BG[a.severity] ?? ''} border-b border-[rgba(34,211,238,0.05)]`}
      onClick={() => onSelect(a)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(a)}
    >
      {/* Row 1: badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Severity badge */}
        <span className="badge text-[9px] font-bold"
              style={{ background: `${color}22`, color, border: `1px solid ${color}40` }}>
          {a.severity?.toUpperCase()}
        </span>

        {/* Threat type */}
        <span className="text-[11px] font-semibold text-slate-200">
          {icon} {a.threat_type?.replace(/_/g,' ') ?? 'unknown'}
        </span>

        {/* MITRE */}
        {a.playbook?.technique_id && (
          <span className="badge bg-indigo-900/50 text-indigo-300 text-[9px] border border-indigo-700/30">
            {a.playbook.technique_id}
          </span>
        )}

        {/* FP */}
        {a.is_false_positive_candidate && (
          <span className="badge bg-amber-900/40 text-amber-300 text-[9px] border border-amber-700/30">
            ⚠ FP
          </span>
        )}

        {/* Cross-layer */}
        {a.cross_layer && (
          <span className="badge bg-indigo-900/40 text-indigo-300 text-[9px] border border-indigo-700/30">
            ⬡ corr
          </span>
        )}
      </div>

      {/* Row 2: plain English */}
      <div className="text-[10px] text-slate-500 leading-none">{plain}</div>

      {/* Row 3: IPs + conf bar + time */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-slate-400 truncate flex-1">
          {a.src_ip ?? '—'} → {a.dst_ip ?? '—'}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-16">
            <ConfBar score={a.confidence_score ?? 0} color={color} />
          </div>
          <span className="font-mono text-[10px] font-bold tabular-nums w-7 text-right"
                style={{ color }}>{confPct}</span>
          <span className="text-[9px] text-slate-600 ml-1">{time}</span>
        </div>
      </div>
    </div>
  )
}

export default function AlertList() {
  const alerts      = useAlertStore(s => s.alerts)
  const selectAlert = useAlertStore(s => s.selectAlert)
  const [filter, setFilter] = useState('All')

  const filtered = Array.isArray(alerts)
    ? (filter === 'All' ? alerts : alerts.filter(a => a.severity === filter))
    : []

  const onSelect  = useCallback(a => selectAlert(a), [selectAlert])
  const itemData  = { items: filtered, onSelect }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none border-b border-[rgba(34,211,238,0.08)]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Alert Feed
          </span>
          <span className="font-mono text-[10px] text-slate-600 tabular-nums">
            {filtered.length.toLocaleString()} / {alerts.length.toLocaleString()}
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 px-3 pb-2">
          {FILTERS.map(f => {
            const c = SEV_COLOR[f]
            const active = filter === f
            return (
              <button
                key={f}
                id={`filter-${f.toLowerCase()}`}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
                style={active && c
                  ? { background: `${c}22`, color: c, border: `1px solid ${c}44` }
                  : { color: '#475569', border: '1px solid transparent' }
                }
              >
                {f}
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
            <span className="text-2xl opacity-30">◈</span>
            <span className="text-xs">Waiting for alerts…</span>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height} width={width}
                itemCount={filtered.length} itemSize={ITEM_HEIGHT}
                itemData={itemData} overscanCount={5}
              >
                {AlertRow}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  )
}
