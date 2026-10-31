import { useId } from 'react';
import type { CostOfWaitingView, EncounterPlaneView, HistoryView } from '../model/workspace';
import { Hover, TipCard } from './Hover';

const MONO = 'IBM Plex Mono, monospace';

const NOW_TIP = 'Current replay time. Dots to the left are messages received so far; the right is the future (forecasts on the Pc and miss charts).';

/** The "now" tag at the top of a chart's current-time line, in the playhead's colour, with a hover card. */
function NowTag({ x, width, tip = NOW_TIP }: { x: string; width: number; tip?: string }) {
  const id = useId();
  return (
    // Near either edge the tag sits beside the line instead of centred on it, clear of the axis labels.
    <span
      className="tw now-tag"
      tabIndex={0}
      aria-describedby={id}
      style={{ left: (Number(x) / width) * 100 + '%', transform: Number(x) / width < 0.2 ? 'translateX(-1px)' : Number(x) / width > 0.85 ? 'translateX(calc(-100% + 1px))' : undefined }}
    >
      now
      <TipCard id={id} title="Now" lines={[tip]} />
    </span>
  );
}

export function MessageHistory({ h }: { h: HistoryView }) {
  const fanTip = useId();
  const fadeId = useId();
  const pf = h.pcFc;
  return (
    <figure className="ws-cell b-bottom b-right">
      <figcaption>
        <span className="ws-cell-title">Message history</span>
        <span className="meta">{h.trend}</span>
      </figcaption>
      <span className="caps">Collision probability</span>
      <div className="chart-wrap">
      <NowTag x={h.nowX} width={320} />
      <svg
        viewBox="0 0 320 96"
        className="chart"
        role="img"
        aria-label={'Collision probability for each message received so far' + (pf ? ', with the outlook to closest approach: ' + pf.keys.map((k) => k.label).join('; ') : '')}
      >
        {pf?.fade && (
          <>
            <defs>
              <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#94A3B8" stopOpacity="0.3" />
                <stop offset="1" stopColor="#94A3B8" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <path d={pf.fade} fill={`url(#${fadeId})`} />
          </>
        )}
        <line x1="40" x2="316" y1="19.3" y2="19.3" stroke="#C2410C" strokeDasharray="3 3" />
        <line x1="40" x2="316" y1="86" y2="86" stroke="#E3E8EE" />
        <text x="36" y="22" textAnchor="end" fontSize="9" fill="#C2410C" fontFamily={MONO}>
          1e-4
        </text>
        <line x1="40" x2="316" y1="32.7" y2="32.7" stroke="#B45309" strokeDasharray="1.5 2.5" />
        <text x="36" y="35.4" textAnchor="end" fontSize="9" fill="#B45309" fontFamily={MONO}>
          1e-6
        </text>
        <text x="36" y="89" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
          ≤1e-14
        </text>
        <line x1={h.nowX} x2={h.nowX} y1="4" y2="88" stroke="#0F172A" strokeDasharray="2 3" />
        <polyline points={h.pcPts} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={h.pcDots} fill="#0F172A" />
        <path d={h.pcHot} fill="#C2410C" />
        {pf && (
          <>
            {pf.ceiling && <path d={pf.ceiling} fill="none" stroke="#0F172A" strokeWidth="1.2" strokeDasharray="4 3" />}
            <circle cx={pf.ring.cx} cy={pf.ring.cy} r={pf.ring.r} fill="rgba(194, 65, 12, 0.14)" stroke="#C2410C" strokeWidth="1" />
            {pf.ring.wedge && <path d={pf.ring.wedge} fill="#C2410C" />}
          </>
        )}
      </svg>
      </div>
      {pf && (
        <ul className="pc-keys">
          {pf.keys.map((k) => (
            <li key={k.kind}>
              <i className={'pc-key pc-key-' + k.kind} aria-hidden="true" />
              <Hover className="help" title={k.title} lines={k.tip} side={{ edge: 'left', px: 0 }}>
                <span className="dotted">{k.label}</span>
              </Hover>
            </li>
          ))}
        </ul>
      )}
      {h.pcNote.tip ? (
        <Hover className="chart-note help" title="Pc outlook" lines={h.pcNote.tip}>
          <span className="dotted">{h.pcNote.text}</span>
        </Hover>
      ) : (
        <span className="chart-note">{h.pcNote.text}</span>
      )}
      <span className="caps">Miss distance</span>
      <div className="fan-wrap chart-wrap">
      <NowTag x={h.nowX} width={320} />
      <svg viewBox="0 0 320 84" className="chart" role="img" aria-label={'Miss distance for each message received so far' + (h.fan ? ', with the forecast band to closest approach: ' + h.fan.label : '')}>
        {h.fan && (
          <>
            <defs>
              <clipPath id={fanTip + '-below'}>
                <rect x="0" y={h.fan.clipY} width="320" height="84" />
              </clipPath>
            </defs>
            <path d={h.fan.cone} fill="#64748B" fillOpacity="0.14" stroke="#94A3B8" strokeOpacity="0.6" strokeWidth="0.8" />
            <path d={h.fan.cone} fill="#C2410C" fillOpacity="0.22" clipPath={`url(#${fanTip}-below)`} />
            <path d={h.fan.median} fill="none" stroke="#334155" strokeWidth="1.4" strokeDasharray="4 3" />
          </>
        )}
        <line x1="40" x2="316" y1={h.y5} y2={h.y5} stroke="#B45309" strokeDasharray="1.5 2.5" />
        <line x1="40" x2="316" y1={h.y1} y2={h.y1} stroke="#C2410C" strokeDasharray="3 3" />
        <line x1="40" x2="316" y1="70" y2="70" stroke="#E3E8EE" />
        <text x="36" y={h.y5L} textAnchor="end" fontSize="9" fill="#B45309" fontFamily={MONO}>
          5 km
        </text>
        <text x="36" y={h.y1L} textAnchor="end" fontSize="9" fill="#C2410C" fontFamily={MONO}>
          1 km
        </text>
        <text x="40" y="82" fontSize="9" fill="#64748B" fontFamily={MONO}>
          7 d before
        </text>
        <text x="316" y="82" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
          TCA
        </text>
        <line x1={h.nowX} x2={h.nowX} y1="4" y2="72" stroke="#0F172A" strokeDasharray="2 3" />
        <polyline points={h.missPts} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={h.missDots} fill="#0F172A" />
      </svg>
      </div>
      {h.fan && (
        <div className="fan-row">
          <span className="fan-key" aria-hidden="true" />
          <span className="tw help fan-label" tabIndex={0} aria-describedby={fanTip}>
            <span className="dotted">{h.fan.label}</span>
            <TipCard id={fanTip} title="Forecast at closest approach" lines={h.fan.tip} side={{ edge: 'right', px: 0 }} />
          </span>
        </div>
      )}
      <div className="rtn-head">
        <span className="caps">Relative position (r, t, n)</span>
        <span className="rtn-key" aria-hidden="true">
          <span>
            <i className="rtn-r" />r
          </span>
          <span>
            <i className="rtn-t" />t
          </span>
          <span>
            <i className="rtn-n" />n
          </span>
        </span>
      </div>
      <div className="chart-wrap">
      {h.rtn && <NowTag x={h.nowX} width={320} />}
      <svg viewBox="0 0 320 84" className="chart" role="img" aria-label="Relative position r, t and n in metres against time to closest approach for each message received so far">
        <line x1="40" x2="316" y1="38" y2="38" stroke="#CBD5E1" />
        <line x1="40" x2="316" y1="70" y2="70" stroke="#E3E8EE" />
        <text x="36" y="41" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
          0
        </text>
        <text x="40" y="82" fontSize="9" fill="#64748B" fontFamily={MONO}>
          7 d before
        </text>
        <text x="316" y="82" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
          TCA
        </text>
        {h.rtn ? (
          <>
            <text x="36" y="9" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
              +{h.rtn.maxTxt}
            </text>
            <text x="36" y="73" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
              −{h.rtn.maxTxt}
            </text>
            <line x1={h.nowX} x2={h.nowX} y1="4" y2="72" stroke="#0F172A" strokeDasharray="2 3" />
            <polyline points={h.rtn.r} fill="none" stroke="#0F172A" strokeWidth="1.6" strokeLinejoin="round" />
            <polyline points={h.rtn.t} fill="none" stroke="#475569" strokeWidth="1.6" strokeDasharray="5 3" strokeLinejoin="round" />
            <polyline points={h.rtn.n} fill="none" stroke="#64748B" strokeWidth="1.6" strokeDasharray="1.5 2.5" strokeLinecap="round" />
          </>
        ) : (
          <text x="178" y="30" textAnchor="middle" fontSize="10" fill="#64748B" fontFamily={MONO}>
            relative position not in replay data
          </text>
        )}
      </svg>
      </div>
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
          <ellipse cx="150" cy="150" rx={bp.rx3} ry={bp.ry3} transform={`rotate(${bp.rot} 150 150)`} fill="#475569" fillOpacity="0.06" stroke="#475569" strokeOpacity="0.4" strokeDasharray="3 3" />
          <ellipse cx="150" cy="150" rx={bp.rx1} ry={bp.ry1} transform={`rotate(${bp.rot} 150 150)`} fill="#475569" fillOpacity="0.16" stroke="#475569" strokeOpacity="0.6" />
          <circle cx="150" cy="150" r={bp.ring} fill="none" stroke="#C2410C" strokeWidth="1.2" strokeDasharray="5 4" />
          <line x1={bp.bx} y1={bp.by} x2={bp.ax} y2={bp.ay} stroke="#6D28D9" strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx="150" cy="150" r={bp.hbr} fill="#0F172A" />
          <circle cx={bp.bx} cy={bp.by} r="5.5" fill="#C2410C" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx={bp.ax} cy={bp.ay} r="5.5" fill="#6D28D9" stroke="#FFFFFF" strokeWidth="2" />
          <g stroke="#334155" strokeWidth="1.5">
            <line x1="14" x2={14 + Number(bp.scale.len)} y1="284" y2="284" />
            <line x1="14" x2="14" y1="279" y2="289" />
            <line x1={14 + Number(bp.scale.len)} x2={14 + Number(bp.scale.len)} y1="279" y2="289" />
          </g>
          <text x="14" y="273" fontSize="11" fill="#334155" fontFamily={MONO}>
            {bp.scale.label}
          </text>
        </svg>
        {bp.labels.map((l) => (
          <span key={l.text} className="plane-label" style={{ left: l.left, top: l.top, transform: l.transform, background: l.tone.bg, color: l.tone.fg }}>
            {l.text}
          </span>
        ))}
      </div>
      <span className="meta">
        Shaded: combined 1σ and 3σ ({bp.sigTxt}). Dashed ring: 1 km.
      </span>
    </figure>
  );
}

export function CostOfWaiting({ wc, budget }: { wc: CostOfWaitingView; budget: number }) {
  return (
    <figure className="ws-cell b-right">
      <figcaption>
        <span className="ws-cell-title">Cost of waiting</span>
        <span className="meta">lowest Δv per 6 h window, mm/s</span>
      </figcaption>
      <div className="cow">
        <NowTag x={wc.nowX} width={320} tip="Current replay time, measured from the planning message. Windows to the left have gone by; the curve to the right is the lowest Δv for each later 6 h window." />
        <svg viewBox="0 0 320 150" className="fill" role="img" aria-label="Lowest burn size needed if the burn happens in each later 6 hour window, with the Δv budget and the decision deadline">
          <rect x={wc.dlX} y="8" width={wc.dlW} height="118" fill="#FEE2E2" fillOpacity="0.7" />
          <line x1="36" x2="312" y1="10" y2="10" stroke="#EEF2F5" />
          <line x1="36" x2="312" y1="126" y2="126" stroke="#CBD5E1" />
          <line x1="36" x2="312" y1={wc.budgetY} y2={wc.budgetY} stroke="#C2410C" strokeDasharray="4 3" />
          <line x1={wc.nowX} x2={wc.nowX} y1="8" y2="128" stroke="#0F172A" strokeDasharray="2 3" />
          <line x1={wc.deadline.x} x2={wc.deadline.x} y1="8" y2="126" stroke="#DC2626" strokeWidth="1.2" />
          <path d={wc.path} fill="none" stroke="#0F172A" strokeWidth="1.8" />
          <path d={wc.over} fill="#C2410C" />
          <text x={wc.deadline.tx} y="22" textAnchor={wc.deadline.anchor} fontSize="8.5" fill="#B91C1C" fontFamily={MONO} stroke="#FFFFFF" strokeWidth="3" paintOrder="stroke">
            {wc.deadline.label}
          </text>
          <text x="32" y="129" textAnchor="end" fontSize="9" fill="#64748B" fontFamily={MONO}>
            0
          </text>
          {wc.ticks.map((t) => (
            <g key={t.label}>
              <line x1={t.x} x2={t.x} y1="126" y2="130" stroke="#CBD5E1" />
              <text x={t.x} y="138" textAnchor="middle" fontSize="8" fill="#64748B" fontFamily={MONO}>
                {t.label}
              </text>
            </g>
          ))}
          <text x="36" y="148" fontSize="8.5" fill="#64748B" fontFamily={MONO}>
            planning message
          </text>
          <text x="312" y="148" textAnchor="end" fontSize="8.5" fill="#64748B" fontFamily={MONO}>
            TCA − 3 h
          </text>
        </svg>
        <span className="cow-label" style={{ right: '89.4%', top: '6.67%', transform: 'translateY(-50%)', paddingRight: 4, color: '#64748B' }}>
          {wc.topTxt}
        </span>
        <span className="cow-label" style={{ left: '12.5%', top: wc.budgetPct, transform: 'translateY(-120%)', color: '#C2410C' }}>
          budget {budget} mm/s
        </span>
      </div>
      <span className="caption">{wc.caption}</span>
      <span className="meta">{wc.note}</span>
    </figure>
  );
}
