import type {
  CommittedSegment,
  MindmapEdge,
  MindmapNode,
  PartialSegment,
  SessionEvent,
  SummaryBlock,
} from '../lib/socket';

export type ProcessingStage =
  | 'idle'
  | 'transcribing'
  | 'summarizing'
  | 'transcribed_with_llm_error'
  | 'ready';

export interface SessionState {
  sessionId: string | null;
  title: string | null;
  partialSegments: PartialSegment[];
  committedSegments: CommittedSegment[];
  summaryBlocks: SummaryBlock[];
  mindmapNodes: MindmapNode[];
  mindmapEdges: MindmapEdge[];
  processingStage: ProcessingStage;
  lastError: string | null;
}

type Listener = (state: SessionState) => void;

const initialState = (): SessionState => ({
  sessionId: null,
  title: null,
  partialSegments: [],
  committedSegments: [],
  summaryBlocks: [],
  mindmapNodes: [],
  mindmapEdges: [],
  processingStage: 'idle',
  lastError: null,
});

function cloneState(state: SessionState): SessionState {
  return {
    sessionId: state.sessionId,
    title: state.title,
    partialSegments: state.partialSegments.map((segment) => ({ ...segment })),
    committedSegments: state.committedSegments.map((segment) => ({ ...segment })),
    summaryBlocks: state.summaryBlocks.map((block) => ({ ...block })),
    mindmapNodes: state.mindmapNodes.map((node) => ({ ...node })),
    mindmapEdges: state.mindmapEdges.map((edge) => ({ ...edge })),
    processingStage: state.processingStage,
    lastError: state.lastError,
  };
}

export function createSessionStore(initial?: Partial<SessionState>) {
  let state: SessionState = cloneState({ ...initialState(), ...initial });
  const listeners = new Set<Listener>();

  const notify = () => {
    const snapshot = cloneState(state);
    listeners.forEach((listener) => {
      listener(snapshot);
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
            title: event.snapshot.title ?? null,
            partialSegments: event.snapshot.partial_segments.map((segment) => ({ ...segment })),
            committedSegments: event.snapshot.committed_segments.map((segment) => ({ ...segment })),
            summaryBlocks: event.snapshot.summary_blocks.map((block) => ({ ...block })),
            mindmapNodes: event.snapshot.mindmap_nodes.map((node) => ({ ...node })),
            mindmapEdges: event.snapshot.mindmap_edges.map((edge) => ({ ...edge })),
            processingStage: 'idle',
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
            processingStage: 'transcribing',
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
            processingStage: 'summarizing',
            lastError: null,
          };
          break;
        case 'summary_updated':
          state = {
            ...state,
            summaryBlocks: event.blocks.map((block) => ({ ...block })),
            processingStage: 'summarizing',
            lastError: null,
          };
          break;
        case 'graph_updated':
          state = {
            ...state,
            mindmapNodes: event.nodes.map((node) => ({ ...node })),
            mindmapEdges: event.edges.map((edge) => ({ ...edge })),
            processingStage: 'ready',
            lastError: null,
          };
          break;
        case 'title_updated':
          state = { ...state, title: event.title };
          break;
        case 'error':
          state = {
            ...state,
            processingStage:
              state.committedSegments.length > 0 &&
              event.message.startsWith('Thought organization failed:')
                ? 'transcribed_with_llm_error'
                : state.processingStage,
            lastError: event.message,
          };
          break;
      }

      notify();
      return cloneState(state);
    },

    setProcessingStage(processingStage: ProcessingStage): SessionState {
      state = {
        ...state,
        processingStage,
      };

      notify();
      return cloneState(state);
    },
  };
}
