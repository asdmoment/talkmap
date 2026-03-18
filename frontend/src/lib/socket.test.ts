import { createSessionSocket, parseSessionEvent, sendSessionUtterance } from './socket';

describe('socket event validation', () => {
  it('parses a valid session_started payload', () => {
    expect(
      parseSessionEvent({
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
      }),
    ).toEqual({
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
  });

  it('rejects invalid websocket payloads at runtime', () => {
    expect(() =>
      parseSessionEvent({
        type: 'committed_transcript',
        segment: { id: 'segment-1', text: 'hello', start_ms: 'bad', end_ms: 100 },
      }),
    ).toThrow('Invalid session event');
  });

  it('rejects segments with non-integer, negative, or inverted time ranges', () => {
    expect(() =>
      parseSessionEvent({
        type: 'partial_transcript',
        segment: { id: 'segment-1', text: 'hello', start_ms: 1.5, end_ms: 100 },
      }),
    ).toThrow('Invalid session event');

    expect(() =>
      parseSessionEvent({
        type: 'partial_transcript',
        segment: { id: 'segment-1', text: 'hello', start_ms: -1, end_ms: 100 },
      }),
    ).toThrow('Invalid session event');

    expect(() =>
      parseSessionEvent({
        type: 'committed_transcript',
        segment: { id: 'segment-1', text: 'hello', start_ms: 100, end_ms: 99 },
      }),
    ).toThrow('Invalid session event');
  });

  it('rejects session_started payloads when top-level and snapshot session ids differ', () => {
    expect(() =>
      parseSessionEvent({
        type: 'session_started',
        session_id: 'session-1',
        snapshot: {
          session_id: 'session-2',
          partial_segments: [],
          committed_segments: [],
          summary_blocks: [],
          mindmap_nodes: [],
          mindmap_edges: [],
        },
      }),
    ).toThrow('Invalid session event');
  });

  it('converts malformed incoming frames into error events', () => {
    const originalWebSocket = globalThis.WebSocket;
    const onEvent = vi.fn();
    let messageHandler: ((event: { data: string }) => void) | undefined;

    class MockWebSocket {
      addEventListener(type: string, listener: (event: { data: string }) => void) {
        if (type === 'message') {
          messageHandler = listener;
        }
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    try {
      createSessionSocket('ws://example.test/session', onEvent);

      messageHandler?.({ data: '{bad json' });

      expect(onEvent).toHaveBeenCalledWith({
        type: 'error',
        message: 'Invalid session event',
      });
    } finally {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
  });

  it('does not swallow errors thrown by onEvent', () => {
    const originalWebSocket = globalThis.WebSocket;
    const boom = new Error('listener failed');
    const onEvent = vi.fn(() => {
      throw boom;
    });
    let messageHandler: ((event: { data: string }) => void) | undefined;

    class MockWebSocket {
      addEventListener(type: string, listener: (event: { data: string }) => void) {
        if (type === 'message') {
          messageHandler = listener;
        }
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    try {
      createSessionSocket('ws://example.test/session', onEvent);

      expect(() =>
        messageHandler?.({
          data: JSON.stringify({
            type: 'error',
            message: 'server error',
          }),
        }),
      ).toThrow(boom);
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith({
        type: 'error',
        message: 'server error',
      });
    } finally {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
  });

  it('queues utterances until the socket opens', () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    const socket = {
      readyState: 0,
      send: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event?: unknown) => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    };

    expect(
      sendSessionUtterance(socket as unknown as WebSocket, {
        utterance_id: 'utterance-1',
        sample_rate: 16000,
        samples: [0.1, -0.1],
      }),
    ).toBe(true);
    expect(socket.send).not.toHaveBeenCalled();

    socket.readyState = 1;
    listeners.get('open')?.();

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'utterance',
        utterance_id: 'utterance-1',
        sample_rate: 16000,
        samples: [0.1, -0.1],
      }),
    );
  });

  it('emits structured errors when the session socket closes or errors', () => {
    const originalWebSocket = globalThis.WebSocket;
    const onEvent = vi.fn();
    const listeners = new Map<string, () => void>();

    class MockWebSocket {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    try {
      createSessionSocket('ws://example.test/session', onEvent);

      listeners.get('error')?.();
      listeners.get('close')?.();

      expect(onEvent).toHaveBeenNthCalledWith(1, {
        type: 'error',
        message: 'Session connection error',
      });
      expect(onEvent).toHaveBeenNthCalledWith(2, {
        type: 'error',
        message: 'Session connection closed',
      });
    } finally {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
  });

  it('can suppress the close error for intentional teardown', () => {
    const originalWebSocket = globalThis.WebSocket;
    const onEvent = vi.fn();
    const listeners = new Map<string, () => void>();

    class MockWebSocket {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    try {
      createSessionSocket('ws://example.test/session', onEvent, {
        closeErrorMessage: null,
      });

      listeners.get('close')?.();

      expect(onEvent).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
  });

  it('evaluates the close error message at close time', () => {
    const originalWebSocket = globalThis.WebSocket;
    const onEvent = vi.fn();
    const listeners = new Map<string, () => void>();
    let shouldReportClose = false;

    class MockWebSocket {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      }
    }

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    try {
      createSessionSocket('ws://example.test/session', onEvent, {
        closeErrorMessage: () => (shouldReportClose ? 'Session connection closed' : null),
      });

      listeners.get('close')?.();
      expect(onEvent).not.toHaveBeenCalled();

      shouldReportClose = true;
      listeners.get('close')?.();
      expect(onEvent).toHaveBeenCalledWith({
        type: 'error',
        message: 'Session connection closed',
      });
    } finally {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
  });
});
