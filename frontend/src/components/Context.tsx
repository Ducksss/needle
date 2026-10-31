import type { DigestView, LogRow } from '../model/digest';
import type { GlobeView } from '../model/globe';

export function OrbitContext({ g }: { g: GlobeView }) {
  return (
    <section aria-label="Orbit context" className="card side-card">
      <div className="card-head">
        <h2>Orbit context</h2>
        <span className="meta">orientation illustrative</span>
      </div>
      <div className="globe">
        <svg viewBox="0 0 900 900" className="fill" role="img" aria-label="Selected satellite orbit, open conjunctions, debris track and proposed path">
          <path d={g.backDim} fill="none" stroke="#E6EBF0" strokeWidth="1.5" />
          <path d={g.backSel} fill="none" stroke="#0F766E" strokeWidth="1.5" strokeOpacity="0.3" />
          <circle cx="450" cy="450" r="268.4" fill="#EDF1F5" stroke="#CBD5E1" strokeWidth="2" />
          <path d={g.grat} fill="none" stroke="#D7DFE7" strokeWidth="1.5" />
          <path d={g.frontDim} fill="none" stroke="#AAB7C6" strokeWidth="1.5" />
          <path d={g.dots[0]} fill="#94A3B8" />
          <path d={g.dots[1]} fill="#2563EB" />
          <path d={g.dots[2]} fill="#B45309" />
          <path d={g.dots[3]} fill="#C2410C" />
          <path d={g.frontSel} fill="none" stroke="#0F766E" strokeWidth="3" />
          <path d={g.chaser} fill="none" stroke="#C2410C" strokeWidth="5" strokeDasharray="0.1 12" strokeLinecap="round" />
          <path d={g.ahead} fill="none" stroke="#0F766E" strokeWidth="5" strokeDasharray="16 11" strokeLinecap="round" />
          <path d={g.prop} fill="none" stroke="#6D28D9" strokeWidth="5" strokeDasharray="14 10" strokeLinecap="round" />
          <path d={g.icoPanels} fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={g.icoBody} fill="#64748B" />
          <path d={g.evRing} fill="none" stroke={g.evColor} strokeWidth="4" />
          <path d={g.evDot} fill={g.evColor} />
          <path d={g.selPanels} fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
          <path d={g.selBody} fill="#0F172A" />
        </svg>
      </div>
      <div className="key">
        <span>
          <i style={{ borderTopColor: '#0F766E' }} />
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
      </div>
    </section>
  );
}

export function SinceLastRun({ d, onPick }: { d: DigestView; onPick: (id: number) => void }) {
  return (
    <section aria-label="Since last run" className="card side-card" style={{ gap: 8 }}>
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
              <span className="mono" style={{ color: 'var(--slate)' }}>
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
    <section aria-label="Decision log" className="card side-card">
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
