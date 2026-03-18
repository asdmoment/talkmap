import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MindMapPane } from './MindMapPane';
import { resetSessionState, seedSessionState } from '../state/sessionRuntime';

describe('MindMapPane', () => {
  beforeEach(() => {
    resetSessionState();
  });

  it('renders live nodes from the current state shape', () => {
    seedSessionState({
      mindmapNodes: [
        { id: 'node-1', label: 'Research' },
        { id: 'node-2', label: 'Interview' },
      ],
      mindmapEdges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    });

    render(<MindMapPane />);

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByTestId('edge-edge-1')).toBeInTheDocument();
  });

  it('shows an editorial empty state before graph updates arrive', () => {
    render(<MindMapPane />);

    expect(screen.getByText('正在分析词汇间的引力波，这里将很快孕育你的知识宇宙...')).toBeInTheDocument();
  });

  it('treats explicit empty props as an instruction to clear the graph', () => {
    seedSessionState({
      mindmapNodes: [{ id: 'node-1', label: 'Research' }],
      mindmapEdges: [],
    });

    render(<MindMapPane nodes={[]} edges={[]} />);

    expect(screen.queryByText('Research')).not.toBeInTheDocument();
    expect(screen.getByText('正在分析词汇间的引力波，这里将很快孕育你的知识宇宙...')).toBeInTheDocument();
  });
});
