import '@testing-library/jest-dom/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';
import { useMicrophone } from './useMicrophone';

interface MockTrack {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
}

function createMockStream(trackCount = 1): {
  stream: MediaStream;
  tracks: MockTrack[];
} {
  const tracks = Array.from({ length: trackCount }, () => ({
    kind: 'audio',
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

describe('useMicrophone', () => {
  it('resolves microphone startup after a StrictMode remount', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn(async () => stream);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result } = renderHook(() => useMicrophone({ getUserMedia }), { wrapper });

    let startedStream: MediaStream | null = null;

    await act(async () => {
      startedStream = await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(startedStream).toBe(stream);
    expect(result.current.stream).toBe(stream);
  });

  it('requests microphone access lazily and reuses the active stream', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn(async () => stream);
    const { result } = renderHook(() => useMicrophone({ getUserMedia }));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.stream).toBeNull();

    let startedStream: MediaStream | null = null;

    await act(async () => {
      startedStream = await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(startedStream).toBe(stream);
    expect(result.current.stream).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    let restartedStream: MediaStream | null = null;

    await act(async () => {
      restartedStream = await result.current.start();
    });

    expect(restartedStream).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('captures permission errors and resets stream state', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    const { result } = renderHook(() => useMicrophone({ getUserMedia }));

    await act(async () => {
      await expect(result.current.start()).rejects.toThrow('Permission denied');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBe('Permission denied');
  });

  it('reuses the in-flight getUserMedia request while permission is pending', async () => {
    const { stream } = createMockStream();
    let resolveStream: ((value: MediaStream) => void) | null = null;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    const { result } = renderHook(() => useMicrophone({ getUserMedia }));

    let firstPromise: Promise<MediaStream> | null = null;
    let secondPromise: Promise<MediaStream> | null = null;

    await act(async () => {
      firstPromise = result.current.start();
      secondPromise = result.current.start();
    });

    expect(firstPromise).toBe(secondPromise);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('requesting');

    resolveStream?.(stream);

    await act(async () => {
      await firstPromise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
  });

  it('stops tracks on stop and on unmount cleanup', async () => {
    const first = createMockStream(2);
    const second = createMockStream(1);
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    const { result, unmount } = renderHook(() => useMicrophone({ getUserMedia }));

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(first.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(first.tracks[1].stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(result.current.stream).toBeNull();

    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(second.tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('does not update state when a pending startup rejects after unmount', async () => {
    let rejectStream: ((reason?: unknown) => void) | null = null;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((_, reject) => {
          rejectStream = reject;
        }),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useMicrophone({ getUserMedia }));

    let startPromise: Promise<MediaStream> | null = null;

    await act(async () => {
      startPromise = result.current.start();
    });

    unmount();
    rejectStream?.(new DOMException('Permission denied', 'NotAllowedError'));

    await expect(startPromise).rejects.toThrow('Permission denied');
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
