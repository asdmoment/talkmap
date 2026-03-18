import { useRef } from 'react';
import { sendSessionUtterance } from '../lib/socket';
import { useMicrophone } from '../hooks/useMicrophone';
import { useVadRecorder } from '../hooks/useVadRecorder';
import {
  applySessionEvent,
  getSessionSocket,
  setProcessingStage,
  useSessionState,
} from '../state/sessionRuntime';

type RecorderStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'speaking'
  | 'transcribing'
  | 'summarizing'
  | 'transcribed_with_llm_error'
  | 'ready'
  | 'error';

function toStatusCopy(status: RecorderStatus, error: string | null) {
  switch (status) {
    case 'requesting':
      return '正在唤醒麦克风，请授予浏览器访问权限。';
    case 'listening':
      return 'AI 正在屏息聆听。请随时开口，尽情倾诉。';
    case 'speaking':
      return '正在实时捕获你的声纹与灵感...';
    case 'transcribing':
      return '音频片段已切分，正在经由 AI 转化为高精度文本...';
    case 'summarizing':
      return '正在通过认知引擎提纯核心观点与下一步行动指南...';
    case 'transcribed_with_llm_error':
      return '文本转化成功，但深度解析出现波动。';
    case 'ready':
      return '当前洞察已析出。你可以继续开口，触发下一轮无缝流转。';
    case 'error':
      return error ?? '引擎连接异常，请检查设备权限或网络状态。';
    case 'idle':
    default:
      return '点击按钮，即刻唤醒你的专属思维镜像。';
  }
}

function toStatusLabel(status: RecorderStatus) {
  switch (status) {
    case 'requesting':
      return '请求权限中';
    case 'listening':
      return '正在聆听';
    case 'speaking':
      return '正在收音';
    case 'transcribing':
      return '正在识别语音';
    case 'summarizing':
      return '正在整理思路';
    case 'transcribed_with_llm_error':
      return '部分完成';
    case 'ready':
      return '已完成';
    case 'error':
      return '连接异常';
    case 'idle':
    default:
      return '未开始';
  }
}

export function RecorderBar() {
  const { lastError, processingStage, sessionId } = useSessionState();
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
        samples: Array.from(audio, (sample) => Math.round(sample * 1e6) / 1e6),
      });
      if (!didQueueOrSend) {
        applySessionEvent({
          type: 'error',
          message: 'Session socket is not ready',
        });
        return;
      }

      setProcessingStage('transcribing');
    },
  });

  let status: RecorderStatus = 'idle';

  if (microphone.status === 'requesting') {
    status = 'requesting';
  } else if (recorder.status === 'speaking') {
    status = 'speaking';
  } else if (processingStage === 'transcribed_with_llm_error') {
    status = 'transcribed_with_llm_error';
  } else if (
    lastError ||
    microphone.status === 'error' ||
    recorder.status === 'error'
  ) {
    status = 'error';
  } else if (processingStage === 'transcribing') {
    status = 'transcribing';
  } else if (processingStage === 'summarizing') {
    status = 'summarizing';
  } else if (
    microphone.status === 'ready' &&
    recorder.status === 'listening'
  ) {
    status = 'listening';
  } else if (processingStage === 'ready') {
    status = 'ready';
  }

  const error = lastError ?? microphone.error ?? recorder.error;
  const statusLabel = toStatusLabel(status);
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
    <section className="recorder-hero" aria-label="智能会话控制台">
      <div className="recorder-action-center">
        <button
          type="button"
          className="recorder-toggle-massive"
          onClick={() => {
            void handleToggle();
          }}
          aria-pressed={isCaptureActive}
          disabled={isPending}
          title={isCaptureActive ? '停止捕获' : '开启倾诉'}
        >
          {isCaptureActive ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M6 6h12v12H6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
        <div className="recorder-status-block">
          <p className="status-copy">{toStatusCopy(status, error)}</p>
        </div>
      </div>
      {sessionId && (
        <div className="recorder-export-block">
          <p className="session-id-label">
            Session: <code>{sessionId}</code>
          </p>
          <div className="export-buttons">
            <a
              href={`/api/session/${sessionId}/export.json`}
              download={`${sessionId}.json`}
              className="export-btn"
            >
              Export JSON
            </a>
            <a
              href={`/api/session/${sessionId}/export.md`}
              download={`${sessionId}.md`}
              className="export-btn"
            >
              Export MD
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
