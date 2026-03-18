import { useMemo } from 'react';
import type { SummaryBlock } from '../lib/socket';
import { useSessionState } from '../state/sessionRuntime';

type SummarySection = 'overview' | 'bullet' | 'action' | 'note';

interface ParsedBlock {
  id: string;
  section: SummarySection;
  text: string;
}

function parseBlock(block: SummaryBlock): ParsedBlock {
  const value = block.text.trim();
  const lowerValue = value.toLowerCase();
  const lowerId = block.id.toLowerCase();

  if (lowerId.startsWith('summary:')) {
    return { id: block.id, section: 'overview', text: value };
  }

  if (lowerId.startsWith('bullet:')) {
    return { id: block.id, section: 'bullet', text: value };
  }

  if (lowerId.startsWith('action:')) {
    return { id: block.id, section: 'action', text: value };
  }

  if (lowerValue.startsWith('overview:')) {
    return { id: block.id, section: 'overview', text: value.slice(9).trim() };
  }

  if (lowerValue.startsWith('bullet:')) {
    return { id: block.id, section: 'bullet', text: value.slice(7).trim() };
  }

  if (lowerValue.startsWith('action:')) {
    return { id: block.id, section: 'action', text: value.slice(7).trim() };
  }

  return { id: block.id, section: 'note', text: value };
}

export function SummaryPane() {
  const { summaryBlocks } = useSessionState();
  const parsedBlocks = useMemo(() => summaryBlocks.map(parseBlock), [summaryBlocks]);
  const overviewBlocks = parsedBlocks.filter((block) => block.section === 'overview');
  const overview = overviewBlocks[0];
  const additionalOverviews = overviewBlocks.slice(1);
  const noteBlocks = parsedBlocks.filter((block) => block.section === 'bullet' || block.section === 'note');
  const actionBlocks = parsedBlocks.filter((block) => block.section === 'action');
  const fallbackSection = overview ? null : noteBlocks[0] ? 'bullet' : actionBlocks[0] ? 'action' : null;
  const fallbackOverview = overview ?? noteBlocks[0] ?? actionBlocks[0] ?? parsedBlocks[0];
  const bullets = fallbackSection === 'bullet' ? noteBlocks.slice(1) : noteBlocks;
  const actions = fallbackSection === 'action' ? actionBlocks.slice(1) : actionBlocks;

  return (
    <section className="pane summary-pane">
      <div className="pane-header">
        <p className="section-kicker">AI 洞察</p>
        <h2>AI 提纯引擎</h2>
      </div>
      <p className="pane-copy">
        经由 AI 提炼的核心论点、关键高亮与下一步行动指南，洞见即刻展现。
      </p>
      <div className="pane-surface summary-surface" aria-label="AI 提纯引擎">
        {parsedBlocks.length === 0 ? (
          <p className="summary-empty">等待神经元网络解析与重构你的深刻洞察...</p>
        ) : (
          <>
            <section className="summary-card summary-card-overview">
              <p className="summary-label">核心脉络</p>
              <h3>核心脉络</h3>
              <p>{fallbackOverview?.text}</p>
            </section>

            {additionalOverviews.length > 0 ? (
              <section className="summary-cluster">
                <h3>次要特征</h3>
                <ul className="summary-list">
                  {additionalOverviews.map((block) => (
                    <li key={block.id}>{block.text}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {bullets.length > 0 ? (
              <section className="summary-cluster">
                <h3>颗粒高亮</h3>
                <ul className="summary-list">
                  {bullets.map((block) => (
                    <li key={block.id}>{block.text}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {actions.length > 0 ? (
              <section className="summary-cluster summary-cluster-actions">
                <h3>行动指南</h3>
                <ul className="summary-list">
                  {actions.map((block) => (
                    <li key={block.id}>{block.text}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
