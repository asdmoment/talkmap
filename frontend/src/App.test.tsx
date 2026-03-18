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

/** Click the startup hero's "+ 新建会话" button to enter session view */
function enterSessionView() {
  const btn = document.querySelector('.startup-new-btn') as HTMLButtonElement;
  fireEvent.click(btn);
}

describe('App shell', () => {
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
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

  it('renders the startup screen with session history', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '开始你的思维之旅' })).toBeInTheDocument();
    expect(screen.getByText('选择一个历史会话继续，或开始新的对话')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TalkMap' })).toBeInTheDocument();
    expect(screen.getByText('暂无历史会话')).toBeInTheDocument();
  });

  it('enters session view when clicking new session button', () => {
    render(<App />);
    enterSessionView();

    expect(createSessionSocket).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'TalkMap' })).toBeInTheDocument();
  });

  it('shows transcript success even when thought organization fails', () => {
    render(<App />);
    enterSessionView();

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
    expect(screen.getByText('文本转化成功，但深度解析出现波动。')).toBeInTheDocument();
  });

  it('shows separate transcribing and summarizing states', () => {
    render(<App />);
    enterSessionView();

    act(() => {
      seedSessionState({
        sessionId: 'session-8',
        processingStage: 'transcribing',
      });
    });

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
    render(<App />);
    enterSessionView();

    act(() => {
      seedSessionState({
        sessionId: 'session-8',
        processingStage: 'transcribing',
      });
    });

    act(() => {
      applySessionEvent({
        type: 'error',
        message: 'Session connection closed',
      });
    });

    // Error is shown in session stats (sessionId is set) and in the recorder status copy
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
      enterSessionView();

      const toggle = screen.getByRole('button', { name: '开启倾诉' });
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('正在唤醒麦克风，请授予浏览器访问权限。')).toBeInTheDocument();
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
      enterSessionView();

      fireEvent.click(screen.getByRole('button', { name: '开启倾诉' }));

      await waitFor(() => {
        expect(screen.getByText(/VAD failed to initialize/i)).toBeInTheDocument();
      });

      expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('renders transcript and summary panes from the current session state', () => {
    render(<App />);
    enterSessionView();

    act(() => {
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
    });

    const transcriptFeed = screen.getByLabelText('思维原典');
    const renderedLines = transcriptFeed.querySelectorAll('.transcript-line p');

    expect(renderedLines[0]).toHaveTextContent('We have a clean outline for the live pilot.');
    expect(renderedLines[1]).toHaveTextContent('Budget is aligned for the pilot launch.');
    expect(renderedLines[2]).toHaveTextContent('Need to confirm the guest list');
    expect(screen.getByText('We have a clean outline for the live pilot.')).toBeInTheDocument();
    expect(screen.getByText('Need to confirm the guest list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '核心脉络' })).toBeInTheDocument();
    expect(screen.getByText('The team aligned on the pilot structure and pacing.')).toBeInTheDocument();
    expect(screen.getByText('Owners and deadlines are now visible across the workstream.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '行动指南' })).toBeInTheDocument();
    expect(screen.getByText('Send the venue shortlist before Friday.')).toBeInTheDocument();
  });

  it('rerenders panes when session events are applied through the runtime bridge', async () => {
    render(<App />);
    enterSessionView();

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

  it('opens the session websocket when entering session view', () => {
    render(<App />);
    enterSessionView();

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

  it('does not create a session socket while on the startup screen', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(createSessionSocket).not.toHaveBeenCalled();
    });
  });

  it('shows only the latest live partial when the same partial id is updated', () => {
    render(<App />);
    enterSessionView();

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
    enterSessionView();

    act(() => {
      applySessionEvent({
        type: 'error',
        message: 'Session connection closed',
      });
    });

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
      enterSessionView();

      fireEvent.click(screen.getByRole('button', { name: '开启倾诉' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '停止捕获' })).toBeInTheDocument();
      });

      act(() => {
        applySessionEvent({
          type: 'error',
          message: 'Session connection closed',
        });
      });

      const stopButton = screen.getByRole('button', { name: '停止捕获' });
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
      enterSessionView();

      fireEvent.click(screen.getByRole('button', { name: '开启倾诉' }));

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
      enterSessionView();

      fireEvent.click(screen.getByRole('button', { name: '开启倾诉' }));

      await waitFor(() => {
        expect(micVadNew).toHaveBeenCalledTimes(1);
      });

      act(() => {
        speechEndCallback?.(new Float32Array([0.1, -0.1, 0.2]));
      });

      expect(screen.getByText('音频片段已切分，正在经由 AI 转化为高精度文本...')).toBeInTheDocument();
    } finally {
      vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: originalMediaDevices,
      });
    }
  });

  it('does not duplicate the first fallback summary block when no overview is present', () => {
    render(<App />);
    enterSessionView();

    act(() => {
      seedSessionState({
        summaryBlocks: [{ id: 'bullet:0', text: 'Lock the stage rehearsal by Thursday.' }],
      });
    });

    expect(screen.getAllByText('Lock the stage rehearsal by Thursday.')).toHaveLength(1);
  });

  it('can navigate back to startup from session view', () => {
    render(<App />);
    enterSessionView();

    expect(createSessionSocket).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));

    expect(screen.getByRole('heading', { name: '开始你的思维之旅' })).toBeInTheDocument();
  });
});
