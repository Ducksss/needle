import type { DigestView, LogRow } from '../model/digest';
import type { GlobeScene } from '../model/globe';
import { GlobeCanvas } from './GlobeCanvas';

export function OrbitContext({ g }: { g: GlobeScene }) {
  return (
    <section aria-label="Orbit context" className="card side-card orbit-card">
      <div className="card-head">
        <h2>Orbit context</h2>
        <span className="meta">orientation illustrative</span>
      </div>
      <div className="globe">
        <GlobeCanvas scene={g} label="Selected satellite orbit, open conjunctions, debris track and proposed path, over an illustrative world map." />
      </div>
      <div className="key">
        <span>
          <i style={{ borderTopColor: '#0F172A' }} />
          path ahead
        </span>
        <span>
          <i style={{ borderTopColor: '#6D28D9' }} />
          proposed (exaggerated)
        </span>
        <span>
          <i style={{ borderTopColor: '#C2410C', borderTopStyle: 'dotted' }} />
          debris track
        </span>
        <span className="key-hint">drag to turn</span>
      </div>
    </section>
  );
}

export function SinceLastRun({ d, onPick }: { d: DigestView; onPick: (id: number) => void }) {
  return (
    <section aria-label="Since last run" className="card side-card digest-card" style={{ gap: 8 }}>
      <div className="card-head">
        <h2>Since last run</h2>
        <span className="meta">{d.meta}</span>
      </div>
      {d.groups.map((g) => (
        <div key={g.title} className="digest-group">
          <span className="digest-title" style={{ color: g.color }}>
            {g.title}
          </span>
          {g.items.map((it) => (
            <button key={it.id} type="button" className="digest-item" onClick={() => onPick(it.id)}>
              <span>
                <span className="mono" style={{ fontWeight: 500 }}>
                  #{it.id}
                </span>{' '}
                <span style={{ color: 'var(--muted)' }}>{it.sat}</span>
              </span>
              <span className="mono" style={{ color: 'var(--slate)' }} title={it.title}>
                {it.v}
              </span>
            </button>
          ))}
        </div>
      ))}
      {d.quiet && <span style={{ color: 'var(--muted)' }}>No escalations, downgrades or passes this run.</span>}
    </section>
  );
}

export function DecisionLog({ rows }: { rows: LogRow[] }) {
  return (
    <section aria-label="Decision log" className="card side-card log-card">
      <div className="card-head">
        <h2>Decision log</h2>
        <span className="meta">this replay</span>
      </div>
      {rows.map((l, i) => (
        <div key={i} className="log-row">
          <span className="mono" style={{ color: 'var(--muted)' }}>
            {l.run}
          </span>
          <span>{l.text}</span>
        </div>
      ))}
      {!rows.length && <span style={{ color: 'var(--muted)' }}>No decisions yet. Approvals and deferrals are recorded here with their run.</span>}
    </section>
  );
}
