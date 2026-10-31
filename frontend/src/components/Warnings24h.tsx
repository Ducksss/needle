import { useId } from 'react';
import type { WarningCount, WarningsView } from '../model/warnings';
import { Chip } from './Chip';
import { TipCard } from './Hover';

import { missColor } from '../model/theme';

/** Next 24 h warnings, sized for the right column: counts, insights, then every pass in the window. */
export function Warnings24h({ w, onPick }: { w: WarningsView; onPick: (id: number) => void }) {
  return (
    <section aria-label="Next 24 h warnings" className="card side-card w24">
      <div className="w24-head">
        <h2>Next 24 h</h2>
        <span className="meta">
          closest approach within the next 24 h <span className="nowrap">(time_to_tca ≤ 1 day)</span>
        </span>
        <span className="meta">
          <span className="mono nowrap">{w.window}</span> · <span className="nowrap">simulated calendar</span>
        </span>
      </div>
      <dl className="w24-counts">
        {w.counts.map((c, i) => (
          <Count key={c.key} c={c} right={i % 3 === 2} />
        ))}
      </dl>
      <ul className="w24-insights" aria-label="Insights">
        {w.insights.map((i) => (
          <li key={i.text}>
            {i.text}
            {i.eventId != null && (
              <button type="button" className="linkish" onClick={() => onPick(i.eventId!)} aria-label={'Open event ' + i.eventId + ' in the workspace'}>
                Open #{i.eventId}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="w24-list" role="list" aria-label="Closest approaches within the next 24 h, soonest first">
        {w.rows.map((r) => (
          <div role="listitem" key={r.id}>
            <button type="button" className="w24-row" aria-pressed={r.selected} onClick={() => onPick(r.id)}>
              <span className="w24-line">
                <span>
                  <span className="mono" style={{ fontWeight: 500 }}>
                    #{r.id}
                  </span>{' '}
                  <span className="w24-sub">
                    {r.sat} · {r.obj}
                  </span>
                </span>
                <span className="mono" title={'Closest approach ' + r.tcaAt}>
                  in {r.tcaIn}
                </span>
              </span>
              <span className="w24-line">
                <span className="mono w24-sub">
                  <span style={{ color: missColor(r.missM), fontWeight: r.missM < 1000 ? 600 : undefined }}>{r.miss}</span> · Pc{' '}
                  <span style={{ color: r.pcColor }} title={r.pcTitle}>
                    {r.pc}
                  </span>
                </span>
                <span className="w24-chips">
                  <Chip label={r.tier} tone={r.tierTone} title={r.tierTip} />
                  <Chip label={r.queue.label} tone={r.queue.tone} title={'Needle queue: ' + r.queue.tip} />
                </span>
              </span>
            </button>
          </div>
        ))}
        {!w.rows.length && <p className="empty">No reported event reaches closest approach in this window.</p>}
      </div>
      <span className="meta">Chips: brief tier, then Needle queue. Shaded on the timeline.</span>
    </section>
  );
}

function Count({ c, right }: { c: WarningCount; right: boolean }) {
  const id = useId();
  return (
    <div className="tw w24-count" tabIndex={0} aria-describedby={id}>
      <dt>
        <span>{c.label}</span>
      </dt>
      <dd style={{ color: c.v ? c.color : 'var(--muted)' }}>{c.v}</dd>
      <TipCard id={id} title={c.label} lines={[c.tip]} side={{ edge: right ? 'right' : 'left', px: 0 }} />
    </div>
  );
}
