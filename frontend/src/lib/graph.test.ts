import { buildGraphLayout } from './graph';

describe('buildGraphLayout', () => {
  it('keeps node positions stable regardless of input order', () => {
    const nodesA = [
      { id: 'b', label: 'Beta' },
      { id: 'a', label: 'Alpha' },
      { id: 'c', label: 'Gamma' },
    ];
    const nodesB = [
      { id: 'c', label: 'Gamma' },
      { id: 'b', label: 'Beta' },
      { id: 'a', label: 'Alpha' },
    ];
    const edges = [{ id: 'ab', source: 'a', target: 'b' }];

    const firstLayout = buildGraphLayout(nodesA, edges);
    const secondLayout = buildGraphLayout(nodesB, edges);

    expect(firstLayout.nodes).toEqual(secondLayout.nodes);
    expect(firstLayout.edges).toEqual(secondLayout.edges);
  });

  it('preserves existing node positions when a new node is added', () => {
    const baseNodes = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ];
    const expandedNodes = [...baseNodes, { id: 'c', label: 'Gamma' }];

    const baseLayout = buildGraphLayout(baseNodes, []);
    const expandedLayout = buildGraphLayout(expandedNodes, []);
    const baseById = new Map(baseLayout.nodes.map((node) => [node.id, node]));
    const expandedById = new Map(expandedLayout.nodes.map((node) => [node.id, node]));

    expect(expandedById.get('a')).toEqual(baseById.get('a'));
    expect(expandedById.get('b')).toEqual(baseById.get('b'));
  });
});
