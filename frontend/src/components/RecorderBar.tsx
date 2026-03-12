import { useMemo, useRef } from 'react';
import { sendSessionUtterance } from '../lib/socket';
import { useMicrophone } from '../hooks/useMicrophone';
import { useVadRecorder } from '../hooks/useVadRecorder';
import { applySessionEvent, getSessionSocket, useSessionState } from '../state/sessionRuntime';

function toStatusCopy(status: 'idle' | 'requesting' | 'listening' | 'speaking' | 'error', error: string | null) {
  switch (status) {
    case 'requesting':
      return 'Opening the line. Waiting for microphone permission before the desk goes live.';
    case 'listening':
      return 'Desk is live and listening for the next spoken thought.';
    case 'speaking':
      return 'Voice detected. The desk is capturing the current phrase for live processing.';
    case 'error':
      return error ?? 'The microphone could not be started. Check browser permissions and try again.';
    case 'idle':
    default:
      return 'Microphone standing by. Start a session to stream voice into the desk.';
  }
}

export function RecorderBar() {
  const { lastError } = useSessionState();
  const microphone = useMicrophone();
  const utteranceCountRef = useRef(0);
  const recorder = useVadRecorder({
    stream: microphone.stream,
    onSpeechEnd: (audio) => {
      const socket = getSessionSocket();
      if (!socket) {
        return;
      }

      utteranceCountRef.current += 1;
      const didQueueOrSend = sendSessionUtterance(socket, {
        utterance_id: `utterance-${utteranceCountRef.current}`,
        sample_rate: 16000,
        samples: Array.from(audio, (sample) => Number(sample.toFixed(6))),
      });
      if (!didQueueOrSend) {
        applySessionEvent({
          type: 'error',
          message: 'Session socket is not ready',
        });
      }
    },
  });

  const status = useMemo(() => {
    if (lastError || microphone.status === 'error' || recorder.status === 'error') {
      return 'error' as const;
    }

    if (microphone.status === 'requesting') {
      return 'requesting' as const;
    }

    if (recorder.status === 'speaking') {
      return 'speaking' as const;
    }

    if (microphone.status === 'ready' && recorder.status === 'listening') {
      return 'listening' as const;
    }

    return 'idle' as const;
  }, [lastError, microphone.status, recorder.status]);

  const error = lastError ?? microphone.error ?? recorder.error;
  const isCaptureActive =
    recorder.status === 'speaking' ||
    (microphone.status === 'ready' && recorder.status === 'listening');
  const isPending = microphone.status === 'requesting';

  const handleToggle = async () => {
    if (isCaptureActive) {
      recorder.stop();
      microphone.stop();
      return;
    }

    let stream: MediaStream | null = null;

    try {
      stream = await microphone.start();
      if (!stream) {
        return;
      }
      await recorder.start(stream);
    } catch {
      if (stream) {
        microphone.stop();
      }
      // Hook state already captures the actionable error.
    }
  };

  return (
    <section className="recorder-bar" aria-label="Recorder status">
      <div>
        <p className="section-kicker">Capture</p>
        <h2>Recorder</h2>
        <button
          type="button"
          className="recorder-toggle"
          onClick={() => {
            void handleToggle();
          }}
          aria-pressed={isCaptureActive}
          disabled={isPending}
        >
          {isCaptureActive ? 'Stop desk' : 'Start desk'}
        </button>
      </div>
      <div className="recorder-status-block">
        <p className={`status-pill status-pill-${status}`}>Status: {status}</p>
        <p className="status-copy">{toStatusCopy(status, error)}</p>
      </div>
    </section>
  );
}
