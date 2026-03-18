import { useCallback, useEffect, useState } from 'react';
import { RecorderBar } from './components/RecorderBar';
import { MindMapPane } from './components/MindMapPane';
import { SessionHistory } from './components/SessionHistory';
import { SummaryPane } from './components/SummaryPane';
import { TranscriptPane } from './components/TranscriptPane';
import { createSessionSocket } from './lib/socket';
import {
  applySessionEvent,
  resetSessionState,
  setSessionSocket,
  useSessionState,
} from './state/sessionRuntime';
import type { ProcessingStage } from './state/sessionStore';

function getSessionSocketUrl(sessionId?: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${window.location.host}/ws/session`;
  return sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
}

function toSessionStatus(
  processingStage: ProcessingStage,
  lastError: string | null,
  sessionId: string | null,
) {
  if (lastError && processingStage !== 'transcribed_with_llm_error') {
    return '连接异常';
  }
  if (processingStage === 'transcribing') return '正在识别语音';
  if (processingStage === 'summarizing') return '正在整理思路';
  if (processingStage === 'transcribed_with_llm_error') return '部分完成';
  if (processingStage === 'ready') return '已完成';
  return sessionId ? '已连接' : '准备中';
}

let sharedSocket: WebSocket | null = null;
let sharedSocketUrl: string | null = null;
let socketUsers = 0;
let pendingCloseTimer: number | null = null;
let intentionalSocketClose = false;

function clearPendingClose() {
  if (pendingCloseTimer === null) return;
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
  if (socketUsers > 0) return;

  pendingCloseTimer = window.setTimeout(() => {
    const shouldClose = socketUsers === 0 && sharedSocket === socket;
    pendingCloseTimer = null;
    if (!shouldClose) return;
    intentionalSocketClose = true;
    socket.close();
  }, 0);
}

type AppView = 'startup' | 'session';

export default function App() {
  const { sessionId, title, partialSegments, committedSegments, processingStage, summaryBlocks, lastError } =
    useSessionState();
  const [view, setView] = useState<AppView>('startup');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [targetSessionId, setTargetSessionId] = useState<string | undefined>(undefined);

  const sessionStatus = toSessionStatus(processingStage, lastError, sessionId);

  const connectToSession = useCallback((resumeSessionId?: string) => {
    // Close existing socket if any
    if (sharedSocket) {
      intentionalSocketClose = true;
      sharedSocket.close();
      sharedSocket = null;
      sharedSocketUrl = null;
      socketUsers = 0;
    }
    resetSessionState();
    setTargetSessionId(resumeSessionId);
    setView('session');
  }, []);

  useEffect(() => {
    if (view !== 'session') return;

    const url = getSessionSocketUrl(targetSessionId);
    const socket = acquireSessionSocket(url);
    setSessionSocket(socket);

    return () => {
      setSessionSocket(null);
      releaseSessionSocket(socket);
    };
  }, [view, targetSessionId]);

  const handleSelectSession = useCallback((selectedSessionId: string) => {
    connectToSession(selectedSessionId);
    setSidebarCollapsed(true);
  }, [connectToSession]);

  const handleNewSession = useCallback(() => {
    connectToSession(undefined);
    setSidebarCollapsed(true);
  }, [connectToSession]);

  const handleBackToStartup = useCallback(() => {
    if (sharedSocket) {
      intentionalSocketClose = true;
      sharedSocket.close();
      sharedSocket = null;
      sharedSocketUrl = null;
      socketUsers = 0;
    }
    resetSessionState();
    setTargetSessionId(undefined);
    setView('startup');
  }, []);

  if (view === 'startup') {
    return (
      <div className="app-shell">
        <header className="masthead">
          <div className="masthead-brand">
            <div className="masthead-logo"></div>
            <h1>TalkMap</h1>
          </div>
        </header>

        <div className="startup-screen">
          <div className="startup-hero">
            <h2>开始你的思维之旅</h2>
            <p>选择一个历史会话继续，或开始新的对话</p>
            <button type="button" className="startup-new-btn" onClick={() => connectToSession(undefined)}>
              + 新建会话
            </button>
          </div>
          <SessionHistory
            currentSessionId={null}
            onSelectSession={handleSelectSession}
            onNewSession={() => connectToSession(undefined)}
            collapsed={false}
            onToggleCollapse={() => {}}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <SessionHistory
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="app-shell">
        <header className="masthead">
          <div className="masthead-left">
            {sidebarCollapsed && (
              <button
                type="button"
                className="sidebar-open-btn"
                onClick={() => setSidebarCollapsed(false)}
                title="展开历史"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
            )}
            <div className="masthead-brand">
              <div className="masthead-logo"></div>
              <h1>TalkMap</h1>
            </div>
          </div>

          <div className="masthead-right">
            {title && <span className="session-title-display">{title}</span>}
            <button type="button" className="back-to-startup-btn" onClick={handleBackToStartup} title="返回首页">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
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
          </div>
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
    </div>
  );
}
