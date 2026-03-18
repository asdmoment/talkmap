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
        <p className="section-kicker">知识图谱</p>
        <h2>动态思维网络</h2>
      </div>
      <p className="pane-copy">
        AI 精准捕获复杂概念间的隐秘关联，织就出发散性的结构化图谱。
      </p>
      <div className="pane-surface constellation-surface" aria-label="动态思维网络">
        {layout.nodes.length === 0 ? (
          <p className="mindmap-empty">正在分析词汇间的引力波，这里将很快孕育你的知识宇宙...</p>
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
