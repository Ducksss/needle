import type { CostOfWaitingView, EncounterPlaneView, HistoryView } from '../model/workspace';

const MONO = 'IBM Plex Mono, monospace';

export function MessageHistory({ h }: { h: HistoryView }) {
  return (
    <figure className="ws-cell b-bottom b-right">
      <figcaption>
        <span className="ws-cell-title">Message history</span>
        <span className="meta">{h.trend}</span>
      </figcaption>
      <span className="caps">Collision probability</span>
      <svg viewBox="0 0 320 96" className="chart" role="img" aria-label="Collision probability for each message received so far">
        <line x1="40" x2="316" y1="19.3" y2="19.3" stroke="#C2410C" strokeDasharray="3 3" />
        <line x1="40" x2="316" y1="86" y2="86" stroke="#E3E8EE" />
        <text x="36" y="22" textAnchor="end" fontSize="9" fill="#C2410C" fontFamily={MONO}>
          1e-4
        </text>
        <text x="36" y="89" textAnchor="end" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
          ≤1e-14
        </text>
        <line x1={h.nowX} x2={h.nowX} y1="4" y2="88" stroke="#0F766E" strokeDasharray="2 3" />
        <polyline points={h.pcPts} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={h.pcDots} fill="#0F172A" />
        <path d={h.pcHot} fill="#C2410C" />
      </svg>
      <span className="caps">Miss distance</span>
      <svg viewBox="0 0 320 84" className="chart" role="img" aria-label="Miss distance for each message received so far">
        <line x1="40" x2="316" y1={h.y5} y2={h.y5} stroke="#B45309" strokeDasharray="3 3" />
        <line x1="40" x2="316" y1={h.y1} y2={h.y1} stroke="#C2410C" strokeDasharray="3 3" />
        <line x1="40" x2="316" y1="70" y2="70" stroke="#E3E8EE" />
        <text x="36" y={h.y5L} textAnchor="end" fontSize="9" fill="#B45309" fontFamily={MONO}>
          5 km
        </text>
        <text x="36" y={h.y1L} textAnchor="end" fontSize="9" fill="#C2410C" fontFamily={MONO}>
          1 km
        </text>
        <text x="40" y="82" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
          7 d before
        </text>
        <text x="316" y="82" textAnchor="end" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
          TCA
        </text>
        <line x1={h.nowX} x2={h.nowX} y1="4" y2="72" stroke="#0F766E" strokeDasharray="2 3" />
        <polyline points={h.missPts} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={h.missDots} fill="#0F172A" />
      </svg>
    </figure>
  );
}

export function EncounterPlane({ bp }: { bp: EncounterPlaneView }) {
  return (
    <figure className="ws-cell b-bottom">
      <figcaption>
        <span className="ws-cell-title">Encounter plane</span>
        <span className="meta">seen along the relative velocity</span>
      </figcaption>
      <div className="plane">
        <svg viewBox="0 0 300 300" className="fill" role="img" aria-label="Uncertainty ellipse, 1 km ring, and where the debris passes now and after the selected burn">
          <line x1="150" x2="150" y1="8" y2="292" stroke="#EEF2F5" />
          <line x1="8" x2="292" y1="150" y2="150" stroke="#EEF2F5" />
          <ellipse cx="150" cy="150" rx={bp.rx3} ry={bp.ry3} transform={`rotate(${bp.rot} 150 150)`} fill="#0F766E" fillOpacity="0.06" stroke="#0F766E" strokeOpacity="0.35" strokeDasharray="3 3" />
          <ellipse cx="150" cy="150" rx={bp.rx1} ry={bp.ry1} transform={`rotate(${bp.rot} 150 150)`} fill="#0F766E" fillOpacity="0.16" stroke="#0F766E" strokeOpacity="0.6" />
          <circle cx="150" cy="150" r={bp.ring} fill="none" stroke="#C2410C" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1={bp.bx} y1={bp.by} x2={bp.ax} y2={bp.ay} stroke="#6D28D9" strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx="150" cy="150" r={bp.hbr} fill="#0F172A" />
          <circle cx={bp.bx} cy={bp.by} r="5.5" fill="#C2410C" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx={bp.ax} cy={bp.ay} r="5.5" fill="#6D28D9" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
        {bp.labels.map((l) => (
          <span key={l.text} className="plane-label" style={{ left: l.left, top: l.top, transform: l.transform, background: l.tone.bg, color: l.tone.fg }}>
            {l.text}
          </span>
        ))}
      </div>
      <span className="meta">
        Shaded: combined 1σ and 3σ ({bp.sigTxt}). Dashed ring: 1 km. Plot half-width {bp.scaleTxt}.
      </span>
    </figure>
  );
}

export function CostOfWaiting({ wc, budget }: { wc: CostOfWaitingView; budget: number }) {
  return (
    <figure className="ws-cell b-right">
      <figcaption>
        <span className="ws-cell-title">Cost of waiting</span>
        <span className="meta">lowest Δv per 6 h window</span>
      </figcaption>
      <div className="cow">
        <svg viewBox="0 0 320 150" className="fill" role="img" aria-label="Lowest burn size needed if the burn happens in each later 6 hour window, with the Δv budget and the decision deadline">
          <rect x={wc.dlX} y="8" width={wc.dlW} height="118" fill="#FEE2E2" fillOpacity="0.7" />
          <line x1="36" x2="312" y1="10" y2="10" stroke="#EEF2F5" />
          <line x1="36" x2="312" y1="126" y2="126" stroke="#CBD5E1" />
          <line x1="36" x2="312" y1={wc.budgetY} y2={wc.budgetY} stroke="#C2410C" strokeDasharray="4 3" />
          <line x1={wc.nowX} x2={wc.nowX} y1="8" y2="128" stroke="#0F766E" strokeDasharray="2 3" />
          <path d={wc.path} fill="none" stroke="#0F172A" strokeWidth="1.8" />
          <path d={wc.over} fill="#C2410C" />
          <text x="32" y="129" textAnchor="end" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
            0
          </text>
          <text x="36" y="142" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
            planning message
          </text>
          <text x="312" y="142" textAnchor="end" fontSize="9" fill="#94A3B8" fontFamily={MONO}>
            TCA − 3 h
          </text>
        </svg>
        <span className="cow-label" style={{ right: '89.4%', top: '6.67%', transform: 'translateY(-50%)', paddingRight: 4, color: '#94A3B8' }}>
          {wc.topTxt}
        </span>
        <span className="cow-label" style={{ left: '12.5%', top: wc.budgetPct, transform: 'translateY(-120%)', color: '#C2410C' }}>
          budget {budget} mm/s
        </span>
        <span className="cow-label" style={{ left: '12.5%', top: '6.67%', transform: 'translateY(-50%)', padding: '0 3px', background: '#FFFFFF', color: '#94A3B8' }}>
          mm/s
        </span>
      </div>
      <span className="caption">{wc.caption}</span>
      <span className="meta">{wc.note}</span>
    </figure>
  );
}
