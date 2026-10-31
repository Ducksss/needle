import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { fitCard, useTween } from '../hooks';
import type { Lapse } from '../model/lapse';
import type { DockView, EventBar, LaneMark, LegendItem } from '../model/dock';
import { Hover, TipCard, noBreak, sideStyle } from './Hover';

interface TimelineProps {
  dock: DockView;
  /** Replay time of this run, hours: the clock ticks to it through the time-lapse. */
  T: number;
  runH: number;
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

export function Timeline({ dock, T, runH, lapse, flash, legend, clock, run, runs, playing, onPlay, onStep, onRun, onPick }: TimelineProps) {
  // Run number, clock and playhead label all tick together through the time-lapse, so they never disagree.
  const h = Math.round(useTween(T));
  const hh = String(((h % 24) + 24) % 24).padStart(2, '0');
  const day = Math.floor(h / 24) + 1;
  const ticking = 'Run ' + (Math.round(h / runH) + 1) + ' of ' + runs + ' · Day ' + day + ', ' + hh + ':00';
  const playLabel = 'Day ' + day + ' · ' + hh + ':00';

  // Tick labels within about 48 px of the playhead are hidden so its label does not sit on them.
  const track = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(1000);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const playPct = parseFloat(dock.playLeft);
  const nearPlayhead = (left: string) => (Math.abs(parseFloat(left) - playPct) / 100) * trackW < 48;

  // The density strip is one tab stop: arrow keys move between runs and show that run's card; Enter jumps to it.
  const [kbRun, setKbRun] = useState<number | null>(null);
  const onStripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = kbRun ?? run;
    const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? runs - 1 : null;
    if (next != null) {
      e.preventDefault();
      setKbRun(Math.max(0, Math.min(runs - 1, next)));
    } else if (e.key === 'Enter' && kbRun != null) {
      e.preventDefault();
      onRun(kbRun);
    }
  };
  const kbCard = kbRun != null ? dock.density[kbRun] : null;
  useEffect(() => {
    if (kbRun != null) fitCard(document.querySelector('.dens.kbd'));
  }, [kbRun]);
  return (
    <section aria-label="Replay timeline" className="card dock">
      <div className="dock-bar">
        <div className="transport">
          <button type="button" className="btn-icon" aria-label="Previous screening run" disabled={run <= 0} onClick={() => onStep(-1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <polyline points="9,2 4,7 9,12" />
            </svg>
          </button>
          <button type="button" className="play" aria-pressed={playing} onClick={onPlay}>
            {playing ? 'Pause' : run >= runs - 1 ? 'Replay' : 'Play'}
          </button>
          <button type="button" className="btn-icon" aria-label="Next screening run" disabled={run >= runs - 1} onClick={() => onStep(1)}>
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
        <div className="dock-track" ref={track}>
          <div className="band" style={{ left: dock.band.left, width: dock.band.w }} />
          <div className="ticks">
            {dock.ticks.map((t) => (
              <span key={t.left}>
                <span className="tick" style={{ left: t.left, height: t.h }} />
                {t.label && !nearPlayhead(t.left) && (
                  <span className={'tick-label' + (t.minor ? ' minor' : '')} style={{ left: t.left }}>
                    {t.label}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div
            className="density"
            tabIndex={0}
            role="group"
            aria-label="Open events and events to decide per run. Arrow keys move between runs, Enter jumps to one."
            onFocus={() => setKbRun(run)}
            onBlur={() => setKbRun(null)}
            onKeyDown={onStripKey}
          >
            <span className="sr-only" aria-live="polite">
              {kbCard ? kbCard.title + '. ' + kbCard.l1 + '. ' + kbCard.l2 : ''}
            </span>
            {dock.density.map((d) => (
              <span key={d.run} className={'tw dens' + (kbRun === d.run ? ' kbd' : '')} style={{ left: d.left, width: d.w }} onClick={() => onRun(d.run)}>
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
                <Mark key={m.id + ':' + m.kind} m={m} />
              ))}
            </div>
          ))}
          <div className="playhead" style={{ left: dock.playLeft }} />
          <span className="playhead-label" style={{ left: dock.playLeft }}>
            {playLabel}
          </span>
        </div>
      </div>
      <div className="scrub">
        <label htmlFor="replay-run">Screening run</label>
        <input id="replay-run" type="range" min={0} max={runs - 1} step={1} value={run} aria-valuetext={clock} onChange={(e) => onRun(Number(e.target.value))} />
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
