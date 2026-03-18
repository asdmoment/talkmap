import { createSessionStore } from './sessionStore';
import type { SessionEvent } from '../lib/socket';

describe('session store', () => {
  it('hydrates from session_started, prefers snapshot session id, and notifies subscribers with an immutable copy', () => {
    const store = createSessionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.applyEvent({
      type: 'session_started',
      session_id: 'session-1',
      snapshot: {
        session_id: 'session-from-snapshot',
        partial_segments: [],
        committed_segments: [],
        summary_blocks: [],
        mindmap_nodes: [],
        mindmap_edges: [],
      },
    });

    expect(store.getState()).toEqual({
      sessionId: 'session-from-snapshot',
      partialSegments: [],
      committedSegments: [],
      summaryBlocks: [],
      mindmapNodes: [],
      mindmapEdges: [],
      processingStage: 'idle',
      lastError: null,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sessionId: 'session-from-snapshot',
      partialSegments: [],
      committedSegments: [],
      summaryBlocks: [],
      mindmapNodes: [],
      mindmapEdges: [],
      processingStage: 'idle',
      lastError: null,
    });

    const subscriberState = listener.mock.calls[0][0];
    subscriberState.summaryBlocks.push({ id: 'summary-mutated', text: 'mutated' });

    expect(store.getState().summaryBlocks).toEqual([]);

    unsubscribe();
  });

  it('returns an immutable copy from getState', () => {
    const store = createSessionStore();

    store.applyEvent({
      type: 'session_started',
      session_id: 'session-1',
      snapshot: {
        session_id: 'session-1',
        partial_segments: [],
        committed_segments: [],
        summary_blocks: [],
        mindmap_nodes: [],
        mindmap_edges: [],
      },
    });

    const state = store.getState();
    state.partialSegments.push({ id: 'partial-mutated', text: 'mutated', start_ms: 0, end_ms: 1 });

    expect(store.getState().partialSegments).toEqual([]);
  });

  it('deep-clones the initial seed', () => {
    const initial = {
      sessionId: 'session-1',
      partialSegments: [{ id: 'partial-1', text: 'hello', start_ms: 0, end_ms: 100 }],
      committedSegments: [],
      summaryBlocks: [{ id: 'summary-1', text: 'initial summary' }],
      mindmapNodes: [{ id: 'node-1', label: 'Greeting' }],
      mindmapEdges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      lastError: null,
    };

    const store = createSessionStore(initial);

    initial.partialSegments[0].text = 'mutated partial';
    initial.summaryBlocks[0].text = 'mutated summary';
    initial.mindmapNodes[0].label = 'Mutated';
    initial.mindmapEdges[0].target = 'node-9';

    expect(store.getState()).toEqual({
      sessionId: 'session-1',
      partialSegments: [{ id: 'partial-1', text: 'hello', start_ms: 0, end_ms: 100 }],
      committedSegments: [],
      summaryBlocks: [{ id: 'summary-1', text: 'initial summary' }],
      mindmapNodes: [{ id: 'node-1', label: 'Greeting' }],
      mindmapEdges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      processingStage: 'idle',
      lastError: null,
    });
  });

  it('reconciles only the matching partial transcript when a committed segment arrives', () => {
    const store = createSessionStore();

    const events: SessionEvent[] = [
      {
        type: 'session_started',
        session_id: 'session-1',
        snapshot: {
          session_id: 'session-1',
          partial_segments: [],
          committed_segments: [],
          summary_blocks: [],
          mindmap_nodes: [],
          mindmap_edges: [],
        },
      },
      {
        type: 'partial_transcript',
        segment: { id: 'segment-1', text: 'hello', start_ms: 0, end_ms: 100 },
      },
      {
        type: 'partial_transcript',
        segment: { id: 'segment-2', text: 'world', start_ms: 100, end_ms: 200 },
      },
      {
        type: 'committed_transcript',
        segment: { id: 'segment-1', text: 'hello there', start_ms: 0, end_ms: 150 },
      },
    ];

    events.forEach((event) => {
      store.applyEvent(event);
    });

    expect(store.getState().partialSegments).toEqual([
      { id: 'segment-2', text: 'world', start_ms: 100, end_ms: 200 },
    ]);
    expect(store.getState().committedSegments).toEqual([
      { id: 'segment-1', text: 'hello there', start_ms: 0, end_ms: 150 },
    ]);
  });

  it('deep-clones event payloads on write and only removes the finalized partial segment', () => {
    const store = createSessionStore();
    const partialOne = { id: 'partial-1', text: 'first', start_ms: 0, end_ms: 80 };
    const partialTwo = { id: 'partial-2', text: 'second', start_ms: 90, end_ms: 180 };
    const committed = { id: 'partial-1', text: 'final', start_ms: 70, end_ms: 120 };

    store.applyEvent({
      type: 'session_started',
      session_id: 'session-1',
      snapshot: {
        session_id: 'session-1',
        partial_segments: [partialOne],
        committed_segments: [],
        summary_blocks: [],
        mindmap_nodes: [],
        mindmap_edges: [],
      },
    });
    store.applyEvent({ type: 'partial_transcript', segment: partialTwo });
    store.applyEvent({ type: 'committed_transcript', segment: committed });

    partialOne.text = 'mutated first';
    partialTwo.text = 'mutated second';
    committed.text = 'mutated final';

    expect(store.getState().partialSegments).toEqual([
      { id: 'partial-2', text: 'second', start_ms: 90, end_ms: 180 },
    ]);
    expect(store.getState().committedSegments).toEqual([
      { id: 'partial-1', text: 'final', start_ms: 70, end_ms: 120 },
    ]);
  });

  it('replaces an existing committed segment when the same id is replayed', () => {
    const store = createSessionStore();

    store.applyEvent({
      type: 'session_started',
      session_id: 'session-1',
      snapshot: {
        session_id: 'session-1',
        partial_segments: [],
        committed_segments: [],
        summary_blocks: [],
        mindmap_nodes: [],
        mindmap_edges: [],
      },
    });

    store.applyEvent({
      type: 'committed_transcript',
      segment: { id: 'segment-1', text: 'first', start_ms: 0, end_ms: 100 },
    });

    store.applyEvent({
      type: 'committed_transcript',
      segment: { id: 'segment-1', text: 'updated', start_ms: 0, end_ms: 120 },
    });

    expect(store.getState().committedSegments).toEqual([
      { id: 'segment-1', text: 'updated', start_ms: 0, end_ms: 120 },
    ]);
  });

  it('replaces an existing partial segment when the same id is updated', () => {
    const store = createSessionStore();

    store.applyEvent({
      type: 'session_started',
      session_id: 'session-1',
      snapshot: {
        session_id: 'session-1',
        partial_segments: [],
        committed_segments: [],
        summary_blocks: [],
        mindmap_nodes: [],
        mindmap_edges: [],
      },
    });

    store.applyEvent({
      type: 'partial_transcript',
      segment: { id: 'segment-1', text: 'draft one', start_ms: 0, end_ms: 100 },
    });

    store.applyEvent({
      type: 'partial_transcript',
      segment: { id: 'segment-1', text: 'draft two', start_ms: 0, end_ms: 140 },
    });

    expect(store.getState().partialSegments).toEqual([
      { id: 'segment-1', text: 'draft two', start_ms: 0, end_ms: 140 },
    ]);
  });

  it('applies transcript, summary, graph, and error events', () => {
    const store = createSessionStore();

    const events: SessionEvent[] = [
      {
        type: 'session_started',
        session_id: 'session-1',
        snapshot: {
          session_id: 'session-1',
          partial_segments: [],
          committed_segments: [],
          summary_blocks: [],
          mindmap_nodes: [],
          mindmap_edges: [],
        },
      },
      {
        type: 'partial_transcript',
        segment: { id: 'partial-1', text: 'hello', start_ms: 0, end_ms: 100 },
      },
      {
        type: 'committed_transcript',
        segment: { id: 'partial-1', text: 'hello world', start_ms: 0, end_ms: 300 },
      },
      {
        type: 'summary_updated',
        blocks: [{ id: 'summary-1', text: 'Greeting captured' }],
      },
      {
        type: 'graph_updated',
        nodes: [{ id: 'node-1', label: 'Greeting' }],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      },
      {
        type: 'error',
        message: 'Socket disconnected',
      },
    ];

    events.forEach((event) => {
      store.applyEvent(event);
    });

    expect(store.getState()).toEqual({
      sessionId: 'session-1',
      partialSegments: [],
      committedSegments: [
        { id: 'partial-1', text: 'hello world', start_ms: 0, end_ms: 300 },
      ],
      summaryBlocks: [{ id: 'summary-1', text: 'Greeting captured' }],
      mindmapNodes: [{ id: 'node-1', label: 'Greeting' }],
      mindmapEdges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
      processingStage: 'ready',
      lastError: 'Socket disconnected',
    });
  });

  it('clears the last error when a later successful session event arrives', () => {
    const store = createSessionStore();

    store.applyEvent({
      type: 'error',
      message: 'Socket disconnected',
    });

    store.applyEvent({
      type: 'summary_updated',
      blocks: [{ id: 'summary:0', text: 'Recovered summary' }],
    });

    expect(store.getState().lastError).toBeNull();
  });
});
