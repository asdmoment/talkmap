export type SessionEventType =
  | 'session_started'
  | 'partial_transcript'
  | 'committed_transcript'
  | 'summary_updated'
  | 'graph_updated'
  | 'error';

export interface PartialSegment {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface CommittedSegment {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface SummaryBlock {
  id: string;
  text: string;
}

export interface MindmapNode {
  id: string;
  label: string;
}

export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
}

export interface SessionSnapshot {
  session_id: string;
  partial_segments: PartialSegment[];
  committed_segments: CommittedSegment[];
  summary_blocks: SummaryBlock[];
  mindmap_nodes: MindmapNode[];
  mindmap_edges: MindmapEdge[];
}

export interface SessionStartedEvent {
  type: 'session_started';
  session_id: string;
  snapshot: SessionSnapshot;
}

export interface PartialTranscriptEvent {
  type: 'partial_transcript';
  segment: PartialSegment;
}

export interface CommittedTranscriptEvent {
  type: 'committed_transcript';
  segment: CommittedSegment;
}

export interface SummaryUpdatedEvent {
  type: 'summary_updated';
  blocks: SummaryBlock[];
}

export interface GraphUpdatedEvent {
  type: 'graph_updated';
  nodes: MindmapNode[];
  edges: MindmapEdge[];
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type SessionEvent =
  | SessionStartedEvent
  | PartialTranscriptEvent
  | CommittedTranscriptEvent
  | SummaryUpdatedEvent
  | GraphUpdatedEvent
  | ErrorEvent;

export interface UtteranceMessage {
  type: 'utterance';
  utterance_id: string;
  sample_rate: number;
  samples: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSegmentRange(startMs: unknown, endMs: unknown): startMs is number {
  return (
    isNumber(startMs) &&
    Number.isInteger(startMs) &&
    startMs >= 0 &&
    isNumber(endMs) &&
    Number.isInteger(endMs) &&
    endMs >= 0 &&
    endMs >= startMs
  );
}

function isPartialSegment(value: unknown): value is PartialSegment {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.text) &&
    isValidSegmentRange(value.start_ms, value.end_ms)
  );
}

function isCommittedSegment(value: unknown): value is CommittedSegment {
  return isPartialSegment(value);
}

function isSummaryBlock(value: unknown): value is SummaryBlock {
  return isRecord(value) && isString(value.id) && isString(value.text);
}

function isMindmapNode(value: unknown): value is MindmapNode {
  return isRecord(value) && isString(value.id) && isString(value.label);
}

function isMindmapEdge(value: unknown): value is MindmapEdge {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.source) &&
    isString(value.target)
  );
}

function isArrayOf<T>(value: unknown, guard: (entry: unknown) => entry is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  return (
    isRecord(value) &&
    isString(value.session_id) &&
    isArrayOf(value.partial_segments, isPartialSegment) &&
    isArrayOf(value.committed_segments, isCommittedSegment) &&
    isArrayOf(value.summary_blocks, isSummaryBlock) &&
    isArrayOf(value.mindmap_nodes, isMindmapNode) &&
    isArrayOf(value.mindmap_edges, isMindmapEdge)
  );
}

function toPartialSegment(segment: PartialSegment): PartialSegment {
  return {
    id: segment.id,
    text: segment.text,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
  };
}

function toCommittedSegment(segment: CommittedSegment): CommittedSegment {
  return {
    id: segment.id,
    text: segment.text,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
  };
}

function toSummaryBlock(block: SummaryBlock): SummaryBlock {
  return {
    id: block.id,
    text: block.text,
  };
}

function toMindmapNode(node: MindmapNode): MindmapNode {
  return {
    id: node.id,
    label: node.label,
  };
}

function toMindmapEdge(edge: MindmapEdge): MindmapEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
  };
}

function toSessionSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    session_id: snapshot.session_id,
    partial_segments: snapshot.partial_segments.map(toPartialSegment),
    committed_segments: snapshot.committed_segments.map(toCommittedSegment),
    summary_blocks: snapshot.summary_blocks.map(toSummaryBlock),
    mindmap_nodes: snapshot.mindmap_nodes.map(toMindmapNode),
    mindmap_edges: snapshot.mindmap_edges.map(toMindmapEdge),
  };
}

export function parseSessionEvent(value: unknown): SessionEvent {
  if (!isRecord(value) || !isString(value.type)) {
    throw new Error('Invalid session event');
  }

  switch (value.type) {
    case 'session_started':
      if (
        isString(value.session_id) &&
        isSessionSnapshot(value.snapshot) &&
        value.session_id === value.snapshot.session_id
      ) {
        return {
          type: 'session_started',
          session_id: value.session_id,
          snapshot: toSessionSnapshot(value.snapshot),
        };
      }
      break;
    case 'partial_transcript':
      if (isPartialSegment(value.segment)) {
        return {
          type: 'partial_transcript',
          segment: toPartialSegment(value.segment),
        };
      }
      break;
    case 'committed_transcript':
      if (isCommittedSegment(value.segment)) {
        return {
          type: 'committed_transcript',
          segment: toCommittedSegment(value.segment),
        };
      }
      break;
    case 'summary_updated':
      if (isArrayOf(value.blocks, isSummaryBlock)) {
        return {
          type: 'summary_updated',
          blocks: value.blocks.map(toSummaryBlock),
        };
      }
      break;
    case 'graph_updated':
      if (isArrayOf(value.nodes, isMindmapNode) && isArrayOf(value.edges, isMindmapEdge)) {
        return {
          type: 'graph_updated',
          nodes: value.nodes.map(toMindmapNode),
          edges: value.edges.map(toMindmapEdge),
        };
      }
      break;
    case 'error':
      if (isString(value.message)) {
        return {
          type: 'error',
          message: value.message,
        };
      }
      break;
  }

  throw new Error('Invalid session event');
}

export function createSessionSocket(
  url: string,
  onEvent: (event: SessionEvent) => void,
  options: {
    errorMessage?: string;
    closeErrorMessage?: string | null | (() => string | null);
  } = {},
): WebSocket {
  const {
    errorMessage = 'Session connection error',
    closeErrorMessage = 'Session connection closed',
  } = options;
  const socket = new WebSocket(url);
  socket.addEventListener('message', (message) => {
    let event: SessionEvent;

    try {
      event = parseSessionEvent(JSON.parse(message.data));
    } catch {
      onEvent({
        type: 'error',
        message: 'Invalid session event',
      });
      return;
    }

    onEvent(event);
  });
  socket.addEventListener('error', () => {
    if (!errorMessage) {
      return;
    }

    onEvent({
      type: 'error',
      message: errorMessage,
    });
  });
  socket.addEventListener('close', () => {
    const resolvedCloseErrorMessage =
      typeof closeErrorMessage === 'function' ? closeErrorMessage() : closeErrorMessage;

    if (!resolvedCloseErrorMessage) {
      return;
    }

    onEvent({
      type: 'error',
      message: resolvedCloseErrorMessage,
    });
  });
  return socket;
}

export function sendSessionUtterance(
  socket: Pick<WebSocket, 'send'>
    & Partial<Pick<WebSocket, 'readyState' | 'addEventListener' | 'removeEventListener'>>,
  message: Omit<UtteranceMessage, 'type'>,
) {
  const payload = JSON.stringify({
    type: 'utterance',
    utterance_id: message.utterance_id,
    sample_rate: message.sample_rate,
    samples: message.samples,
  } satisfies UtteranceMessage);

  if (typeof socket.readyState !== 'number' || socket.readyState === 1) {
    socket.send(payload);
    return true;
  }

  if (socket.readyState === 0 && typeof socket.addEventListener === 'function') {
    const flush = () => {
      socket.send(payload);
      socket.removeEventListener?.('open', flush);
    };
    socket.addEventListener('open', flush);
    return true;
  }

  if (typeof socket.readyState === 'number' && socket.readyState !== 1) {
    return false;
  }

  socket.send(payload);
  return true;
}
