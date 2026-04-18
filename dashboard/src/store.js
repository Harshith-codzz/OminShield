import { create } from 'zustand'

// ─── Severity colors ──────────────────────────────────────────────────────────
export const SEVERITY_COLOR = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

// ─── Stable node position cache (module-level — survives re-renders) ──────────
const _posCache = new Map()

function _getNodePos(ip) {
  if (!_posCache.has(ip)) {
    _posCache.set(ip, {
      x: 40 + Math.random() * 800,
      y: 40 + Math.random() * 600,
    })
  }
  return _posCache.get(ip)
}

// ─── Zustand store ────────────────────────────────────────────────────────────
export const useAlertStore = create((set, get) => ({
  // Ring buffer of last 500 alerts (newest first)
  alerts:        [],
  metrics:       { total: 0, eps: 0, critical: 0, high: 0 },
  playbooks:     {},
  selectedAlert: null,

  // React Flow graph state (updated every 500ms)
  nodes: [],
  edges: [],

  // Internal buffer drained by flushGraphUpdates()
  _pendingGraphAlerts: [],

  // ── Actions ────────────────────────────────────────────────────────────────

  addAlerts(incoming) {
    if (!incoming.length) return
    set(state => {
      const merged  = [...incoming.slice().reverse(), ...state.alerts].slice(0, 500)
      const metrics = { ...state.metrics }
      for (const a of incoming) {
        metrics.total++
        const sev = a.severity?.toLowerCase()
        if (sev === 'critical') metrics.critical++
        else if (sev === 'high') metrics.high++
      }
      return { alerts: merged, metrics }
    })
  },

  setEps(eps) {
    set(state => ({ metrics: { ...state.metrics, eps } }))
  },

  addPlaybook(alertId, playbook) {
    set(state => ({ playbooks: { ...state.playbooks, [alertId]: playbook } }))
  },

  selectAlert(alert) {
    set({ selectedAlert: alert })
  },

  queueGraphAlert(alert) {
    set(state => ({
      _pendingGraphAlerts: [...state._pendingGraphAlerts, alert],
    }))
  },

  flushGraphUpdates() {
    const pending = get()._pendingGraphAlerts
    if (!pending.length) return

    set(state => {
      const nodeMap = new Map(state.nodes.map(n => [n.id, n]))
      const edgeMap = new Map(state.edges.map(e => [e.id, e]))

      for (const alert of pending) {
        const { src_ip, dst_ip, severity, threat_type } = alert
        if (!src_ip || !dst_ip) continue

        const color = SEVERITY_COLOR[severity] ?? '#64748b'

        // Upsert source node
        if (!nodeMap.has(src_ip)) {
          nodeMap.set(src_ip, {
            id:       src_ip,
            data:     { label: src_ip },
            position: _getNodePos(src_ip),
            style: {
              background: '#0f172a',
              border: `2px solid ${color}`,
              color: '#e2e8f0',
              borderRadius: 8,
              fontSize: 11,
              padding: '4px 8px',
            },
          })
        } else {
          // Update border color if severity is worse
          const existing = nodeMap.get(src_ip)
          nodeMap.set(src_ip, {
            ...existing,
            style: { ...existing.style, border: `2px solid ${color}` },
          })
        }

        // Upsert destination node
        if (!nodeMap.has(dst_ip)) {
          nodeMap.set(dst_ip, {
            id:       dst_ip,
            data:     { label: dst_ip },
            position: _getNodePos(dst_ip),
            style: {
              background: '#0f172a',
              border: `2px solid ${color}`,
              color: '#e2e8f0',
              borderRadius: 8,
              fontSize: 11,
              padding: '4px 8px',
            },
          })
        }

        // Upsert edge
        const edgeId = `${src_ip}-${dst_ip}`
        edgeMap.set(edgeId, {
          id:        edgeId,
          source:    src_ip,
          target:    dst_ip,
          animated:  severity === 'Critical',
          label:     threat_type ?? '',
          style:     { stroke: color, strokeWidth: severity === 'Critical' ? 2.5 : 1.5 },
          labelStyle: { fill: color, fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: '#02040f', fillOpacity: 0.8 },
        })
      }

      return {
        nodes:               Array.from(nodeMap.values()),
        edges:               Array.from(edgeMap.values()),
        _pendingGraphAlerts: [],
      }
    })
  },
}))
