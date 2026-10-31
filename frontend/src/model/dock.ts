// Replay timeline dock: fleet density per run, one lane per satellite with Pc >= 1e-4 events, deadlines, burns and the 24 h band.

import type { CoaOption, OptionKey, Replay, ReplayEvent } from '../data/types';
import { at, clamp, dh, dirShort, mTxt, pcWithOdds, withOdds } from './format';
import { PC_ACTION, isKnown, planOf, stateAt } from './replay';
import { type RunCtx, OPTION_NAMES, approvedAt, chipFor } from './run';
import { C } from './theme';

/** Where a hover card anchors: its left or right edge, offset in px from the trigger's edge. */
export interface TipSide {
  edge: 'left' | 'right';
  px: number;
}

export interface TipLine {
  t: string;
  c: string;
}

export interface Tick {
  left: string;
  h: number;
  label: string;
  /** Hidden on narrow screens, which keep every fourth day and drop the last label so it cannot overflow. */
  minor: boolean;
}

export interface DensityBar {
  run: number;
  left: string;
  w: string;
  h: string;
  current: boolean;
  side: TipSide;
  title: string;
  l1: string;
  l2: string;
}

export interface DeadlineMark {
  left: string;
  side: TipSide;
  title: string;
  lines: string[];
}

export interface EndDot {
  left: string;
  color: string;
  side: TipSide;
  title: string;
  lines: string[];
}

export interface EventBar {
  id: number;
  top: number;
  left: string;
  w: string;
  /** Width of the known part, as a share of the bar. */
  kw: string;
  segs: { left: string; w: string }[];
  label: string;
  aria: string;
  selected: boolean;
  future: boolean;
  /** Closest approach has passed: drawn faded. */
  passed: boolean;
  /** Chip changed since the previous run. */
  changed: boolean;
  side: TipSide;
  tipTitle: string;
  tip: TipLine[];
  deadline: DeadlineMark | null;
  end: EndDot | null;
}

export type MarkKind = 'approved' | 'proposed';

export interface LaneMark {
  kind: MarkKind;
  top: number;
  left: string;
  /** Keeps the pill inside the lane: the room left of the lane's right edge. */
  maxW: string;
  side: TipSide;
  text: string;
  /** Pill text on narrow screens. */
  short: string;
  title: string;
  lines: string[];
}

export interface Lane {
  sat: string;
  h: number;
  /** No event of this satellite reported yet: the lane stays, collapsed, so lanes do not jump during playback. */
  empty: boolean;
  selected: boolean;
  bars: EventBar[];
  marks: LaneMark[];
}

export interface DockView {
  ticks: Tick[];
  density: DensityBar[];
  /** Step line of the to-decide count per run, in a 100 × 34 view box, on its own scale. */
  decideLine: string;
  decideMax: number;
  lanes: Lane[];
  playLeft: string;
  playLabel: string;
  /** The Next 24 h window, [T, T + 24 h]. */
  band: { left: string; w: string };
}

export interface LegendItem {
  key: string;
  label: string;
  name: string;
  tip: string;
}

/** Hours shown on the dock: the replay window plus one day for passes near its end. */
export const dockHours = (replay: Replay) => replay.windowH + 24;

const densityCache = new WeakMap<Replay, [open: number, pc: number][]>();

/** Open events and events at Pc >= 1e-4 at each run. Depends only on the data, so it is computed once. */
export function densityCounts(replay: Replay): [number, number][] {
  const hit = densityCache.get(replay);
  if (hit) return hit;
  const counts: [number, number][] = [];
  for (let r = 0; r < replay.runs; r++) {
    let o = 0;
    let n = 0;
    for (const e of replay.events) {
      const s = stateAt(e, r * replay.runH, replay.runH);
      if (s.phase === 'open') {
        o++;
        if (s.bucket === 'pc') n++;
      }
    }
    counts.push([o, n]);
  }
  densityCache.set(replay, counts);
  return counts;
}

/** Assigns events in one lane to stacked tracks so their bars do not overlap. */
export function assignTracks(items: ReplayEvent[]): { trackOf: Record<number, number>; count: number } {
  const trackEnd: number[] = [];
  const trackOf: Record<number, number> = {};
  for (const e of items) {
    let tr = trackEnd.findIndex((end) => e.m[0][0] > end + 30);
    if (tr < 0) {
      tr = trackEnd.length;
      trackEnd.push(0);
    }
    trackEnd[tr] = e.tca + 60;
    trackOf[e.id] = tr;
  }
  return { trackOf, count: Math.max(1, trackEnd.length) };
}

/** Height of a lane with nothing reported yet, px. */
export const EMPTY_LANE_H = 14;

/** Open events at Pc >= 1e-4 with no approved burn, per run: the "To decide" KPI at every run. */
export function decideCounts(ctx: RunCtx): number[] {
  const { replay, dec } = ctx;
  const counts = densityCounts(replay).map((c) => c[1]);
  const byId = new Map(replay.events.map((e) => [e.id, e]));
  for (const [id, a] of Object.entries(dec.approved)) {
    const e = byId.get(Number(id));
    if (!e) continue;
    for (let r = 0; r < replay.runs; r++) {
      const s = stateAt(e, r * replay.runH, replay.runH);
      if (s.phase === 'open' && s.bucket === 'pc' && a <= r + 1) counts[r]--;
    }
  }
  return counts;
}

export function buildDock(ctx: RunCtx, sel: number | null, selSat: string | null, optKey: OptionKey, changed: Set<number> = new Set()): DockView {
  const { replay, T, run, budget } = ctx;
  const runH = replay.runH;
  const DOM = dockHours(replay);
  const pctH = (h: number) => ((clamp(h, 0, DOM) / DOM) * 100).toFixed(3) + '%';
  const wH = (a: number, b: number) => Math.max(0.4, ((clamp(b, 0, DOM) - clamp(a, 0, DOM)) / DOM) * 100).toFixed(3) + '%';
  const roomRight = (h: number) => 'calc(' + (100 - (clamp(h, 0, DOM) / DOM) * 100).toFixed(3) + '% - 8px)';
  const sideOf = (h: number, near?: TipSide): TipSide => (clamp(h, 0, DOM) / DOM > 0.62 ? { edge: 'right', px: 0 } : (near ?? { edge: 'left', px: 0 }));

  const counts = densityCounts(replay);
  const maxO = Math.max(1, ...counts.map((c) => c[0]));
  const barW = ((runH / DOM) * 100 * 0.78).toFixed(3) + '%';
  const decide = decideCounts(ctx);
  const decideMax = Math.max(0, ...decide);
  const density = counts.map(
    (c, r): DensityBar => ({
      run: r,
      left: pctH(r * runH),
      w: barW,
      h: ((c[0] / maxO) * 100).toFixed(1) + '%',
      current: r === run,
      side: r > replay.runs * 0.625 ? { edge: 'right', px: 0 } : { edge: 'left', px: 0 },
      title: 'Run ' + (r + 1) + ' · ' + at(r * runH),
      l1: c[0] + ' events open (grey bar, true scale)',
      l2: decide[r] + ' to decide (orange line, scale 0 to ' + decideMax + ')',
    }),
  );
  let decideLine = '';
  if (decideMax > 0) {
    const step = (runH / DOM) * 100;
    decide.forEach((n, r) => {
      const y = (33 - (n / decideMax) * 29).toFixed(2);
      decideLine += (r === 0 ? 'M' + (r * step).toFixed(3) + ' ' + y : 'V' + y) + 'H' + ((r + 1) * step).toFixed(3);
    });
  }

  const ticks: Tick[] = [];
  const days = Math.round(DOM / 24);
  for (let d = 0; d <= days; d++) ticks.push({ left: pctH(d * 24), h: d % 2 === 0 ? 10 : 5, label: d % 2 === 0 && d < days ? 'Day ' + (d + 1) : '', minor: d % 4 !== 0 || d >= days - 2 });

  const hiEvents = replay.events.filter((e) => e.m.some((mm) => mm[1] >= PC_ACTION));
  const laneSats = Array.from(new Set(hiEvents.map((e) => e.sat))).sort();
  const lanes = laneSats.map((sat): Lane => {
    const bars: EventBar[] = [];
    const marks: LaneMark[] = [];
    const items = hiEvents.filter((x) => x.sat === sat && x.m[0][0] <= T).sort((p1, p2) => p1.m[0][0] - p2.m[0][0]);
    const { trackOf, count } = assignTracks(items);
    for (const e of items) {
      const s = stateAt(e, T, runH);
      if (!isKnown(s)) continue;
      const y = 5 + trackOf[e.id] * 22;
      const start = e.m[0][0];
      const kEnd = Math.min(T, e.tca);
      const done = e.tca <= T;
      const cs = clamp(start, 0, DOM);
      const ck = clamp(kEnd, 0, DOM);
      const ce = clamp(done ? kEnd : e.tca, 0, DOM);
      const kSpan = Math.max(ck - cs, 1e-6);
      const segs: { left: string; w: string }[] = [];
      let hiH = 0;
      for (let i = 0; i <= s.k; i++) {
        if (e.m[i][1] < PC_ACTION) continue;
        const a2 = e.m[i][0];
        const b2 = Math.min(i + 1 <= s.k ? e.m[i + 1][0] : kEnd, kEnd);
        if (b2 > a2) {
          hiH += b2 - a2;
          segs.push({ left: (((clamp(a2, 0, DOM) - cs) / kSpan) * 100).toFixed(2) + '%', w: (((clamp(b2, 0, DOM) - clamp(a2, 0, DOM)) / kSpan) * 100).toFixed(2) + '%' });
        }
      }
      const appr = approvedAt(ctx, e.id);
      const pl = planOf(e, s, T, budget);
      const chip = chipFor(ctx, e, s);
      const tip: TipLine[] = [
        { t: chip.label + ': ' + chip.tip, c: '#E2E8F0' },
        { t: 'First message ' + at(start) + ' · ' + (s.k + 1) + (s.k ? ' messages' : ' message') + ' so far', c: '#CBD5E1' },
        { t: 'Latest Pc ' + pcWithOdds(s.last[1]) + ' · miss ' + mTxt(s.last[2]), c: '#CBD5E1' },
      ];
      if (hiH > 0) tip.push({ t: 'Orange: ' + (hiH < 1 ? 'under 1' : Math.round(hiH)) + ' h of ' + Math.round(kEnd - start) + ' h at Pc ≥ 1e-4', c: '#FDBA74' });
      tip.push({ t: done ? 'Closest approach ' + at(e.tca) + ', ' + dh(T - e.tca) + ' ago' : 'Dashed: ' + dh(e.tca - T) + ' to closest approach, ' + at(e.tca), c: '#CBD5E1' });
      tip.push({ t: 'Click the bar to open it in the workspace.', c: C.faint });
      bars.push({
        id: e.id,
        top: y,
        left: pctH(start),
        w: wH(start, done ? kEnd : e.tca),
        kw: (((ck - cs) / Math.max(ce - cs, 1e-6)) * 100).toFixed(2) + '%',
        segs,
        label: '#' + e.id,
        aria: 'Event ' + e.id + ', ' + chip.label.toLowerCase() + '. Select to open in the workspace.',
        selected: sel === e.id,
        future: !done,
        passed: done,
        changed: changed.has(e.id),
        side: sideOf(start),
        tipTitle: '#' + e.id + ' · ' + e.sat + ' vs ' + e.obj.toLowerCase(),
        tip,
        deadline:
          pl && !pl.overNow && appr == null
            ? {
                left: pctH(pl.dlAbs),
                side: sideOf(pl.dlAbs),
                title: 'Decision deadline · ' + at(pl.dlAbs),
                lines: ['After this, the cheapest burn needs more than ' + budget + ' mm/s.', 'Time left: ' + dh(pl.left) + '.', 'Read from the cost-of-waiting curve for message ' + (pl.key + 1) + '.'],
              }
            : null,
        end: done
          ? {
              left: pctH(e.tca),
              color: appr != null ? C.ok : s.last[1] >= PC_ACTION ? C.alarm : C.muted,
              side: sideOf(e.tca),
              title: 'Closest approach · ' + at(e.tca),
              lines: [
                'Final Pc ' + pcWithOdds(s.last[1]) + ' · miss ' + mTxt(s.last[2]) + '.',
                appr != null
                  ? 'Teal: a burn was approved at run ' + appr + '.'
                  : s.last[1] >= PC_ACTION
                    ? 'Red: Pc was still at or above 1e-4 and no burn was approved. Flag for review.'
                    : 'Grey: final Pc below 1e-4. No action was needed.',
              ],
            }
          : null,
      });
      if (appr != null) {
        const hA = (appr - 1) * runH;
        marks.push({
          kind: 'approved',
          top: y - 1,
          left: pctH(hA),
          maxW: roomRight(hA),
          side: sideOf(hA, { edge: 'left', px: 6 }),
          text: 'Burn approved',
          short: 'Approved',
          title: 'Burn approved · run ' + appr,
          lines: [ctx.dec.approvedTxt[e.id] ?? '', 'Simulated upload. Later messages are the real recorded ones, so they do not show the burn.'].filter(Boolean),
        });
      } else if (pl) {
        const o: CoaOption | undefined = (sel === e.id ? pl.c.opts.find((x) => x.key === optKey) : undefined) ?? pl.c.opts[0];
        if (o) {
          const hB = T + (o.key === 'coa3' ? 24 : 0);
          marks.push({
            kind: 'proposed',
            top: y - 1,
            left: pctH(hB),
            maxW: roomRight(hB),
            side: sideOf(hB, { edge: 'left', px: 6 }),
            text: 'Proposed burn · ' + o.dv.toFixed(1) + ' mm/s',
            short: o.dv.toFixed(1) + ' mm/s',
            title: 'Proposed burn · ' + OPTION_NAMES[o.key],
            lines: [
              o.dv.toFixed(1) + ' mm/s ' + dirShort(o.alpha).toLowerCase() + (o.key === 'coa3' ? ', 24 h after message ' : ', planned at message ') + (pl.key + 1) + '.',
              'Pc after ' + withOdds(o.pcAfter) + ' · miss after ' + mTxt(o.missAfter) + '.',
              pl.overNow ? 'Past the ' + budget + ' mm/s deadline.' : 'Decide by ' + at(pl.dlAbs) + ', in ' + dh(pl.left) + '.',
              'Not approved yet. Click the bar to review.',
            ],
          });
        }
      }
    }
    return { sat, h: items.length ? 6 + count * 22 : EMPTY_LANE_H, empty: !items.length, selected: selSat === sat, bars, marks };
  });

  const day = Math.floor(T / 24) + 1;
  const hh = String(T % 24).padStart(2, '0');
  return { ticks, density, decideLine, decideMax, lanes, playLeft: pctH(T), playLabel: 'Day ' + day + ' · ' + hh + ':00', band: { left: pctH(T), w: wH(T, T + 24) } };
}

export function buildLegend(budget: number): LegendItem[] {
  return [
    { key: 'bar', label: 'known', name: 'Event bar', tip: 'From the event’s first message to now. Each event is its own stream of messages, about one every 8 h. Faded: closest approach has passed.' },
    { key: 'pc', label: 'Pc ≥ 1e-4', name: 'Orange stretch', tip: 'Time when the latest message had Pc at or above 1e-4, the action threshold. In the open-events strip, the orange line is the count to decide at each run, on its own scale.' },
    { key: 'ahead', label: 'to closest approach', name: 'Dashed outline', tip: 'Time left until closest approach. Those messages have not arrived yet.' },
    { key: 'burn', label: 'proposed burn', name: 'Proposed burn', tip: 'The planner’s lowest-Δv option that brings Pc below 1e-4 and the miss above 1 km. It waits for approval.' },
    { key: 'deadline', label: 'decision deadline', name: 'Decision deadline', tip: 'After this, the cheapest burn needs more than the ' + budget + ' mm/s Δv budget.' },
    { key: 'end', label: 'passed unmitigated', name: 'Red end dot', tip: 'Closest approach passed with Pc still at or above 1e-4 and no approved burn. Grey: passed below 1e-4. Teal: burn approved.' },
    { key: 'band', label: 'next 24 h', name: 'Next 24 h', tip: 'The window the Next 24 h panel counts: closest approach within the next 24 h (time_to_tca ≤ 1 day) of this run.' },
  ];
}
