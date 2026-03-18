import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';
import { useVadRecorder } from './useVadRecorder';

function createMockStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe('useVadRecorder', () => {
  it('starts listening after a StrictMode remount', async () => {
    const stream = createMockStream();
    const vad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    const createVad = vi.fn(async () => vad);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result } = renderHook(() => useVadRecorder({ stream, createVad }), {
      wrapper,
    });

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('listening');
    });

    expect(vad.start).toHaveBeenCalledTimes(1);
  });

  it('creates MicVAD with the provided stream and forwards lifecycle callbacks', async () => {
    const stream = createMockStream();
    const vad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const onFrameProcessed = vi.fn();
    const createVad = vi.fn(async (options) => {
      options.onSpeechStart();
      options.onFrameProcessed([0.2, 0.8], 0.91);
      options.onSpeechEnd(new Float32Array([0.1, 0.2]));
      return vad;
    });

    const { result } = renderHook(() =>
      useVadRecorder({
        stream,
        createVad,
        onSpeechStart,
        onSpeechEnd,
        onFrameProcessed,
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('listening');
    });

    expect(createVad).toHaveBeenCalledTimes(1);
    expect(createVad.mock.calls[0][0]).toMatchObject({
      stream,
      baseAssetPath: '/vad/',
      onnxWASMBasePath: '/vad/',
      submitUserSpeechOnPause: true,
    });
    expect(vad.start).toHaveBeenCalledTimes(1);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    expect(onFrameProcessed).toHaveBeenCalledWith([0.2, 0.8], 0.91);
    expect(onSpeechEnd).toHaveBeenCalledWith(new Float32Array([0.1, 0.2]));
  });

  it('reuses a paused recorder for the same stream and surfaces errors for a fresh stream', async () => {
    const stream = createMockStream();
    const nextStream = createMockStream();
    const pause = vi.fn();
    const start = vi.fn();
    const createVad = vi
      .fn()
      .mockResolvedValueOnce({ start, pause })
      .mockRejectedValueOnce(new Error('VAD failed to initialize'));

    const { result, rerender } = renderHook(
      ({ currentStream }) => useVadRecorder({ stream: currentStream, createVad }),
      {
        initialProps: { currentStream: stream },
      },
    );

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.start();
    });

    expect(createVad).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);

    rerender({ currentStream: nextStream });

    await act(async () => {
      await expect(result.current.start()).rejects.toThrow('VAD failed to initialize');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('VAD failed to initialize');
  });

  it('pauses the previous recorder before replacing it for a new stream', async () => {
    const firstStream = createMockStream();
    const secondStream = createMockStream();
    const firstVad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    const secondVad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    const createVad = vi
      .fn()
      .mockResolvedValueOnce(firstVad)
      .mockResolvedValueOnce(secondVad);

    const { result, rerender } = renderHook(
      ({ currentStream }) => useVadRecorder({ stream: currentStream, createVad }),
      {
        initialProps: { currentStream: firstStream },
      },
    );

    await act(async () => {
      await result.current.start();
    });

    rerender({ currentStream: secondStream });

    await act(async () => {
      await result.current.start();
    });

    expect(firstVad.pause).toHaveBeenCalledTimes(1);
    expect(createVad).toHaveBeenCalledTimes(2);
    expect(createVad.mock.calls[1][0]).toMatchObject({ stream: secondStream });
    expect(secondVad.start).toHaveBeenCalledTimes(1);
  });

  it('reuses the in-flight VAD startup while initialization is pending', async () => {
    const stream = createMockStream();
    const vad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    let resolveVad: ((value: typeof vad) => void) | null = null;
    const createVad = vi.fn(
      () =>
        new Promise<typeof vad>((resolve) => {
          resolveVad = resolve;
        }),
    );
    const { result } = renderHook(() => useVadRecorder({ stream, createVad }));

    let firstStart: Promise<void> | null = null;
    let secondStart: Promise<void> | null = null;

    await act(async () => {
      firstStart = result.current.start();
      secondStart = result.current.start();
    });

    expect(createVad).toHaveBeenCalledTimes(1);

    resolveVad?.(vad);

    await act(async () => {
      await Promise.all([firstStart, secondStart]);
    });

    expect(vad.start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('listening');
  });

  it('pauses a late-created VAD instance when startup resolves after unmount', async () => {
    const stream = createMockStream();
    const vad = {
      start: vi.fn(),
      pause: vi.fn(),
    };
    let resolveVad: ((value: typeof vad) => void) | null = null;
    const createVad = vi.fn(
      () =>
        new Promise<typeof vad>((resolve) => {
          resolveVad = resolve;
        }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useVadRecorder({ stream, createVad }));

    let startPromise: Promise<void> | null = null;

    await act(async () => {
      startPromise = result.current.start();
    });

    unmount();
    resolveVad?.(vad);

    await startPromise;

    expect(vad.start).not.toHaveBeenCalled();
    expect(vad.pause).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
