import { useMemo } from 'react';
import type { MindmapEdge, MindmapNode } from '../lib/socket';
import { buildGraphLayout } from '../lib/graph';
import { useSessionState } from '../state/sessionRuntime';

interface MindMapPaneProps {
  nodes?: MindmapNode[];
  edges?: MindmapEdge[];
}

export function MindMapPane({ nodes, edges }: MindMapPaneProps) {
  const state = useSessionState();
  const resolvedNodes = nodes ?? state.mindmapNodes;
  const resolvedEdges = edges ?? state.mindmapEdges;
  const layout = useMemo(() => buildGraphLayout(resolvedNodes, resolvedEdges), [resolvedNodes, resolvedEdges]);

  return (
    <section className="pane mindmap-pane">
      <div className="pane-header">
        <p className="section-kicker">Feed C</p>
        <h2>Mind Map</h2>
      </div>
      <p className="pane-copy">
        Topics and relationships will branch outward here as the system detects themes and connections.
      </p>
      <div className="pane-surface constellation-surface" aria-label="Mind map">
        {layout.nodes.length === 0 ? (
          <p className="mindmap-empty">Waiting for the first theme to branch into view.</p>
        ) : (
          <>
            <svg
              className="mindmap-svg"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              aria-hidden="true"
            >
              {layout.edges.map((edge) => (
                <path key={edge.id} d={edge.path} className="mindmap-edge" data-testid={`edge-${edge.id}`} />
              ))}
            </svg>
            {layout.nodes.map((node) => (
              <span
                key={node.id}
                className="mindmap-node"
                style={{ left: `${(node.x / layout.width) * 100}%`, top: `${(node.y / layout.height) * 100}%` }}
              >
                {node.label}
              </span>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
