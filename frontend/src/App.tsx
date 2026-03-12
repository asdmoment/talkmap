import { useEffect } from 'react';
import { RecorderBar } from './components/RecorderBar';
import { MindMapPane } from './components/MindMapPane';
import { SummaryPane } from './components/SummaryPane';
import { TranscriptPane } from './components/TranscriptPane';
import { createSessionSocket } from './lib/socket';
import { applySessionEvent, setSessionSocket } from './state/sessionRuntime';


function getSessionSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/session`;
}

export default function App() {
  useEffect(() => {
    const socket = createSessionSocket(getSessionSocketUrl(), applySessionEvent);
    setSessionSocket(socket);
    return () => {
      setSessionSocket(null);
      socket.close();
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="paper-glow" aria-hidden="true" />
      <header className="masthead">
        <p className="eyebrow">Realtime Voice Map</p>
        <h1>Signal Desk</h1>
        <p className="deck">
          A live listening workspace for transcripts, rolling summaries, and idea constellations.
        </p>
      </header>

      <RecorderBar />

      <main className="pane-grid">
        <TranscriptPane />
        <SummaryPane />
        <MindMapPane />
      </main>
    </div>
  );
}
