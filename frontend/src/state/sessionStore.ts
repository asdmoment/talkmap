import type {
  CommittedSegment,
  MindmapEdge,
  MindmapNode,
  PartialSegment,
  SessionEvent,
  SummaryBlock,
} from '../lib/socket';

export interface SessionState {
  sessionId: string | null;
  partialSegments: PartialSegment[];
  committedSegments: CommittedSegment[];
  summaryBlocks: SummaryBlock[];
  mindmapNodes: MindmapNode[];
  mindmapEdges: MindmapEdge[];
  lastError: string | null;
}

type Listener = (state: SessionState) => void;

const initialState = (): SessionState => ({
  sessionId: null,
  partialSegments: [],
  committedSegments: [],
  summaryBlocks: [],
  mindmapNodes: [],
  mindmapEdges: [],
  lastError: null,
});

function cloneState(state: SessionState): SessionState {
  return {
    sessionId: state.sessionId,
    partialSegments: state.partialSegments.map((segment) => ({ ...segment })),
    committedSegments: state.committedSegments.map((segment) => ({ ...segment })),
    summaryBlocks: state.summaryBlocks.map((block) => ({ ...block })),
    mindmapNodes: state.mindmapNodes.map((node) => ({ ...node })),
    mindmapEdges: state.mindmapEdges.map((edge) => ({ ...edge })),
    lastError: state.lastError,
  };
}

export function createSessionStore(initial?: Partial<SessionState>) {
  let state: SessionState = cloneState({ ...initialState(), ...initial });
  const listeners = new Set<Listener>();

  const notify = () => {
    const snapshot = cloneState(state);
    listeners.forEach((listener) => {
      listener(cloneState(snapshot));
    });
  };

  return {
    getState(): SessionState {
      return cloneState(state);
    },

    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    applyEvent(event: SessionEvent): SessionState {
      switch (event.type) {
        case 'session_started':
          state = {
            sessionId: event.snapshot.session_id,
            partialSegments: event.snapshot.partial_segments.map((segment) => ({ ...segment })),
            committedSegments: event.snapshot.committed_segments.map((segment) => ({ ...segment })),
            summaryBlocks: event.snapshot.summary_blocks.map((block) => ({ ...block })),
            mindmapNodes: event.snapshot.mindmap_nodes.map((node) => ({ ...node })),
            mindmapEdges: event.snapshot.mindmap_edges.map((edge) => ({ ...edge })),
            lastError: null,
          };
          break;
        case 'partial_transcript':
          state = {
            ...state,
            partialSegments: [
              ...state.partialSegments.filter((segment) => segment.id !== event.segment.id),
              { ...event.segment },
            ],
            lastError: null,
          };
          break;
        case 'committed_transcript':
          state = {
            ...state,
            partialSegments: state.partialSegments.filter((segment) => segment.id !== event.segment.id),
            committedSegments: [
              ...state.committedSegments.filter((segment) => segment.id !== event.segment.id),
              { ...event.segment },
            ],
            lastError: null,
          };
          break;
        case 'summary_updated':
          state = {
            ...state,
            summaryBlocks: event.blocks.map((block) => ({ ...block })),
            lastError: null,
          };
          break;
        case 'graph_updated':
          state = {
            ...state,
            mindmapNodes: event.nodes.map((node) => ({ ...node })),
            mindmapEdges: event.edges.map((edge) => ({ ...edge })),
            lastError: null,
          };
          break;
        case 'error':
          state = {
            ...state,
            lastError: event.message,
          };
          break;
      }

      notify();
      return cloneState(state);
    },
  };
}
