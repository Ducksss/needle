import { useId } from 'react';
import { useTween } from '../hooks';
import type { Lapse } from '../model/lapse';
import type { DockView, EventBar, LaneMark, LegendItem } from '../model/dock';
import { Hover, TipCard, noBreak, sideStyle } from './Hover';

interface TimelineProps {
  dock: DockView;
  /** Replay time of this run, hours: the clock ticks to it through the time-lapse. */
  T: number;
  lapse: Lapse | null;
  /** Highlight bars whose state changed since the previous run. */
  flash: boolean;
  legend: LegendItem[];
  clock: string;
  run: number;
  runs: number;
  playing: boolean;
  onPlay: () => void;
  onStep: (d: -1 | 1) => void;
  onRun: (run: number) => void;
  onPick: (id: number) => void;
}

const SWATCH: Record<string, string> = {
  bar: 'sw sw-bar',
  pc: 'sw sw-pc',
  ahead: 'sw sw-ahead',
  burn: 'sw sw-burn',
  deadline: 'sw sw-deadline',
  end: 'sw sw-end',
  band: 'sw sw-band',
};

export function Timeline({ dock, T, lapse, flash, legend, clock, run, runs, playing, onPlay, onStep, onRun, onPick }: TimelineProps) {
  const h = Math.round(useTween(T));
  const ticking = 'Run ' + (run + 1) + ' of ' + runs + ' · Day ' + (Math.floor(h / 24) + 1) + ', ' + String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';
  return (
    <section aria-label="Replay timeline" className="card dock">
      <div className="dock-bar">
        <div className="transport">
          <button type="button" className="btn-icon" aria-label="Previous screening run" onClick={() => onStep(-1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <polyline points="9,2 4,7 9,12" />
            </svg>
          </button>
          <button type="button" className="play" aria-pressed={playing} onClick={onPlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn-icon" aria-label="Next screening run" onClick={() => onStep(1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <polyline points="5,2 10,7 5,12" />
            </svg>
          </button>
        </div>
        <span className="clock" aria-hidden="true">
          {ticking}
        </span>
        <span className="sr-only" aria-live="polite">
          {clock}
        </span>
        {lapse?.label && <LapseChip key={lapse.key} label={lapse.label} />}
        <span className="meta">simulated calendar</span>
        <div className="legend">
          {legend.map((l) => (
            <Hover key={l.key} className="help" title={l.name} lines={[l.tip]} side={{ edge: 'right', px: 0 }}>
              <span className={SWATCH[l.key]} />
              <span className="dotted">{l.label}</span>
            </Hover>
          ))}
        </div>
      </div>
      <div className="dock-body">
        <div className="lane-names" aria-hidden="true">
          <div style={{ height: 22 }} />
          <div className="strip-label">
            <span>Open events</span>
            <span className="strip-decide">to decide</span>
          </div>
          {dock.lanes.map((ln) => (
            <div key={ln.sat} className={'lane-name' + (ln.selected ? ' on' : '') + (ln.empty ? ' empty' : '')} style={{ height: ln.h }}>
              {ln.sat}
            </div>
          ))}
        </div>
        <div className="dock-track">
          <div className="band" style={{ left: dock.band.left, width: dock.band.w }} />
          <div className="ticks">
            {dock.ticks.map((t) => (
              <span key={t.left}>
                <span className="tick" style={{ left: t.left, height: t.h }} />
                {t.label && (
                  <span className={'tick-label' + (t.minor ? ' minor' : '')} style={{ left: t.left }}>
                    {t.label}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="density">
            {dock.density.map((d) => (
              <span key={d.run} className="tw dens" style={{ left: d.left, width: d.w }} onClick={() => onRun(d.run)}>
                <span className={'dens-open' + (d.current ? ' now' : '')} style={{ height: d.h }} />
                <TipCard title={d.title} lines={[d.l1, d.l2]} side={d.side} />
              </span>
            ))}
            {dock.decideLine && (
              <svg className="decide-line" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
                <path d={dock.decideLine} fill="none" stroke="#F97316" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <span className="decide-max">{dock.decideMax ? 'max ' + dock.decideMax : 'none to decide'}</span>
          </div>
          {dock.lanes.map((ln) => (
            <div key={ln.sat} className={'lane' + (ln.empty ? ' empty' : '')} style={{ height: ln.h }}>
              {ln.bars.map((b) => {
                const lit = flash && b.changed;
                return <Bar key={lit ? b.id + ':' + run : b.id} b={b} lit={lit} onPick={onPick} />;
              })}
              {ln.marks.map((m) => (
                <Mark key={m.kind + m.left} m={m} />
              ))}
            </div>
          ))}
          <div className="playhead" style={{ left: dock.playLeft }} />
          <span className="playhead-label" style={{ left: dock.playLeft }}>
            {dock.playLabel}
          </span>
        </div>
      </div>
      <div className="scrub">
        <label htmlFor="replay-run">Screening run</label>
        <input id="replay-run" type="range" min={0} max={runs - 1} step={1} value={run} onChange={(e) => onRun(Number(e.target.value))} />
      </div>
    </section>
  );
}

function Bar({ b, lit, onPick }: { b: EventBar; lit: boolean; onPick: (id: number) => void }) {
  const id = useId();
  return (
    <>
      <span className={'tw ev' + (b.passed ? ' ev-passed' : '') + (lit ? ' flash' : '')} style={{ left: b.left, width: b.w, top: b.top }}>
        {b.future && <span className="ev-ahead" style={{ left: b.kw }} />}
        <button type="button" className="ev-btn" style={{ width: b.kw }} aria-pressed={b.selected} aria-label={b.aria} aria-describedby={id} onClick={() => onPick(b.id)}>
          {b.segs.map((sg, i) => (
            <span key={i} className="ev-seg" style={{ left: sg.left, width: sg.w }} />
          ))}
          <span className="ev-label">{b.label}</span>
        </button>
        <span className="tt" role="tooltip" id={id} style={sideStyle(b.side)}>
          <b>{b.tipTitle}</b>
          {b.tip.map((l, i) => (
            <span key={i} style={{ color: l.c }}>
              {noBreak(l.t)}
            </span>
          ))}
        </span>
      </span>
      {b.deadline && (
        <Hover className="deadline" style={{ left: b.deadline.left, top: b.top }} title={b.deadline.title} lines={b.deadline.lines} side={b.deadline.side}>
          <i />
        </Hover>
      )}
      {b.end && (
        <Hover className="end-dot" style={{ left: b.end.left, top: b.top + 4 }} title={b.end.title} lines={b.end.lines} side={b.end.side}>
          <i style={{ background: b.end.color }} />
        </Hover>
      )}
    </>
  );
}

function Mark({ m }: { m: LaneMark }) {
  return (
    <Hover className="mark" style={{ left: m.left, top: m.top, maxWidth: m.maxW }} title={m.title} lines={m.lines} side={m.side}>
      <span className={'mark-pill mark-' + m.kind}>
        <span className="mark-long">{m.text}</span>
        <span className="mark-short">{m.short}</span>
      </span>
    </Hover>
  );
}

/** "+8 h" after a run change. It fades after a moment; under reduced motion it stays as plain text. */
export function LapseChip({ label }: { label: string }) {
  return (
    <span className="lapse-chip" title="Replay time skipped by this change">
      {label}
    </span>
  );
}
