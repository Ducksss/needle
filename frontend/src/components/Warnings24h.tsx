import { useId } from 'react';
import type { WarningCount, WarningsView } from '../model/warnings';
import { Chip } from './Chip';
import { TipCard } from './Hover';

const MISS_COLOR = (m: number) => (m < 1000 ? 'var(--risk)' : m <= 5000 ? 'var(--hidden)' : undefined);

export function Warnings24h({ w, onPick }: { w: WarningsView; onPick: (id: number) => void }) {
  return (
    <section aria-label="Next 24 h warnings" className="card w24">
      <div className="w24-head">
        <h2>Next 24 h</h2>
        <span className="mono" style={{ fontSize: 12 }}>
          {w.window}
        </span>
        <span className="meta">shaded on the timeline · dangerous distance: miss under 1 km</span>
      </div>
      <dl className="w24-counts">
        {w.counts.map((c) => (
          <Count key={c.key} c={c} />
        ))}
      </dl>
      <div className="w24-body">
        <div className="w24-table-wrap">
          <table className="w24-table" aria-label="Closest approaches in the next 24 h">
            <thead>
              <tr>
                <th scope="col">To TCA</th>
                <th scope="col">Event</th>
                <th scope="col">Satellite</th>
                <th scope="col">Object</th>
                <th scope="col" className="num">
                  Miss
                </th>
                <th scope="col" className="num">
                  Pc
                </th>
                <th scope="col">Brief tier</th>
                <th scope="col">Needle queue</th>
              </tr>
            </thead>
            <tbody>
              {w.rows.map((r) => (
                <tr key={r.id} aria-selected={r.selected} onClick={() => onPick(r.id)}>
                  <td title={r.tcaAt}>{r.tcaIn}</td>
                  <td>
                    <button type="button" className="linkish" onClick={(ev) => (ev.stopPropagation(), onPick(r.id))} aria-label={'Open event ' + r.id + ' in the workspace'}>
                      #{r.id}
                    </button>
                  </td>
                  <td>{r.sat}</td>
                  <td className="sans">{r.obj}</td>
                  <td className="num" style={{ color: MISS_COLOR(r.missM), fontWeight: r.missM < 1000 ? 600 : undefined }}>
                    {r.miss}
                  </td>
                  <td className="num" style={{ color: r.pcColor }}>
                    {r.pc}
                  </td>
                  <td className="sans">
                    <Chip label={r.tier} tone={r.tierTone} title={r.tierTip} />
                  </td>
                  <td className="sans">
                    <Chip label={r.queue.label} tone={r.queue.tone} title={r.queue.tip} />
                  </td>
                </tr>
              ))}
              {!w.rows.length && (
                <tr>
                  <td colSpan={8} className="sans" style={{ padding: '12px 10px', color: 'var(--muted)', cursor: 'default' }}>
                    No reported event reaches closest approach in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">Insights</span>
          <ul className="w24-insights">
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
        </div>
      </div>
    </section>
  );
}

function Count({ c }: { c: WarningCount }) {
  const id = useId();
  return (
    <div className="tw w24-count" tabIndex={0} aria-describedby={id}>
      <dt>
        <span>{c.label}</span>
      </dt>
      <dd style={{ color: c.v ? c.color : 'var(--faint)' }}>{c.v}</dd>
      <TipCard id={id} title={c.label} lines={[c.tip]} />
    </div>
  );
}
