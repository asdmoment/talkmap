import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { applySessionEvent, seedSessionState, resetSessionState } from './state/sessionRuntime';

const micVadNew = vi.fn();
const { createSessionSocket } = vi.hoisted(() => ({
  createSessionSocket: vi.fn(),
}));

let sessionSocketMock: { close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: micVadNew,
  },
}));

vi.mock('./lib/socket', async () => {
  const actual = await vi.importActual<typeof import('./lib/socket')>('./lib/socket');
  return {
    ...actual,
    createSessionSocket,
  };
});

function createMockStream(trackCount = 1): {
  stream: MediaStream;
  tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
} {
  const tracks = Array.from({ length: trackCount }, () => ({
    stop: vi.fn(),
  }));

  return {
    stream: {
      getTracks: () => tracks,
      getAudioTracks: () => tracks,
    } as unknown as MediaStream,
    tracks,
  };
}

describe('App shell', () => {
  beforeEach(() => {
    micVadNew.mockReset();
    createSessionSocket.mockReset();
    sessionSocketMock = { close: vi.fn(), send: vi.fn() };
    createSessionSocket.mockReturnValue(sessionSocketMock as unknown as WebSocket);
    resetSessionState();
  });

  it('renders three panes and an idle recorder state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /transcript/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /mind map/i })).toBeInTheDocument();
    expect(screen.getByText(/status: idle/i)).toBeInTheDocument();
  });

  it('disables the recorder toggle while microphone permission is pending', async () => {
    micVadNew.mockResolvedValueOnce({
      start: vi.fn(),
      pause: vi.fn(),
    });
    let resolveStream: ((value: MediaStream) => void) | null = null;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    const originalMediaDevices = navigator.mediaDevices;

    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia,
      },
    });

    try {
      render(<App />);

      const toggle = screen.getByRole('button', { name: /start desk/i });
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/status: requesting/i)).toBeInTheDocument();
      });
      expect(toggle).toBeDisabled();

      await act(async () => {
        resolveStream?.(createMockStream().stream);
      });
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('stops the microphone stream when VAD initialization fails', async () => {
    const { stream, tracks } = createMockStream();
    const getUserMedia = vi.fn(async () => stream);
    const originalMediaDevices = navigator.mediaDevices;

    micVadNew.mockRejectedValueOnce(new Error('VAD failed to initialize'));

    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia,
      },
    });

    try {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /start desk/i }));

      await waitFor(() => {
        expect(screen.getByText(/status: error/i)).toBeInTheDocument();
      });

      expect(tracks[0].stop).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/vad failed to initialize/i)).toBeInTheDocument();
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('renders transcript and summary panes from the current session state', () => {
    seedSessionState({
      sessionId: 'session-8',
      committedSegments: [
        { id: 'committed-2', text: 'Budget is aligned for the pilot launch.', start_ms: 2200, end_ms: 3200 },
        { id: 'committed-1', text: 'We have a clean outline for the live pilot.', start_ms: 0, end_ms: 1800 },
      ],
      partialSegments: [
        { id: 'partial-1', text: 'Need to confirm the guest list', start_ms: 1800, end_ms: 2600 },
      ],
      summaryBlocks: [
        { id: 'summary:0', text: 'The team aligned on the pilot structure and pacing.' },
        { id: 'summary:1', text: 'Owners and deadlines are now visible across the workstream.' },
        { id: 'bullet:0', text: 'Production needs one full technical rehearsal.' },
        { id: 'action:0', text: 'Send the venue shortlist before Friday.' },
      ],
      mindmapNodes: [],
      mindmapEdges: [],
      lastError: null,
    });

    render(<App />);

    const transcriptFeed = screen.getByLabelText('Transcript feed');
    const renderedLines = transcriptFeed.querySelectorAll('.transcript-line p');

    expect(renderedLines[0]).toHaveTextContent('We have a clean outline for the live pilot.');
    expect(renderedLines[1]).toHaveTextContent('Budget is aligned for the pilot launch.');
    expect(renderedLines[2]).toHaveTextContent('Need to confirm the guest list');
    expect(screen.getByText('We have a clean outline for the live pilot.')).toBeInTheDocument();
    expect(screen.getByText('Need to confirm the guest list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('The team aligned on the pilot structure and pacing.')).toBeInTheDocument();
    expect(screen.getByText('Owners and deadlines are now visible across the workstream.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Action items' })).toBeInTheDocument();
    expect(screen.getByText('Send the venue shortlist before Friday.')).toBeInTheDocument();
  });

  it('rerenders panes when session events are applied through the runtime bridge', async () => {
    render(<App />);

    act(() => {
      applySessionEvent({
        type: 'summary_updated',
        blocks: [{ id: 'summary:0', text: 'A fresh overview from runtime events.' }],
      });
      applySessionEvent({
        type: 'graph_updated',
        nodes: [{ id: 'theme', label: 'Theme' }],
        edges: [],
      });
    });

    expect(screen.getByText('A fresh overview from runtime events.')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('opens the session websocket on mount and applies incoming events', () => {
    render(<App />);

    expect(createSessionSocket).toHaveBeenCalledTimes(1);

    const [, onEvent] = createSessionSocket.mock.calls[0];

    act(() => {
      onEvent({
        type: 'session_started',
        session_id: 'session-live',
        snapshot: {
          session_id: 'session-live',
          partial_segments: [],
          committed_segments: [],
          summary_blocks: [],
          mindmap_nodes: [],
          mindmap_edges: [],
        },
      });
      onEvent({
        type: 'summary_updated',
        blocks: [{ id: 'summary:0', text: 'Overview from websocket.' }],
      });
      onEvent({
        type: 'graph_updated',
        nodes: [{ id: 'live-node', label: 'Live node' }],
        edges: [],
      });
    });

    expect(screen.getByText('Overview from websocket.')).toBeInTheDocument();
    expect(screen.getByText('Live node')).toBeInTheDocument();
  });

  it('shows only the latest live partial when the same partial id is updated', () => {
    render(<App />);

    act(() => {
      applySessionEvent({
        type: 'partial_transcript',
        segment: { id: 'partial-live', text: 'First draft', start_ms: 0, end_ms: 100 },
      });
      applySessionEvent({
        type: 'partial_transcript',
        segment: { id: 'partial-live', text: 'Refined draft', start_ms: 0, end_ms: 140 },
      });
    });

    expect(screen.queryByText('First draft')).not.toBeInTheDocument();
    expect(screen.getByText('Refined draft')).toBeInTheDocument();
  });

  it('surfaces session-level socket errors in the recorder status', () => {
    render(<App />);

    act(() => {
      applySessionEvent({
        type: 'error',
        message: 'Session connection closed',
      });
    });

    expect(screen.getByText(/status: error/i)).toBeInTheDocument();
    expect(screen.getByText('Session connection closed')).toBeInTheDocument();
  });

  it('keeps the stop control available when a session error arrives during active capture', async () => {
    const { stream, tracks } = createMockStream();
    const getUserMedia = vi.fn(async () => stream);
    const originalMediaDevices = navigator.mediaDevices;

    micVadNew.mockResolvedValueOnce({
      start: vi.fn(),
      pause: vi.fn(),
    });

    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia,
      },
    });

    try {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /start desk/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /stop desk/i })).toBeInTheDocument();
      });

      act(() => {
        applySessionEvent({
          type: 'error',
          message: 'Session connection closed',
        });
      });

      const stopButton = screen.getByRole('button', { name: /stop desk/i });
      fireEvent.click(stopButton);

      expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('sends finalized VAD utterances to the active session websocket', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn(async () => stream);
    const originalMediaDevices = navigator.mediaDevices;
    let speechEndCallback: ((audio: Float32Array) => void) | null = null;

    micVadNew.mockImplementationOnce(async (options) => {
      speechEndCallback = options.onSpeechEnd;
      return { start: vi.fn(), pause: vi.fn() };
    });

    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia,
      },
    });

    try {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /start desk/i }));

      await waitFor(() => {
        expect(micVadNew).toHaveBeenCalledTimes(1);
      });

      act(() => {
        speechEndCallback?.(new Float32Array([0.1, -0.1, 0.2]));
      });

      expect(sessionSocketMock.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(sessionSocketMock.send.mock.calls[0][0])).toEqual({
        type: 'utterance',
        utterance_id: 'utterance-1',
        sample_rate: 16000,
        samples: [0.1, -0.1, 0.2],
      });
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('does not duplicate the first fallback summary block when no overview is present', () => {
    seedSessionState({
      summaryBlocks: [{ id: 'bullet:0', text: 'Lock the stage rehearsal by Thursday.' }],
    });

    render(<App />);

    expect(screen.getAllByText('Lock the stage rehearsal by Thursday.')).toHaveLength(1);
  });
});
