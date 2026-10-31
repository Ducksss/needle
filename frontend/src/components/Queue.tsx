import type { QueueTab, QueueView } from '../model/queue';
import { Chip } from './Chip';

interface QueueProps {
  q: QueueView;
  /** Highlight rows whose state changed since the previous run. */
  flash: boolean;
  run: number;
  onTab: (t: QueueTab) => void;
  onPick: (id: number) => void;
}

const URGENCY_LABEL = { calm: 'more than 24 h to the deadline', soon: 'under 24 h to the deadline', over: 'past the deadline', none: 'no burn plan for this message' };

export function Queue({ q, flash, run, onTab, onPick }: QueueProps) {
  return (
    <section aria-label="Queue" className="card queue">
      <div className="queue-top">
        <div className="card-head">
          <h2>Queue</h2>
          <span className="meta">{q.meta}</span>
        </div>
        <div role="group" aria-label="Queue view" className="tabs">
          {q.tabs.map((t) => (
            <button key={t.key} type="button" className={'tab tab-' + t.key} aria-pressed={t.on} onClick={() => onTab(t.key)}>
              {t.label} <span className="mono">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="queue-cols caps">
        <span>Event</span>
        <span style={{ textAlign: 'right' }}>{q.col}</span>
      </div>
      <div className="queue-list">
        {q.rows.map((r) => {
          const lit = flash && r.changed;
          return (
            <button key={lit ? r.id + ':' + run : r.id} type="button" className={'qrow' + (lit ? ' flash' : '')} aria-pressed={r.on} title={r.title} onClick={() => onPick(r.id)}>
              <span className="qrow-main">
                <span className="qrow-id">
                  <span className="mono">#{r.id}</span>
                  {r.chip && <Chip label={r.chip.label} tone={r.chip.tone} title={r.chip.tip} />}
                </span>
                <span className="qrow-sub">
                  {r.sat} · {r.obj} · Pc{' '}
                  <span className="mono" style={{ color: r.pcColor }} title={r.pcTitle}>
                    {r.pc}
                  </span>
                </span>
              </span>
              <span className="qrow-side">
                <span style={{ color: r.col1Color }}>{r.col1}</span>
                <span style={{ color: r.col2Color }}>{r.col2}</span>
              </span>
              {r.urgency && (
                <span className={'urgency urgency-' + r.urgency.tone} role="img" aria-label={'Decision deadline: ' + URGENCY_LABEL[r.urgency.tone]}>
                  <i style={{ width: r.urgency.w }} />
                </span>
              )}
            </button>
          );
        })}
        {q.empty && <p className="empty">Nothing in this view at this run.</p>}
      </div>
    </section>
  );
}
