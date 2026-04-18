/**
 * ThreatTimeline — replaces AlertList
 *
 * A seismograph-style horizontal scrolling panel.
 * Top half: time axis with colored vertical pips (one per event).
 * Bottom half: virtualized list of the most recent alerts with detail rows.
 * Clicking a pip or a row selects the alert for the AnalystPanel.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { useAlertStore, SEVERITY_COLOR } from '../store.js'

const THREAT_ICON = {
  brute_force:      '🔑',
  c2_beacon:        '📡',
  exfiltration:     '📤',
  lateral_movement: '🔀',
}

const THREAT_PLAIN = {
  brute_force:      'SSH password hammering',
  c2_beacon:        'Malware phoning home',
  exfiltration:     'Data transferred externally',
  lateral_movement: 'Attacker pivoting internally',
}

const FILTERS   = ['All', 'Critical', 'High', 'Medium', 'Low']
const ITEM_H    = 70
const PIP_W     = 6    // px width of each pip
const PIP_GAP   = 2    // px gap between pips

// ── Seismograph timeline ────────────────────────────────────────────────────

function Seismograph({ events, onSelect }) {
  const containerRef = useRef(null)

  // Auto-scroll right when new events arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth
    }
  }, [events.length])

  const maxPips = 200  // keep last 200 pips visible
  const visible = events.slice(0, maxPips)

  return (
    <div
      ref={containerRef}
      className="flex items-end gap-[2px] h-full overflow-x-auto px-3 pb-2 pt-4"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* Time axis baseline */}
      <div className="absolute bottom-2 left-0 right-0 h-px bg-[rgba(0,245,255,0.08)]"/>

      {[...visible].reverse().map((ev, i) => {
        const color = SEVERITY_COLOR[ev.severity] ?? '#64748b'
        // Height proportional to confidence, min 8px max 48px
        const conf  = ev.confidence ?? 0.5
        const h     = Math.round(8 + conf * 40)
        const time  = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''

        return (
          <div
            key={ev.id ?? i}
            className="timeline-pip flex-none cursor-pointer relative group"
            style={{ width: PIP_W, height: h, background: color,
                     borderRadius: 2, opacity: 0.75,
                     boxShadow: `0 0 4px ${color}80`,
                     animation: i === 0 ? 'pip-in 0.2s ease-out forwards' : undefined,
                     transformOrigin: 'bottom' }}
            onClick={() => onSelect(ev.alert)}
            title={`${ev.threat_type ?? 'event'} · ${ev.src_ip} → ${ev.dst_ip} · ${time}`}
          >
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                            pointer-events-none opacity-0 group-hover:opacity-100
                            transition-opacity duration-100 z-20 whitespace-nowrap
                            bg-[#060d1a] border border-[rgba(0,245,255,0.15)]
                            rounded px-2 py-1 text-[9px] font-mono"
                 style={{ color }}>
              {ev.threat_type?.replace(/_/g,' ') ?? 'event'}<br/>
              <span className="text-[#4a6080]">{ev.src_ip} → {ev.dst_ip}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Alert detail row ────────────────────────────────────────────────────────

function AlertRow({ index, style, data }) {
  const { items, onSelect } = data
  const a = items[index]
  if (!a) return null

  const color   = SEVERITY_COLOR[a.severity] ?? '#64748b'
  const icon    = THREAT_ICON[a.threat_type] ?? '⚠'
  const plain   = THREAT_PLAIN[a.threat_type] ?? (a.is_false_positive_candidate ? 'Admin backup (FP)' : 'Unknown')
  const time    = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--:--'
  const confPct = a.confidence_score != null ? Math.round(a.confidence_score * 100) + '%' : '?'

  return (
    <div
      style={{ ...style, borderLeftColor: color }}
      className={`alert-row flex flex-col justify-center px-3 gap-0.5
                  border-b border-[rgba(0,245,255,0.04)]`}
      onClick={() => onSelect(a)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(a)}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="badge text-[9px] font-bold"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
          {a.severity?.toUpperCase()}
        </span>
        <span className="text-[11px] font-semibold text-slate-200">
          {icon} {a.threat_type?.replace(/_/g,' ') ?? 'unknown'}
        </span>
        {a.playbook?.technique_id && (
          <span className="badge bg-[rgba(157,78,221,0.15)] text-purple-300 text-[9px]
                           border border-purple-700/30">
            {a.playbook.technique_id}
          </span>
        )}
        {a.is_false_positive_candidate && (
          <span className="badge bg-amber-900/30 text-amber-300 text-[9px] border border-amber-700/30">⚠ FP</span>
        )}
        {a.cross_layer && (
          <span className="badge bg-purple-900/30 text-purple-300 text-[9px] border border-purple-700/30">⬡ corr</span>
        )}
      </div>
      <div className="text-[9px] text-[#2a4060] leading-none">{plain}</div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-slate-500 truncate flex-1">
          {a.src_ip ?? '—'} → {a.dst_ip ?? '—'}
        </span>
        <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color }}>{confPct}</span>
        <span className="text-[9px] text-[#1e3a5f]">{time}</span>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ThreatTimeline() {
  const alerts        = useAlertStore(s => s.alerts)
  const timelineEvents = useAlertStore(s => s.timelineEvents)
  const selectAlert   = useAlertStore(s => s.selectAlert)
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All' ? alerts : alerts.filter(a => a.severity === filter)
  const onSelect = useCallback(a => { if (a) selectAlert(a) }, [selectAlert])
  const itemData = { items: filtered, onSelect }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none border-b border-[rgba(0,245,255,0.06)]">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[10px] font-bold text-[#2a5070] uppercase tracking-widest">
            Threat Feed
          </span>
          <span className="font-mono text-[9px] text-[#1a3050] tabular-nums">
            {filtered.length.toLocaleString()} shown
          </span>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1 px-3 pb-2">
          {FILTERS.map(f => {
            const c = SEVERITY_COLOR[f]
            const active = filter === f
            return (
              <button
                key={f}
                id={`filter-${f.toLowerCase()}`}
                onClick={() => setFilter(f)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold transition-all"
                style={active && c
                  ? { background: `${c}20`, color: c, border: `1px solid ${c}40` }
                  : { color: '#2a4060', border: '1px solid transparent' }}
              >
                {f}
              </button>
            )
          })}
        </div>
      </div>

      {/* Seismograph strip */}
      <div className="flex-none h-[72px] relative border-b border-[rgba(0,245,255,0.06)]
                      bg-[rgba(0,0,0,0.3)]">
        <div className="absolute top-1.5 left-3 text-[8px] font-bold uppercase tracking-widest
                        text-[#1a3050]">
          Live Seismograph ·&nbsp;
          <span className="text-[#00f5ff]">{timelineEvents.length}</span> events
        </div>
        <Seismograph events={timelineEvents} onSelect={onSelect}/>
      </div>

      {/* Virtualized list */}
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#1a3050]">
            <span className="text-2xl opacity-20">◈</span>
            <span className="text-xs tracking-wider">Awaiting alerts…</span>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height} width={width}
                itemCount={filtered.length} itemSize={ITEM_H}
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
