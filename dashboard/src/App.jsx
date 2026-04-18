import { useEffect, useRef, useState } from 'react'
import { useAlertStore } from './store.js'
import MetricCards   from './components/MetricCards.jsx'
import AlertList     from './components/AlertList.jsx'
import BlastRadius   from './components/BlastRadius.jsx'
import PlaybookPanel from './components/PlaybookPanel.jsx'
import ThreatLegend  from './components/ThreatLegend.jsx'
import LiveIndicator from './components/LiveIndicator.jsx'

export default function App() {
  const { addAlerts, addPlaybook, flushGraphUpdates } = useAlertStore()
  const queueGraphAlert = useAlertStore(s => s.queueGraphAlert)
  const buffer  = useRef([])
  const [esState, setEsState] = useState(2)

  useEffect(() => {
    const es = new EventSource('/stream')
    es.onopen  = () => setEsState(1)
    es.onerror = () => setEsState(es.readyState)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'playbook') { addPlaybook(msg.alert_id, msg.playbook); return }
        buffer.current.push(msg)
        queueGraphAlert(msg)
      } catch (_) {}
    }

    // Drain into Zustand at 60ms ticks — keeps browser at 60fps
    const drainId = setInterval(() => {
      if (!buffer.current.length) return
      addAlerts(buffer.current.splice(0, 100))
    }, 60)

    // Update graph twice per second — prevents layout thrashing
    const graphId = setInterval(() => flushGraphUpdates(), 500)

    // Poll /stats for EPS every 3s
    const statsId = setInterval(async () => {
      try {
        const r = await fetch('/stats')
        if (r.ok) {
          const data = await r.json()
          useAlertStore.getState().setEps(data.eps ?? 0)
        }
      } catch (_) {}
    }, 3000)

    return () => {
      es.close()
      clearInterval(drainId)
      clearInterval(graphId)
      clearInterval(statsId)
    }
  }, []) // eslint-disable-line

  return (
    <div className="flex flex-col h-screen bg-[#02040f] text-slate-100 overflow-hidden">

      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-3
                         border-b border-slate-800 bg-[#02040f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600
                          flex items-center justify-center text-sm font-bold shadow-lg">⬡</div>
          <div>
            <h1 className="font-bold text-base tracking-tight">OmniShield AI</h1>
            <p className="text-[10px] text-slate-500 leading-none">Extended Detection &amp; Response</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] text-slate-500 border border-slate-700
                           px-2 py-0.5 rounded font-mono">MITRE ATT&CK v14</span>
          <span className="text-[11px] text-slate-500 border border-slate-700
                           px-2 py-0.5 rounded font-mono">ECS 8.11</span>
          <LiveIndicator readyState={esState} />
        </div>
      </header>

      {/* Metric cards */}
      <div className="flex-none px-4 py-3">
        <MetricCards />
      </div>

      {/* Main 3-column layout */}
      <div className="flex flex-1 gap-3 px-4 pb-4 min-h-0">

        {/* Left — Alert list */}
        <div className="w-[300px] flex-none flex flex-col bg-[#04081c] rounded-xl
                        border border-slate-800 overflow-hidden">
          <AlertList />
        </div>

        {/* Center — Blast radius graph */}
        <div className="flex-1 flex flex-col bg-[#04081c] rounded-xl
                        border border-slate-800 overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-4 py-2
                          border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Blast Radius Graph
            </span>
            <span className="text-[10px] text-slate-600 font-mono">500ms refresh · live</span>
          </div>
          <div className="flex-1 min-h-0">
            <BlastRadius />
          </div>
        </div>

        {/* Right — Playbook panel */}
        <div className="w-[300px] flex-none flex flex-col bg-[#04081c] rounded-xl
                        border border-slate-800 overflow-hidden">
          <PlaybookPanel />
        </div>

      </div>

      {/* Footer legend */}
      <div className="flex-none px-4 pb-2">
        <ThreatLegend />
      </div>
    </div>
  )
}
