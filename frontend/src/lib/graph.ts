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

  if (nodes.length === 0) {
    return { width, height, nodes: [], edges: [] };
  }

  const padX = 80;
  const padY = 56;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  // Initialize positions deterministically using hash
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    positions.set(node.id, {
      x: padX + interpolateHash(node.id, 11, innerW),
      y: padY + interpolateHash(node.id, 29, innerH),
    });
  }

  // Force-directed simulation (fixed iterations)
  const iterations = 50;
  const repulsionStrength = 2000;
  const attractionStrength = 0.05;
  const idealEdgeLength = 100;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const node of nodes) {
      forces.set(node.id, { fx: 0, fy: 0 });
    }

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsionStrength / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        forces.get(nodes[i].id)!.fx += dx;
        forces.get(nodes[i].id)!.fy += dy;
        forces.get(nodes[j].id)!.fx -= dx;
        forces.get(nodes[j].id)!.fy -= dy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = attractionStrength * (dist - idealEdgeLength);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces.get(edge.source)!.fx += fx;
      forces.get(edge.source)!.fy += fy;
      forces.get(edge.target)!.fx -= fx;
      forces.get(edge.target)!.fy -= fy;
    }

    // Apply forces with cooling
    for (const node of nodes) {
      const pos = positions.get(node.id)!;
      const f = forces.get(node.id)!;
      pos.x = Math.max(padX, Math.min(width - padX, pos.x + f.fx * cooling));
      pos.y = Math.max(padY, Math.min(height - padY, pos.y + f.fy * cooling));
    }
  }

  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const laidOutNodes = sortedNodes.map((node) => {
    const pos = positions.get(node.id)!;
    return { id: node.id, label: node.label, x: Math.round(pos.x), y: Math.round(pos.y) };
  });

  const nodeById = new Map(laidOutNodes.map((n) => [n.id, n]));
  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  const laidOutEdges = sortedEdges.flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
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

  return { width, height, nodes: laidOutNodes, edges: laidOutEdges };
}

function interpolateHash(input: string, seed: number, range: number): number {
  const hash = Math.abs(hashString(`${seed}:${input}`));
  return Math.round(((hash % 1000) / 1000) * range);
}

function hashString(input: string): number {
  let hash = 0;
  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return hash;
}
