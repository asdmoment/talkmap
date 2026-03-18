import { useEffect } from 'react';
import { RecorderBar } from './components/RecorderBar';
import { MindMapPane } from './components/MindMapPane';
import { SummaryPane } from './components/SummaryPane';
import { TranscriptPane } from './components/TranscriptPane';
import { createSessionSocket } from './lib/socket';
import { applySessionEvent, setSessionSocket, useSessionState } from './state/sessionRuntime';
import type { ProcessingStage } from './state/sessionStore';


function getSessionSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/session`;
}

function toSessionStatus(
  processingStage: ProcessingStage,
  lastError: string | null,
  sessionId: string | null,
) {
  if (lastError && processingStage !== 'transcribed_with_llm_error') {
    return '连接异常';
  }

  if (processingStage === 'transcribing') {
    return '正在识别语音';
  }

  if (processingStage === 'summarizing') {
    return '正在整理思路';
  }

  if (processingStage === 'transcribed_with_llm_error') {
    return '部分完成';
  }

  if (processingStage === 'ready') {
    return '已完成';
  }

  return sessionId ? '已连接' : '准备中';
}

let sharedSocket: WebSocket | null = null;
let sharedSocketUrl: string | null = null;
let socketUsers = 0;
let pendingCloseTimer: number | null = null;
let intentionalSocketClose = false;

function clearPendingClose() {
  if (pendingCloseTimer === null) {
    return;
  }

  window.clearTimeout(pendingCloseTimer);
  pendingCloseTimer = null;
}

function acquireSessionSocket(url: string) {
  clearPendingClose();

  if (!sharedSocket || sharedSocketUrl !== url) {
    if (sharedSocket) {
      intentionalSocketClose = true;
      sharedSocket.close();
    }
    sharedSocket = createSessionSocket(url, applySessionEvent, {
      closeErrorMessage: () =>
        intentionalSocketClose ? null : 'Session connection closed',
    });
    sharedSocketUrl = url;
    const activeSocket = sharedSocket;

    activeSocket.addEventListener('close', () => {
      intentionalSocketClose = false;
      if (sharedSocket === activeSocket) {
        sharedSocket = null;
        sharedSocketUrl = null;
        socketUsers = 0;
      }
    });
  }

  socketUsers += 1;
  return sharedSocket;
}

function releaseSessionSocket(socket: WebSocket) {
  socketUsers = Math.max(0, socketUsers - 1);
  if (socketUsers > 0) {
    return;
  }

  pendingCloseTimer = window.setTimeout(() => {
    const shouldClose = socketUsers === 0 && sharedSocket === socket;
    pendingCloseTimer = null;

    if (!shouldClose) {
      return;
    }

    intentionalSocketClose = true;
    socket.close();
  }, 0);
}

export default function App() {
  const { sessionId, partialSegments, committedSegments, processingStage, summaryBlocks, lastError } =
    useSessionState();
  const sessionStatus = toSessionStatus(processingStage, lastError, sessionId);

  useEffect(() => {
    const socket = acquireSessionSocket(getSessionSocketUrl());
    setSessionSocket(socket);

    return () => {
      setSessionSocket(null);
      releaseSessionSocket(socket);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="paper-glow" aria-hidden="true" />
      <header className="masthead">
        <div className="masthead-brand">
          <div className="masthead-logo"></div>
          <h1>TalkMap</h1>
        </div>
        
        {sessionId && (
          <div className="session-stats" aria-label="会话状态与统计">
            <div className="stat-item">
              <span className="stat-value">{committedSegments.length + partialSegments.length}</span>
              <span className="stat-label">意群</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">{summaryBlocks.length}</span>
              <span className="stat-label">洞察</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
               <span className="stat-label">{sessionStatus}</span>
            </div>
          </div>
        )}
      </header>

      <div className="recorder-hero">
        <RecorderBar />
      </div>

      <main className="pane-grid">
        <TranscriptPane />
        <SummaryPane />
        <MindMapPane />
      </main>
    </div>
  );
}
