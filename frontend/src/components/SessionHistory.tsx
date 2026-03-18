import { useEffect, useState } from 'react';
import { fetchSessionList, type SessionListItem } from '../state/sessionRuntime';

interface SessionHistoryProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function SessionHistory({
  currentSessionId,
  onSelectSession,
  onNewSession,
  collapsed,
  onToggleCollapse,
}: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  useEffect(() => {
    void fetchSessionList().then(setSessions);
  }, [currentSessionId]);

  if (collapsed) {
    return (
      <aside className="session-sidebar collapsed">
        <button type="button" className="sidebar-toggle" onClick={onToggleCollapse} title="展开历史">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="session-sidebar">
      <div className="sidebar-header">
        <h2>历史会话</h2>
        <button type="button" className="sidebar-toggle" onClick={onToggleCollapse} title="收起">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button type="button" className="new-session-btn" onClick={onNewSession}>
        + 新建会话
      </button>
      <ul className="session-list">
        {sessions.map((session) => (
          <li
            key={session.session_id}
            className={session.session_id === currentSessionId ? 'active' : ''}
          >
            <button
              type="button"
              className="session-list-item"
              onClick={() => onSelectSession(session.session_id)}
            >
              <span className="session-title">
                {session.title ?? session.session_id}
              </span>
              <span className="session-meta">
                {session.segment_count} 段 · {new Date(session.created_at).toLocaleDateString('zh-CN')}
              </span>
            </button>
          </li>
        ))}
        {sessions.length === 0 && (
          <li className="session-list-empty">暂无历史会话</li>
        )}
      </ul>
    </aside>
  );
}
