import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import App from './App';
import { applySessionEvent, seedSessionState, resetSessionState } from './state/sessionRuntime';

const micVadNew = vi.fn();
const { createSessionSocket } = vi.hoisted(() => ({
  createSessionSocket: vi.fn(),
}));

let sessionSocketMock: {
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};
let sessionSocketListeners: Map<string, Array<() => void>>;

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
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    micVadNew.mockReset();
    createSessionSocket.mockReset();
    sessionSocketListeners = new Map();
    sessionSocketMock = {
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const listeners = sessionSocketListeners.get(type) ?? [];
        listeners.push(listener);
        sessionSocketListeners.set(type, listeners);
      }),
      close: vi.fn(() => {
        sessionSocketListeners.get('close')?.forEach((listener) => {
          listener();
        });
      }),
      send: vi.fn(),
    };
    createSessionSocket.mockReturnValue(sessionSocketMock as unknown as WebSocket);
    resetSessionState();
  });

  it('renders the Chinese personal thought workbench shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '把你说出口的想法，整理成清晰脉络' })).toBeInTheDocument();
    expect(screen.getByText('适合一个人长段表达、梳理思路、沉淀下一步行动')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始梳理' })).toBeInTheDocument();
    expect(screen.getByText('当前状态：未开始')).toBeInTheDocument();
    expect(screen.getByText('本次梳理')).toBeInTheDocument();
    expect(screen.getByText('思路会随着你的表达逐步成形')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '思路原文' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '整理结果' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '思路脉络' })).toBeInTheDocument();
  });

  it('shows Chinese thought-workbench status copy', () => {
    render(<App />);

    expect(screen.getByText('点击开始，记录这一段正在成形的想法')).toBeInTheDocument();
    expect(screen.getByText('当前状态：未开始')).toBeInTheDocument();
  });

  it('shows transcript success even when thought organization fails', () => {
    render(<App />);

    act(() => {
      applySessionEvent({
        type: 'committed_transcript',
        segment: {
          id: 'utt-1:0',
          text: '先整理一下明天安排',
          start_ms: 0,
          end_ms: 800,
        },
      });
      applySessionEvent({
        type: 'error',
        message: 'Thought organization failed: LLM offline',
      });
    });

    expect(screen.getByText('先整理一下明天安排')).toBeInTheDocument();
    expect(screen.getByText('文字已识别，但整理失败')).toBeInTheDocument();
  });

  it('shows separate transcribing and summarizing states', () => {
    seedSessionState({
      sessionId: 'session-8',
      processingStage: 'transcribing',
    });

    render(<App />);

    expect(screen.getByText('正在识别语音')).toBeInTheDocument();

    act(() => {
      applySessionEvent({
        type: 'committed_transcript',
        segment: { id: 'utt-1:0', text: '一条已识别文字', start_ms: 0, end_ms: 600 },
      });
    });

    expect(screen.getByText('正在整理思路')).toBeInTheDocument();
  });

  it('shows transport errors even if a processing stage was already active', () => {
    seedSessionState({
      sessionId: 'session-8',
      processingStage: 'transcribing',
    });

    render(<App />);

    act(() => {
      applySessionEvent({
        type: 'error',
        message: 'Session connection closed',
      });
    });

    expect(screen.getByText('当前状态：连接异常')).toBeInTheDocument();
    expect(screen.getByText('Session connection closed')).toBeInTheDocument();
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

      const toggle = screen.getByRole('button', { name: '开始梳理' });
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('当前状态：请求权限中')).toBeInTheDocument();
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

      fireEvent.click(screen.getByRole('button', { name: '开始梳理' }));

      await waitFor(() => {
        expect(screen.getByText('当前状态：连接异常')).toBeInTheDocument();
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

    const transcriptFeed = screen.getByLabelText('思路原文');
    const renderedLines = transcriptFeed.querySelectorAll('.transcript-line p');

    expect(renderedLines[0]).toHaveTextContent('We have a clean outline for the live pilot.');
    expect(renderedLines[1]).toHaveTextContent('Budget is aligned for the pilot launch.');
    expect(renderedLines[2]).toHaveTextContent('Need to confirm the guest list');
    expect(screen.getByText('We have a clean outline for the live pilot.')).toBeInTheDocument();
    expect(screen.getByText('Need to confirm the guest list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '一句话总结' })).toBeInTheDocument();
    expect(screen.getByText('The team aligned on the pilot structure and pacing.')).toBeInTheDocument();
    expect(screen.getByText('Owners and deadlines are now visible across the workstream.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '下一步行动' })).toBeInTheDocument();
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

  it('does not create a second session socket during the initial StrictMode remount', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(createSessionSocket).toHaveBeenCalledTimes(1);
    });
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

    expect(screen.getByText('当前状态：连接异常')).toBeInTheDocument();
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

      fireEvent.click(screen.getByRole('button', { name: '开始梳理' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '结束梳理' })).toBeInTheDocument();
      });

      act(() => {
        applySessionEvent({
          type: 'error',
          message: 'Session connection closed',
        });
      });

      const stopButton = screen.getByRole('button', { name: '结束梳理' });
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

      fireEvent.click(screen.getByRole('button', { name: '开始梳理' }));

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

  it('shows transcribing status after an utterance is queued to the backend', async () => {
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

      fireEvent.click(screen.getByRole('button', { name: '开始梳理' }));

      await waitFor(() => {
        expect(micVadNew).toHaveBeenCalledTimes(1);
      });

      act(() => {
        speechEndCallback?.(new Float32Array([0.1, -0.1, 0.2]));
      });

      expect(screen.getByText('当前状态：正在识别语音')).toBeInTheDocument();
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
