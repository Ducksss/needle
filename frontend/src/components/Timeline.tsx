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
  approved: 'sw sw-approved',
  deadline: 'sw sw-deadline',
  end: 'sw sw-end',
  band: 'sw sw-band',
  forecast: 'sw sw-forecast',
};

/** Approximate glyph widths, px: 10 px mono tick labels and 11 px bold pill text. */
const MONO10_CH = 6.1;
const PILL_CH = 6;

export function Timeline({ dock, T, runH, lapse, flash, legend, clock, run, runs, playing, onPlay, onStep, onRun, onPick }: TimelineProps) {
  // Run number, clock and playhead label all tick together through the time-lapse, so they never disagree.
  const h = Math.round(useTween(T));
  const hh = String(((h % 24) + 24) % 24).padStart(2, '0');
  const day = Math.floor(h / 24) + 1;
  const ticking = 'Run ' + (Math.round(h / runH) + 1) + ' of ' + runs + ' · Day ' + day + ', ' + hh + ':00';
  const playLabel = 'Day ' + day + ' · ' + hh + ':00';

  // Tick labels that would run under the playhead label (about 96 px wide, centred) are hidden.
  const track = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(1000);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const px = (pct: string) => (parseFloat(pct) / 100) * trackW;
  const nearPlayhead = (left: string, label: string) => {
    const lo = px(left) + 4 - px(dock.playLeft);
    return lo + label.length * MONO10_CH > -50 && lo < 50;
  };

  // The forecast tag sits right of the current run's bar, clear of the "max" label; shorter, or left off, when the
  // future part of the strip is too narrow, so it never lies over past bars.
  const FORECAST_LONG = 'forecast: expected Critical passes';
  const room = trackW - px(dock.playLeft) - px(dock.density[run]?.w ?? '0%') - 4 - 48;
  const forecastTag = room >= FORECAST_LONG.length * MONO10_CH ? FORECAST_LONG : room >= 8 * MONO10_CH ? 'forecast' : null;

  // A burn pill starts at its burn time, but never before the end of its bar's known part, so it never covers the bar.
  // When the full pill would reach the forecast ring, the deadline tick or the next bar in the row, it shrinks to a small
  // capsule; deadline ticks sit above pills and rings, so every tick stays hoverable. The card gives the time and Δv.
  const narrow = window.matchMedia('(max-width: 899px)').matches;
  const pillFit = (m: LaneMark, bars: EventBar[]): PillFit => {
    const b = bars.find((x) => x.id === m.id);
    const base = px(m.left) + 6;
    if (!b) return { shift: 0, compact: false };
    const start = Math.max(base, px(b.left) + (px(b.w) * parseFloat(b.kw)) / 100 + 2);
    // A mark at or just behind the pill start still blocks it, since the pill would sit on top of it.
    const ends = [
      b.forecast ? px(b.forecast.left) - 10 : Infinity,
      b.deadline ? px(b.deadline.left) - 7 : Infinity,
      ...bars.filter((x) => x.top === b.top && x.id !== b.id).map((x) => px(x.left) - 3),
    ].filter((v) => v > start - 16);
    const w = (narrow ? m.short : m.text).length * PILL_CH + 18;
    return { shift: start - base, compact: start + w > Math.min(Infinity, ...ends) };
  };

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
          {lapse?.label && <LapseChip key={lapse.key} label={lapse.label} />}
        </span>
        <span className="sr-only" aria-live="polite">
          {clock}
        </span>
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
          <div className="strip-note-gap" />
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
                {t.label && !nearPlayhead(t.left, t.label) && (
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
                {!d.future && <span className={'dens-open' + (d.current ? ' now' : '')} style={{ height: d.h }} />}
                <TipCard title={d.title} lines={[d.l1, d.l2]} side={d.side} />
              </span>
            ))}
            {dock.decideLine && (
              <svg className="decide-line" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
                <path d={dock.decideLine} fill="none" stroke="#F97316" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                {dock.forecastLine && <path d={dock.forecastLine} fill="none" stroke="#C2410C" strokeWidth="1.6" strokeDasharray="1 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              </svg>
            )}
            {dock.forecastLine && forecastTag && (
              <span className="forecast-tag" style={{ left: 'calc(' + dock.playLeft + ' + ' + (dock.density[run]?.w ?? '0%') + ' + 4px)' }}>
                {forecastTag}
              </span>
            )}
            <span className="decide-max">{dock.decideMax ? 'max ' + dock.decideMax : 'none to decide'}</span>
          </div>
          <p className="strip-note">
            <span>
              {trackW < 600
                ? 'Forecasts cover events already reported.'
                : 'Forecasts cover events already reported. New events usually appear about 7 days before closest approach, so the far right fills in as the replay advances.'}
            </span>
          </p>
          {dock.lanes.map((ln) => (
            <div key={ln.sat} className={'lane' + (ln.empty ? ' empty' : '')} style={{ height: ln.h }}>
              {ln.bars.map((b) => {
                const lit = flash && b.changed;
                // A label that would be cut to "#1" is left off; the bar's card and aria-label still name the event.
                const fits = (px(b.w) * parseFloat(b.kw)) / 100 >= b.label.length * MONO10_CH + 10;
                return <Bar key={lit ? b.id + ':' + run : b.id} b={b} lit={lit} fits={fits} onPick={onPick} />;
              })}
              {ln.marks.map((m) => (
                <Mark key={m.id + ':' + m.kind} m={m} fit={pillFit(m, ln.bars)} />
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

function Bar({ b, lit, fits, onPick }: { b: EventBar; lit: boolean; fits: boolean; onPick: (id: number) => void }) {
  const id = useId();
  return (
    <>
      <span className={'tw ev' + (b.passed ? ' ev-passed' : '') + (lit ? ' flash' : '')} style={{ left: b.left, width: b.w, top: b.top }}>
        {b.future && (
          <span
            className="ev-ahead"
            style={{ left: b.kw, borderColor: b.forecast?.p != null ? `rgba(194, 65, 12, ${(0.3 + 0.5 * b.forecast.p).toFixed(2)})` : undefined }}
          />
        )}
        <button type="button" className="ev-btn" style={{ width: b.kw }} aria-pressed={b.selected} aria-label={b.aria} aria-describedby={id} onClick={() => onPick(b.id)}>
          {b.segs.map((sg, i) => (
            <span key={i} className="ev-seg" style={{ left: sg.left, width: sg.w }} />
          ))}
          {fits && <span className="ev-label">{b.label}</span>}
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
      {b.forecast && (
        <Hover className="fc-ring-host" style={{ left: b.forecast.left, top: b.top + 2 }} title={b.forecast.title} lines={b.forecast.lines} side={b.forecast.side}>
          <i
            className={'fc-ring' + (b.forecast.p == null ? ' none' : '')}
            style={b.forecast.p != null ? { background: `conic-gradient(#C2410C ${(b.forecast.p * 360).toFixed(0)}deg, rgba(194, 65, 12, 0.14) 0)` } : undefined}
          />
          {b.forecast.label && <b className="fc-ring-label">{b.forecast.label}</b>}
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

interface PillFit {
  /** px to move the pill right so it starts after its bar's known part. */
  shift: number;
  /** No room for the full pill before the next mark: draw a small capsule. */
  compact: boolean;
}

function Mark({ m, fit }: { m: LaneMark; fit: PillFit }) {
  const left = fit.shift > 0 ? 'calc(' + m.left + ' + ' + fit.shift.toFixed(1) + 'px)' : m.left;
  return (
    <Hover className="mark" style={{ left, top: m.top, maxWidth: m.maxW }} title={m.title} lines={m.lines} side={m.side}>
      <span className={'mark-pill mark-' + m.kind + (fit.compact ? ' compact' : '')}>
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
