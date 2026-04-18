import { useState } from 'react'
import { useAlertStore } from '../store.js'

const SEV_COLOR = { Critical:'#ef4444', High:'#f97316', Medium:'#eab308', Low:'#22c55e' }

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="copy-btn"
      id="btn-copy-firewall"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(()=>setOk(false),2000) })}
    >
      {ok ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

function ScoreBar({ label, value, max, color, explain }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="mb-1.5" title={explain}>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-slate-500">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color }}>{(value).toFixed(2)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Section({ title, children, accent }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${accent ?? '#22d3ee'}40, transparent)` }} />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex-shrink-0">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

export default function PlaybookPanel() {
  const selectedAlert = useAlertStore(s => s.selectedAlert)
  const playbooks     = useAlertStore(s => s.playbooks)

  if (!selectedAlert) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-6 gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" opacity="0.15">
          <path d="M28 4L50 14V28C50 40 40 49 28 52C16 49 6 40 6 28V14Z"
                stroke="#22d3ee" strokeWidth="1.5" fill="none"/>
          <path d="M18 28L24 34L38 20" stroke="#22d3ee" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div>
          <p className="text-slate-400 text-sm font-medium">Click any alert</p>
          <p className="text-slate-600 text-xs mt-1">
            Local playbooks always ready<br/>AI-enhanced via Gemini for Critical threats
          </p>
        </div>
      </div>
    )
  }

  const geminiPb   = playbooks[selectedAlert.id]
  const localPb    = selectedAlert.playbook ?? {}
  const pb         = geminiPb ?? localPb
  const aiEnhanced = !!geminiPb?.ai_enhanced
  const sev        = selectedAlert.severity
  const color      = SEV_COLOR[sev] ?? '#64748b'

  const firewallCmds   = pb.firewall_cmds ?? localPb.firewall_cmds ?? []
  const firewallText   = Array.isArray(firewallCmds) ? firewallCmds.join('\n') : String(firewallCmds)
  const investigation  = pb.investigation_steps
    ?? (localPb.investigation ? localPb.investigation.split('\n') : [])
  const plainEnglish   = pb.plain_english ?? localPb.description ?? ''
  const confExplain    = pb.confidence_explanation ?? ''
  const isFP           = pb.is_false_positive ?? selectedAlert.is_false_positive ?? false

  // Confidence score breakdown
  const ruleHit    = selectedAlert.threat_type ? 0.4 : 0
  const anomalyPart = (selectedAlert.anomaly_score ?? 0) * 0.4
  const crossPart   = selectedAlert.cross_layer ? 0.2 : 0
  const totalScore  = selectedAlert.confidence_score ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex-none border-b border-[rgba(34,211,238,0.08)] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Playbook
          </span>
          <div className="flex items-center gap-2">
            {aiEnhanced && (
              <span className="badge text-[9px] bg-indigo-900/50 text-indigo-300 border border-indigo-700/30">
                ⚡ AI-Enhanced
              </span>
            )}
            <span className="badge text-[9px] font-bold"
                  style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
              {sev?.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        {/* MITRE technique */}
        <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-[rgba(129,140,248,0.06)]
                        border border-indigo-900/40">
          <div className="font-mono font-bold text-indigo-300 text-lg leading-none pt-0.5">
            {pb.technique_id ?? pb.mitre_id ?? localPb.technique_id ?? '—'}
          </div>
          <div>
            <div className="text-white font-semibold text-sm">
              {pb.technique_name ?? pb.mitre_name ?? localPb.technique_name ?? '—'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Tactic: <span className="text-slate-300">{pb.tactic ?? localPb.tactic ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Plain English */}
        {plainEnglish && (
          <Section title="What Happened" accent={color}>
            <p className="text-slate-300 text-sm leading-relaxed">{plainEnglish}</p>
          </Section>
        )}

        {/* False positive */}
        {isFP && (
          <div className="rounded-lg px-3 py-2.5 mb-3 border border-amber-700/30 bg-amber-900/20">
            <div className="text-amber-300 text-xs font-bold mb-0.5">⚠ Likely False Positive</div>
            <div className="text-amber-200/60 text-xs">
              {pb.false_positive_reason ?? 'Admin scheduled backup detected — verify via labels.'}
            </div>
          </div>
        )}

        {/* Confidence score breakdown — THE DIFFERENTIATOR */}
        <Section title="Confidence Breakdown" accent={color}>
          <div className="rounded-lg p-3 bg-[rgba(34,211,238,0.03)] border border-[rgba(34,211,238,0.08)]">
            <div className="text-[9px] text-slate-600 mb-2 font-mono">
              score = (0.40 × rule) + (0.40 × ML) + (0.20 × cross-layer)
            </div>
            <ScoreBar label="Rule Match (40%)"        value={ruleHit}    max={0.4} color="#22d3ee"
                      explain="1.0 if a detection rule fired, 0 otherwise" />
            <ScoreBar label="ML Anomaly (40%)"        value={anomalyPart} max={0.4} color="#818cf8"
                      explain="HalfSpaceTrees anomaly score × 0.40" />
            <ScoreBar label="Cross-layer Corr. (20%)" value={crossPart}  max={0.2} color="#f59e0b"
                      explain="Same src_ip seen in multiple attack contexts (90s window)" />
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.05)]">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-semibold">Total Score</span>
                <span className="font-mono font-bold text-sm" style={{ color }}>
                  {(totalScore * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden mt-1">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${Math.round(totalScore*100)}%`,
                              background: `linear-gradient(90deg, #22d3ee, ${color})` }} />
              </div>
            </div>
          </div>
        </Section>

        {/* Firewall commands */}
        {firewallCmds.length > 0 && (
          <Section title="Firewall Commands" accent={color}>
            <div className="relative">
              <pre className="bg-[rgba(2,4,15,0.8)] border border-[rgba(34,211,238,0.1)]
                             rounded-lg p-3 pr-16 text-[11px] font-mono text-green-300
                             overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {firewallText}
              </pre>
              <CopyBtn text={firewallText} />
            </div>
          </Section>
        )}

        {/* Investigation steps */}
        {investigation.length > 0 && (
          <Section title="Investigation Steps" accent={color}>
            <ol className="space-y-1.5">
              {investigation.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-300">
                  <span className="font-mono font-bold text-cyan-500 flex-shrink-0 w-4">{i+1}.</span>
                  <span className="leading-relaxed">{String(step).replace(/^\d+\.\s*/,'')}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Confidence explanation */}
        {confExplain && (
          <Section title="AI Reasoning" accent={color}>
            <p className="text-slate-500 text-xs italic leading-relaxed">{confExplain}</p>
          </Section>
        )}

        {/* Alert metadata */}
        <Section title="Alert Details" accent="#475569">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {[
              ['ID',          selectedAlert.id?.slice(0,8)+'…'],
              ['Source IP',   selectedAlert.src_ip ?? '—'],
              ['Dest IP',     selectedAlert.dst_ip ?? '—'],
              ['Dest Port',   selectedAlert.dst_port ?? '—'],
              ['Action',      selectedAlert.action ?? '—'],
              ['Bytes',       selectedAlert.bytes != null ? selectedAlert.bytes.toLocaleString() : '—'],
              ['Process',     selectedAlert.process ?? '—'],
              ['User',        selectedAlert.user ?? '—'],
              ['Cross-layer', selectedAlert.cross_layer ? '✓ Yes' : '✗ No'],
              ['Anomaly Sc.', selectedAlert.anomaly_score != null ? (selectedAlert.anomaly_score*100).toFixed(1)+'%' : '—'],
            ].map(([k,v]) => (
              <div key={k} className="contents">
                <span className="text-slate-600">{k}</span>
                <span className="font-mono text-slate-300 truncate">{v}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
