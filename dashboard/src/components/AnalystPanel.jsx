/**
 * AnalystPanel — replaces PlaybookPanel
 *
 * Innovations:
 * 1. MITRE Kill Chain progress bar — visual stage highlighting
 * 2. Typewriter animation for AI-generated playbook text
 * 3. Checkable investigation steps
 * 4. Confidence score breakdown with animated bars
 * 5. "AI Analyst" persona with thinking indicator
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAlertStore, SEVERITY_COLOR, KILL_CHAIN, THREAT_STAGE } from '../store.js'

// ── Kill chain bar ────────────────────────────────────────────────────────────

function KillChainBar({ threatType, severity }) {
  const activeIdx = THREAT_STAGE[threatType] ?? -1
  const color     = SEVERITY_COLOR[severity] ?? '#00f5ff'

  return (
    <div className="mb-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-[#2a5070] mb-1.5">
        MITRE Kill Chain
      </div>
      <div className="flex rounded-md overflow-hidden border border-[rgba(0,245,255,0.06)]">
        {KILL_CHAIN.map((stage, i) => (
          <div
            key={stage}
            className={`kill-chain-stage ${i === activeIdx ? 'active' : 'text-[#1a3050]'}`}
            style={i === activeIdx ? { '--tw-text-opacity': 1 } : {}}
            title={stage}
          >
            {stage}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Typewriter hook ────────────────────────────────────────────────────────────

function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone]           = useState(false)
  const prevText = useRef('')

  useEffect(() => {
    if (!text) { setDisplayed(''); setDone(false); return }
    if (text === prevText.current) return

    prevText.current = text
    setDisplayed('')
    setDone(false)
    let i = 0

    const id = setInterval(() => {
      i += Math.ceil(speed / 10)  // jump multiple chars for speed
      if (i >= text.length) {
        setDisplayed(text)
        setDone(true)
        clearInterval(id)
      } else {
        setDisplayed(text.slice(0, i))
      }
    }, 16)

    return () => clearInterval(id)
  }, [text, speed])

  return { displayed, done }
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="copy-btn"
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setOk(true); setTimeout(() => setOk(false), 2000)
      })}
    >
      {ok ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children, color }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1"
             style={{ background: `linear-gradient(90deg, ${color ?? '#00f5ff'}30, transparent)` }}/>
        <span className="text-[9px] font-bold text-[#2a5070] uppercase tracking-widest flex-shrink-0">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="mb-1.5">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-[#2a4060]">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color }}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: color }}/>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalystPanel() {
  const selectedAlert = useAlertStore(s => s.selectedAlert)
  const playbooks     = useAlertStore(s => s.playbooks)
  const [checked, setChecked] = useState({})

  const geminiPb  = selectedAlert ? playbooks[selectedAlert.id] : null
  const localPb   = selectedAlert?.playbook ?? {}
  const pb        = geminiPb ?? localPb
  const sev       = selectedAlert?.severity
  const color     = SEVERITY_COLOR[sev] ?? '#00f5ff'
  const aiEnhanced = !!geminiPb?.ai_enhanced

  const plainEnglish  = pb.plain_english ?? localPb.description ?? ''
  const firewallCmds  = pb.firewall_cmds ?? localPb.firewall_cmds ?? []
  const firewallText  = Array.isArray(firewallCmds) ? firewallCmds.join('\n') : String(firewallCmds)
  const steps         = pb.investigation_steps
    ?? (localPb.investigation ? localPb.investigation.split('\n').filter(Boolean) : [])
  const confExplain   = pb.confidence_explanation ?? ''
  const isFP          = pb.is_false_positive ?? selectedAlert?.is_false_positive ?? false

  const ruleHit   = selectedAlert?.threat_type ? 0.4 : 0
  const anomalyPt = (selectedAlert?.anomaly_score ?? 0) * 0.4
  const crossPt   = selectedAlert?.cross_layer ? 0.2 : 0
  const totalScore = selectedAlert?.confidence_score ?? 0

  // Typewriter for AI text
  const { displayed, done } = useTypewriter(
    aiEnhanced ? plainEnglish : '',
    20
  )

  const toggleStep = useCallback(i => {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }, [])

  // Reset checklist when alert changes
  useEffect(() => setChecked({}), [selectedAlert?.id])

  // Empty state
  if (!selectedAlert) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center px-6 gap-4">
        <div className="relative">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" opacity="0.12">
            <path d="M32 4L58 16V32C58 46 46 56 32 60C18 56 6 46 6 32V16Z"
                  stroke="#00f5ff" strokeWidth="1.5" fill="none"/>
            <path d="M20 32L28 40L44 24" stroke="#00f5ff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p className="text-slate-400 text-sm font-semibold">Select an alert</p>
          <p className="text-[#1a3050] text-xs mt-1.5 leading-relaxed">
            Click any alert or seismograph pip<br/>
            Local playbooks always available<br/>
            Gemini enhances Critical threats
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex-none border-b border-[rgba(0,245,255,0.06)] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#2a5070] uppercase tracking-widest">
            AI Analyst
          </span>
          <div className="flex items-center gap-2">
            {aiEnhanced && (
              <span className="text-[10px] ai-badge">⚡ Gemini Enhanced</span>
            )}
            {!aiEnhanced && selectedAlert?.severity === 'Critical' && (
              <span className="flex items-center gap-1 text-[9px] text-[#2a4060]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>
                Analyzing…
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

        {/* Kill chain bar */}
        <KillChainBar threatType={selectedAlert.threat_type} severity={sev}/>

        {/* MITRE technique card */}
        <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-[rgba(157,78,221,0.06)]
                        border border-purple-900/30">
          <div className="font-mono font-bold text-purple-300 text-lg leading-none pt-0.5">
            {pb.technique_id ?? pb.mitre_id ?? localPb.technique_id ?? '—'}
          </div>
          <div>
            <div className="text-white font-semibold text-sm">
              {pb.technique_name ?? pb.mitre_name ?? localPb.technique_name ?? '—'}
            </div>
            <div className="text-xs text-[#2a4060] mt-0.5">
              Tactic: <span className="text-slate-400">{pb.tactic ?? localPb.tactic ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* What happened — typewriter for AI, static for local */}
        {plainEnglish && (
          <Section title="What Happened" color={color}>
            <p className="text-slate-300 text-sm leading-relaxed">
              {aiEnhanced ? (
                <>
                  {displayed}
                  {!done && <span className="typewriter-caret"/>}
                </>
              ) : plainEnglish}
            </p>
          </Section>
        )}

        {/* FP warning */}
        {isFP && (
          <div className="rounded-lg px-3 py-2.5 mb-3 border border-amber-700/30 bg-amber-900/20">
            <div className="text-amber-300 text-xs font-bold mb-0.5">⚠ Likely False Positive</div>
            <div className="text-amber-200/50 text-xs">
              {pb.false_positive_reason ?? 'Admin scheduled backup — verify via labels.'}
            </div>
          </div>
        )}

        {/* Confidence breakdown */}
        <Section title="Confidence Breakdown" color={color}>
          <div className="rounded-lg p-3 bg-[rgba(0,245,255,0.02)] border border-[rgba(0,245,255,0.07)]">
            <div className="text-[9px] text-[#1a3050] mb-2 font-mono">
              score = (0.40 × rule) + (0.40 × ML) + (0.20 × cross-layer)
            </div>
            <ScoreBar label="Rule Match (40%)"        value={ruleHit}    max={0.4} color="#00f5ff"/>
            <ScoreBar label="ML Anomaly (40%)"        value={anomalyPt}  max={0.4} color="#9d4edd"/>
            <ScoreBar label="Cross-layer Corr. (20%)" value={crossPt}    max={0.2} color="#ffbe0b"/>
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-semibold">Total</span>
                <span className="font-mono font-bold text-sm" style={{ color }}>
                  {(totalScore * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden mt-1">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${Math.round(totalScore * 100)}%`,
                              background: `linear-gradient(90deg, #00f5ff, ${color})` }}/>
              </div>
            </div>
          </div>
        </Section>

        {/* Firewall commands */}
        {firewallCmds.length > 0 && (
          <Section title="Firewall Commands" color={color}>
            <div className="relative">
              <pre className="bg-[rgba(0,0,0,0.6)] border border-[rgba(0,245,255,0.08)]
                             rounded-lg p-3 pr-16 text-[11px] font-mono text-green-300
                             overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {firewallText}
              </pre>
              <CopyBtn text={firewallText}/>
            </div>
          </Section>
        )}

        {/* Investigation checklist */}
        {steps.length > 0 && (
          <Section title="Investigation Checklist" color={color}>
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs cursor-pointer group"
                  onClick={() => toggleStep(i)}
                >
                  <span
                    className="flex-none w-4 h-4 rounded border mt-0.5 flex items-center justify-center
                               transition-all duration-200 flex-shrink-0"
                    style={{
                      borderColor: checked[i] ? color : 'rgba(0,245,255,0.2)',
                      background:  checked[i] ? `${color}30` : 'transparent',
                    }}
                  >
                    {checked[i] && <span style={{ color, fontSize: 9, fontWeight: 900 }}>✓</span>}
                  </span>
                  <span className={`leading-relaxed transition-colors ${
                    checked[i] ? 'line-through text-[#1a3050]' : 'text-slate-300 group-hover:text-white'
                  }`}>
                    {String(step).replace(/^\d+\.\s*/, '')}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* AI reasoning */}
        {confExplain && (
          <Section title="AI Reasoning" color={color}>
            <p className="text-[#2a4060] text-xs italic leading-relaxed">{confExplain}</p>
          </Section>
        )}

        {/* Alert metadata */}
        <Section title="Alert Details" color="#1e3a5f">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            {[
              ['ID',        selectedAlert.id?.slice(0,8)+'…'],
              ['Source IP', selectedAlert.src_ip ?? '—'],
              ['Dest IP',   selectedAlert.dst_ip ?? '—'],
              ['Port',      selectedAlert.dst_port ?? '—'],
              ['Action',    selectedAlert.action ?? '—'],
              ['Bytes',     selectedAlert.bytes != null ? selectedAlert.bytes.toLocaleString() : '—'],
              ['Process',   selectedAlert.process ?? '—'],
              ['User',      selectedAlert.user ?? '—'],
              ['Cross-layer', selectedAlert.cross_layer ? '✓ Yes' : '✗ No'],
              ['Anomaly',   selectedAlert.anomaly_score != null
                              ? (selectedAlert.anomaly_score * 100).toFixed(1) + '%' : '—'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-[#1a3050]">{k}</span>
                <span className="font-mono text-slate-400 truncate">{v}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
