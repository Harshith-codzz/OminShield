/**
 * AttackGlobe — replaces BlastRadius
 * Pure SVG hemisphere with animated arc trajectories per threat.
 */
import { useAlertStore, SEVERITY_COLOR, _getGlobePos } from '../store.js'

const W = 500, H = 310

function arcPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.45
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

function GlobeArc({ arc, idx }) {
  const src   = _getGlobePos(arc.src_ip)
  const dst   = _getGlobePos(arc.dst_ip)
  const color = SEVERITY_COLOR[arc.severity] ?? '#00f5ff'
  const path  = arcPath(src.x, src.y, dst.x, dst.y)
  const len   = Math.hypot(dst.x - src.x, dst.y - src.y) * 1.6 + 60
  const isCrit = arc.severity === 'Critical'
  const delay  = `${idx * 0.03}s`

  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={isCrit ? 3.5 : 2}
            strokeLinecap="round" opacity="0.12"/>
      <path d={path} fill="none" stroke={color}
            strokeWidth={isCrit ? 2 : 1.5} strokeLinecap="round"
            strokeDasharray={len} strokeDashoffset={len}
            style={{ animation: `arc-draw 1s ease forwards`, animationDelay: delay }}/>
      <circle cx={dst.x} cy={dst.y} r="3.5" fill={color} opacity="0.9"
              style={{ animation: `arc-draw 0.4s ease forwards`, animationDelay: `calc(${delay} + 0.8s)` }}/>
    </g>
  )
}

function GlobeNode({ ip, severity }) {
  const pos   = _getGlobePos(ip)
  const color = SEVERITY_COLOR[severity] ?? '#00f5ff'
  return (
    <g>
      <circle cx={pos.x} cy={pos.y} r="7" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3"/>
      <circle cx={pos.x} cy={pos.y} r="4" fill={`${color}33`} stroke={color} strokeWidth="1.5"/>
      <text x={pos.x} y={pos.y - 8} textAnchor="middle" fontSize="7.5"
            fill={color} opacity="0.75" fontFamily="'JetBrains Mono',monospace">{ip}</text>
    </g>
  )
}

export default function AttackGlobe() {
  const arcs  = useAlertStore(s => s.globeArcs)
  const nodes = []
  const seen  = new Set()
  for (const arc of arcs) {
    for (const ip of [arc.src_ip, arc.dst_ip]) {
      if (!seen.has(ip)) { seen.add(ip); nodes.push({ ip, severity: arc.severity }) }
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Legend */}
      <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-[rgba(0,245,255,0.06)]">
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#2a5070]">Attack Trajectories</span>
        <div className="flex items-center gap-3 ml-auto">
          {Object.entries(SEVERITY_COLOR).map(([sev, col]) => (
            <div key={sev} className="flex items-center gap-1.5">
              <div className="w-5 h-px" style={{ background: col, boxShadow: `0 0 4px ${col}` }}/>
              <span className="text-[9px] text-[#2a5070]">{sev}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] font-mono text-[#1a3050]">{arcs.length} arcs · 500ms</span>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 relative min-h-0 flex items-center justify-center">
        {arcs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" opacity="0.12">
              <circle cx="36" cy="36" r="32" stroke="#00f5ff" strokeWidth="1" strokeDasharray="4 3"/>
              <ellipse cx="36" cy="36" rx="18" ry="32" stroke="#00f5ff" strokeWidth="0.5" strokeDasharray="3 4"/>
              <line x1="4" y1="36" x2="68" y2="36" stroke="#00f5ff" strokeWidth="0.5" strokeDasharray="2 4"/>
              <line x1="36" y1="4" x2="36" y2="68" stroke="#00f5ff" strokeWidth="0.5" strokeDasharray="2 4"/>
            </svg>
            <span className="text-[11px] tracking-widest uppercase text-[#1a3050]">Awaiting threat telemetry…</span>
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ maxHeight: '100%' }}>
          <defs>
            <radialGradient id="globe-bg" cx="50%" cy="65%" r="55%">
              <stop offset="0%"   stopColor="#0a1628" stopOpacity="0.9"/>
              <stop offset="100%" stopColor="#010409" stopOpacity="0.3"/>
            </radialGradient>
          </defs>
          {/* Hemisphere base */}
          <ellipse cx={W/2} cy={H*0.82} rx={W*0.52} ry={H*0.78}
                   fill="url(#globe-bg)" stroke="rgba(0,245,255,0.07)" strokeWidth="1"/>
          {/* Latitude rings */}
          {[0.3, 0.55, 0.75].map((t,i) => (
            <ellipse key={i} cx={W/2} cy={H*0.82} rx={W*0.52*t} ry={H*0.78*t}
                     fill="none" stroke="rgba(0,245,255,0.04)" strokeWidth="0.5"/>
          ))}
          {/* Zone divider */}
          <line x1="285" y1="10" x2="285" y2={H-10}
                stroke="rgba(0,245,255,0.07)" strokeWidth="0.5" strokeDasharray="4 4"/>
          {/* Zone labels */}
          <text x="50"  y="20" fontSize="8.5" fill="rgba(0,245,255,0.22)"
                fontFamily="'JetBrains Mono',monospace" fontWeight="600">EXTERNAL</text>
          <text x="340" y="20" fontSize="8.5" fill="rgba(0,245,255,0.22)"
                fontFamily="'JetBrains Mono',monospace" fontWeight="600">INTERNAL</text>
          {/* Arcs below nodes */}
          {arcs.map((arc, i) => <GlobeArc key={arc.id} arc={arc} idx={i}/>)}
          {/* Nodes on top */}
          {nodes.map(n => <GlobeNode key={n.ip} ip={n.ip} severity={n.severity}/>)}
        </svg>
      </div>
    </div>
  )
}
