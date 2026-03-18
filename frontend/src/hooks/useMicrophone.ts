import { useCallback, useEffect, useRef, useState } from 'react';

export type MicrophoneStatus = 'idle' | 'requesting' | 'ready' | 'error';

interface UseMicrophoneOptions {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  constraints?: MediaStreamConstraints;
}

interface UseMicrophoneResult {
  status: MicrophoneStatus;
  error: string | null;
  stream: MediaStream | null;
  start: () => Promise<MediaStream>;
  stop: () => void;
}

const defaultConstraints: MediaStreamConstraints = {
  audio: true,
  video: false,
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

function getErrorMessage(caughtError: unknown) {
  if (
    typeof caughtError === 'object' &&
    caughtError !== null &&
    'message' in caughtError &&
    typeof caughtError.message === 'string'
  ) {
    return caughtError.message;
  }

  return 'Unable to access microphone';
}

export function useMicrophone(options: UseMicrophoneOptions = {}): UseMicrophoneResult {
  const {
    constraints = defaultConstraints,
    getUserMedia = (requestedConstraints) => navigator.mediaDevices.getUserMedia(requestedConstraints),
  } = options;
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingStartRef = useRef<Promise<MediaStream> | null>(null);
  const mountedRef = useRef(true);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (!mountedRef.current) {
      return;
    }
    setStream(null);
    setError(null);
    setStatus('idle');
  }, []);

  const start = useCallback(() => {
    if (streamRef.current) {
      return Promise.resolve(streamRef.current);
    }

    if (pendingStartRef.current) {
      return pendingStartRef.current;
    }

    setStatus('requesting');
    setError(null);

    const pendingStart = getUserMedia(constraints)
      .then((nextStream) => {
        if (!mountedRef.current) {
          stopStream(nextStream);
          throw new Error('Microphone hook unmounted during startup');
        }

        streamRef.current = nextStream;
        setStream(nextStream);
        setStatus('ready');
        return nextStream;
      })
      .catch((caughtError) => {
        const message = getErrorMessage(caughtError);

        streamRef.current = null;
        if (mountedRef.current) {
          setStream(null);
          setError(message);
          setStatus('error');
        }
        throw caughtError;
      })
      .finally(() => {
        pendingStartRef.current = null;
      });

    pendingStartRef.current = pendingStart;
    return pendingStart;
  }, [constraints, getUserMedia]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return {
    status,
    error,
    stream,
    start,
    stop,
  };
}
