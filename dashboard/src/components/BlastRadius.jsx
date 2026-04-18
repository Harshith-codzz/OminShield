import ReactFlow, { MiniMap, Background, Controls, BackgroundVariant } from 'reactflow'
import { useAlertStore } from '../store.js'

export default function BlastRadius() {
  const nodes = useAlertStore(s => s.nodes)
  const edges = useAlertStore(s => s.edges)

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={3}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32} size={1}
          color="rgba(34,211,238,0.12)"
        />
        <MiniMap
          nodeColor={n => n.style?.borderColor ?? '#334155'}
          maskColor="rgba(2,4,15,0.75)"
          style={{ background: 'rgba(2,4,15,0.9)', border: '1px solid rgba(34,211,238,0.1)', borderRadius: 8 }}
        />
        <Controls style={{ bottom: 12, right: 12, left: 'auto' }} />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center
                        pointer-events-none gap-3 text-slate-700">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.3">
            <circle cx="24" cy="24" r="20" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 3"/>
            <circle cx="24" cy="24" r="3" fill="#22d3ee"/>
            <line x1="24" y1="4" x2="24" y2="44" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="2 4"/>
            <line x1="4" y1="24" x2="44" y2="24" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="2 4"/>
          </svg>
          <span className="text-xs tracking-widest uppercase">Awaiting threat data…</span>
        </div>
      )}
    </div>
  )
}
