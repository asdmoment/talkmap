import { useCallback, useEffect, useRef, useState } from 'react';

export type VadRecorderStatus = 'idle' | 'listening' | 'speaking' | 'error';

interface VadInstance {
  start: () => Promise<void> | void;
  pause: () => Promise<void> | void;
}

type FrameProbabilities = unknown;

interface CreateVadOptions {
  stream: MediaStream;
  onSpeechStart: () => Promise<void> | void;
  onSpeechEnd: (audio: Float32Array) => Promise<void> | void;
  onFrameProcessed: (probabilities: FrameProbabilities, frame: Float32Array) => Promise<void> | void;
  additionalAudioConstraints: MediaTrackConstraints;
}

interface UseVadRecorderOptions {
  stream: MediaStream | null;
  createVad?: (options: CreateVadOptions) => Promise<VadInstance>;
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onFrameProcessed?: (probabilities: FrameProbabilities, frame: Float32Array) => void;
}

interface UseVadRecorderResult {
  status: VadRecorderStatus;
  error: string | null;
  start: (streamOverride?: MediaStream | null) => Promise<void>;
  stop: () => void;
}

const defaultCreateVad = async (options: CreateVadOptions): Promise<VadInstance> => {
  const { MicVAD } = await import('@ricky0123/vad-web');

  return MicVAD.new({
    ...options,
  } as never) as Promise<VadInstance>;
};

export function useVadRecorder({
  stream,
  createVad = defaultCreateVad,
  onSpeechStart,
  onSpeechEnd,
  onFrameProcessed,
}: UseVadRecorderOptions): UseVadRecorderResult {
  const [status, setStatus] = useState<VadRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const vadRef = useRef<VadInstance | null>(null);
  const vadStreamRef = useRef<MediaStream | null>(null);
  const pendingStartRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onFrameProcessedRef = useRef(onFrameProcessed);

  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;
  onFrameProcessedRef.current = onFrameProcessed;

  const stop = useCallback(() => {
    if (vadRef.current) {
      void vadRef.current.pause();
    }

    if (stream) {
      vadStreamRef.current = stream;
    }

    setStatus('idle');
    setError(null);
  }, [stream]);

  const start = useCallback(async (streamOverride?: MediaStream | null) => {
    const activeStream = streamOverride ?? stream;

    if (!activeStream) {
      const streamError = new Error('Microphone is not ready');
      if (mountedRef.current) {
        setError(streamError.message);
        setStatus('error');
      }
      throw streamError;
    }

    if (pendingStartRef.current) {
      return pendingStartRef.current;
    }

    if (mountedRef.current) {
      setError(null);
    }

    const pendingStart = (async () => {
      try {
        if (vadRef.current && vadStreamRef.current !== activeStream) {
          await vadRef.current.pause();
          vadRef.current = null;
          vadStreamRef.current = null;
        }

        if (!vadRef.current || vadStreamRef.current !== activeStream) {
          const nextVad = await createVad({
            stream: activeStream,
            onSpeechStart: () => {
              if (mountedRef.current) {
                setStatus('speaking');
              }
              onSpeechStartRef.current?.();
            },
            onSpeechEnd: (audio) => {
              onSpeechEndRef.current?.(audio);
              if (mountedRef.current) {
                setStatus('listening');
              }
            },
            onFrameProcessed: (probabilities, frame) => {
              onFrameProcessedRef.current?.(probabilities, frame);
            },
            additionalAudioConstraints: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          if (!mountedRef.current) {
            await nextVad.pause();
            return;
          }

          vadRef.current = nextVad;
          vadStreamRef.current = activeStream;
        }

        await vadRef.current.start();

        if (mountedRef.current) {
          setStatus('listening');
        }
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : 'Unable to start voice detection';

        if (mountedRef.current) {
          setError(message);
          setStatus('error');
        }
        throw caughtError;
      } finally {
        pendingStartRef.current = null;
      }
    })();

    pendingStartRef.current = pendingStart;
    return pendingStart;
  }, [createVad, stream]);

  useEffect(() => {
    if (stream || !vadRef.current) {
      return;
    }

    void vadRef.current.pause();
    vadRef.current = null;
    vadStreamRef.current = null;
    setStatus('idle');
  }, [stream]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (!vadRef.current) {
        return;
      }

      void vadRef.current.pause();
      vadRef.current = null;
      vadStreamRef.current = null;
    };
  }, []);

  return {
    status,
    error,
    start,
    stop,
  };
}
