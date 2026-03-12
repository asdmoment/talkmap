import type { MindmapEdge, MindmapNode } from './socket';

export interface GraphNodeLayout {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdgeLayout {
  id: string;
  source: string;
  target: string;
  path: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
}

export function buildGraphLayout(nodes: MindmapNode[], edges: MindmapEdge[]): GraphLayout {
  const width = 520;
  const height = 280;
  const sortedNodes = [...nodes].sort((left, right) => left.id.localeCompare(right.id));
  const sortedEdges = [...edges].sort((left, right) => left.id.localeCompare(right.id));
  const minX = 80;
  const maxX = width - 80;
  const minY = 56;
  const maxY = height - 56;

  const laidOutNodes = sortedNodes.map((node, index) => {
    const x = interpolateHash(node.id, 11, minX, maxX);
    const y = interpolateHash(node.id, 29, minY, maxY);

    return {
      id: node.id,
      label: node.label,
      x,
      y,
    };
  });

  const nodeById = new Map(laidOutNodes.map((node) => [node.id, node]));
  const laidOutEdges = sortedEdges.flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source || !target) {
      return [];
    }

    const controlX = Math.round((source.x + target.x) / 2);
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        path: `M ${source.x} ${source.y} C ${controlX} ${source.y}, ${controlX} ${target.y}, ${target.x} ${target.y}`,
      },
    ];
  });

  return {
    width,
    height,
    nodes: laidOutNodes,
    edges: laidOutEdges,
  };
}

function interpolateHash(input: string, seed: number, min: number, max: number) {
  const hash = Math.abs(hashString(`${seed}:${input}`));
  const normalized = (hash % 1000) / 1000;
  return Math.round(min + normalized * (max - min));
}

function hashString(input: string) {
  let hash = 0;

  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }

  return hash;
}
