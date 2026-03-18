import { useMemo } from 'react';
import { useSessionState } from '../state/sessionRuntime';

function formatTimeRange(startMs: number, endMs: number) {
  const startSeconds = (startMs / 1000).toFixed(1).padStart(4, '0');
  const endSeconds = (endMs / 1000).toFixed(1).padStart(4, '0');
  return `${startSeconds}s-${endSeconds}s`;
}

export function TranscriptPane() {
  const { committedSegments, partialSegments } = useSessionState();
  const orderedCommittedSegments = useMemo(
    () =>
      [...committedSegments].sort(
        (left, right) =>
          left.start_ms - right.start_ms || left.end_ms - right.end_ms || left.id.localeCompare(right.id),
      ),
    [committedSegments],
  );
  const orderedPartialSegments = useMemo(
    () =>
      [...partialSegments].sort(
        (left, right) =>
          left.start_ms - right.start_ms || left.end_ms - right.end_ms || left.id.localeCompare(right.id),
      ),
    [partialSegments],
  );
  const committedIndexById = useMemo(
    () => new Map(orderedCommittedSegments.map((segment, index) => [segment.id, index + 1])),
    [orderedCommittedSegments],
  );

  return (
    <section className="pane transcript-pane">
      <div className="pane-header">
        <p className="section-kicker">原声映射</p>
        <h2>你的思维原典</h2>
      </div>
      <p className="pane-copy">
        保留你每一次灵光乍现，未加修饰的原始思绪将在此沉淀。
      </p>
      <div className="pane-surface pane-surface-ruled transcript-surface" aria-label="思维原典">
        {orderedCommittedSegments.length === 0 && orderedPartialSegments.length === 0 ? (
          <p className="transcript-empty">等待声波汇聚... 开始你的倾诉吧。</p>
        ) : (
          <>
            {orderedCommittedSegments.map((segment) => (
              <article key={segment.id} className="transcript-line transcript-line-committed">
                <div className="transcript-meta">
                  <span className="transcript-index">
                    {String(committedIndexById.get(segment.id) ?? 0).padStart(2, '0')}
                  </span>
                  <span>{formatTimeRange(segment.start_ms, segment.end_ms)}</span>
                </div>
                <p>{segment.text}</p>
              </article>
            ))}
            {orderedPartialSegments.map((segment) => (
              <article key={segment.id} className="transcript-line transcript-line-partial">
                <div className="transcript-meta">
                  <span className="transcript-live-pill">进行中</span>
                  <span>{formatTimeRange(segment.start_ms, segment.end_ms)}</span>
                </div>
                <p>{segment.text}</p>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
