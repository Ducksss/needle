// Workspace for the selected event: header, message history, and either the burn planner or the messages table.

import type { CoaOption, Forecast, Mission, OptionKey, ReplayEvent } from '../data/types';
import { at, clamp, dh, dirLong, dirShort, dotPath, mTxt, odds, pcOdds, pcTxt, sci } from './format';
import { type Bucket, type KnownState, type Plan, type Tier, PC_ACTION, PC_WATCH, PLAN_CUTOFF_H, TIER_TIP, bucketOf, burnAt, burnPassed, isKnown, planAt, planOf, rtnAt, stateAt, tierOf, waitDv, windowIndex } from './replay';
import { type ForecastCard, type MissForecast, forecastAt, forecastCard, forecastLine, rangeTxt } from './forecast';
import { type Chip, type RunCtx, OPTION_NAMES, approvedAt, chipFor, isDeferredNow, orderedFeasible } from './run';
import { BUCKET_COLOR, C, TONE, type Tone } from './theme';

export interface EventHeader {
  id: number;
  sat: string;
  /** Mean altitude and inclination of the satellite, from fleet.json. */
  orbit: string | null;
  obj: string;
  chip: Chip;
  pcLabel: string;
  pc: string;
  odds: string | null;
  color: string;
  miss: string;
  tcaLabel: string;
  tcaTxt: string;
  msgs: string;
  status: string;
}

/** The "Forecast at closest approach" card: the forecast for an open event, or a note once it has passed. */
export type ForecastCardView = { kind: 'open'; card: ForecastCard } | { kind: 'passed'; text: string };

export interface RtnView {
  r: string;
  t: string;
  n: string;
  /** Half-height of the symmetric axis, as a label: "2 km". */
  maxTxt: string;
}

/** Forecast fan on the miss chart, from the now line to closest approach. */
export interface FanView {
  cone: string;
  median: string;
  /** y of the 1 km line: the cone below it is tinted. */
  clipY: string;
  label: string;
  tip: string[];
}

export interface HistoryView {
  pcPts: string;
  pcDots: string;
  pcHot: string;
  missPts: string;
  missDots: string;
  y1: string;
  y5: string;
  y1L: string;
  y5L: string;
  nowX: string;
  trend: string;
  /** Relative position against time to TCA; null until replay.json carries r, t, n. */
  rtn: RtnView | null;
  fan: FanView | null;
}

export interface Fact {
  k: string;
  v: string;
}

export interface OtherView {
  title: string;
  text: string;
  facts: Fact[];
}

export interface MsgRow {
  n: string;
  before: string;
  pc: string;
  pcTitle: string | undefined;
  pcColor: string;
  miss: string;
  tier: Tier;
  tierTone: Tone;
  tierTip: string;
  queue: string;
}

export interface AxisTick {
  x: string;
  label: string;
}

export interface CostOfWaitingView {
  path: string;
  over: string;
  /** Every 24 h after the planning message. */
  ticks: AxisTick[];
  /** Decision deadline line and its label. */
  deadline: { x: string; label: string; anchor: 'start' | 'end'; tx: string };
  budgetY: string;
  budgetPct: string;
  topTxt: string;
  nowX: string;
  dlX: string;
  dlW: string;
  caption: string;
  note: string;
}

export interface PlaneLabel {
  left: string;
  top: string;
  transform: string;
  tone: Tone;
  text: string;
}

export interface EncounterPlaneView {
  rx1: string;
  ry1: string;
  rx3: string;
  ry3: string;
  rot: string;
  ring: string;
  hbr: string;
  bx: string;
  by: string;
  ax: string;
  ay: string;
  sigTxt: string;
  /** Scale bar in the bottom-left corner: a round length near a quarter of the plot width. */
  scale: { len: string; label: string };
  labels: PlaneLabel[];
}

export interface OptionRow {
  key: OptionKey;
  name: string;
  dir: string;
  dvTxt: string;
  pcAfter: string;
  pcAfterTitle: string | undefined;
  missAfter: string;
  on: boolean;
  /** The burn time this option planned has gone by: shown, but it cannot be chosen. */
  passed: boolean;
}

export interface OptionsView {
  basis: string;
  rows: OptionRow[];
  decision: string;
  canDefer: boolean;
  approved: boolean;
  /** Approved: the options table shows the approved option and cannot change it. */
  locked: boolean;
  /** The selected option's burn time has passed, so it cannot be approved. */
  burnPassed: boolean;
  reviewLabel: string;
}

export interface Attitude {
  x: string;
  y: string;
  head: string;
  arc: string;
}

export interface GateCheck {
  ok: boolean;
  title: string;
  detail: string;
}

export interface ModalView {
  id: number;
  sat: string;
  obj: string;
  optName: string;
  approved: boolean;
  status: string;
  when: string;
  dv: string;
  dirLong: string;
  beta: number;
  burn: string;
  prop: string;
  dA: string;
  missNow: string;
  missAfter: string;
  pcNow: string;
  pcNowOdds: string | null;
  pcAfter: string;
  pcAfterOdds: string | null;
  rationale: string;
  approveLabel: string;
  /** The planned burn time has gone by: approval is blocked. */
  burnPassed: boolean;
  att: Attitude;
  checks: GateCheck[];
}

export interface PlannerView {
  plan: Plan;
  opt: CoaOption;
  wc: CostOfWaitingView;
  bp: EncounterPlaneView;
  opts: OptionsView;
  modal: ModalView;
}

export type WorkspaceView =
  | { kind: 'empty'; text: string }
  | {
      kind: 'event';
      header: EventHeader;
      /** Null without forecast.json. */
      forecast: ForecastCardView | null;
      hist: HistoryView;
      planner: PlannerView | null;
      other: OtherView | null;
      msgRows: MsgRow[];
    };

export interface WorkspaceFacts {
  medianWaitRatio24h: number | null;
}

const QUEUE_NAME: Record<Bucket, string> = {
  pc: 'Decide',
  hidden: 'Watch · Pc high, far',
  distance: 'Watch · miss under 1 km',
  elevated: 'Watch',
  quiet: 'Quiet',
};

export const TIER_TONE: Record<Tier, Tone> = { CRITICAL: TONE.decide, ELEVATED: TONE.watch, SAFE: TONE.passed };

export function buildHistory(e: ReplayEvent, s: KnownState, T: number, fc: MissForecast | null = null): HistoryView {
  const vis = e.m.slice(0, s.k + 1);
  const xp = (hb: number) => 40 + ((168 - clamp(hb, 0, 168)) / 168) * 276;
  const yPc = (r: number) => 6 + ((-2 - clamp(r, -14, -2)) / 12) * 80;
  const maxMiss = Math.max(...vis.map((v) => v[2]));
  const yMax = clamp(Math.max(6000, maxMiss * 1.15, fc ? fc.q90M * 1.05 : 0), 6000, 40000);
  const yMs = (v: number) => 70 - (Math.min(v, yMax) / yMax) * 62;
  const pcP = vis.map((v) => [xp(e.tca - v[0]), yPc(v[1]), v[1]] as const);
  const msP = vis.map((v) => [xp(e.tca - v[0]), yMs(v[2])] as const);
  const lastTwo = vis.slice(-2);
  let trend = 'first message';
  if (lastTwo.length === 2) {
    const d = lastTwo[1][1] - lastTwo[0][1];
    trend = (d > 0.3 ? 'Pc rising' : d < -0.3 ? 'Pc falling' : 'Pc steady') + ' · miss ' + (lastTwo[1][2] < lastTwo[0][2] ? 'shrinking' : 'growing');
  }
  let fan: FanView | null = null;
  if (fc) {
    const x0 = xp(Math.max(0, e.tca - T));
    const y0 = yMs(fc.missM);
    const top = yMs(fc.q90M);
    fan = {
      cone: 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + 'L316,' + top.toFixed(1) + 'L316,' + yMs(fc.q10M).toFixed(1) + 'Z',
      median: 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + 'L316,' + yMs(fc.q50M).toFixed(1),
      clipY: yMs(1000).toFixed(1),
      label: 'forecast · likely final ' + rangeTxt(fc.q10M, fc.q90M),
      tip: forecastLine(fc).tip,
    };
  }
  return {
    fan,
    rtn: buildRtn(e, s, xp),
    pcPts: pcP.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
    pcDots: pcP.filter((p) => p[2] < PC_ACTION).map((p) => dotPath(p[0], p[1], 2.2)).join(''),
    pcHot: pcP.filter((p) => p[2] >= PC_ACTION).map((p) => dotPath(p[0], p[1], 3)).join(''),
    missPts: msP.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
    missDots: msP.map((p) => dotPath(p[0], p[1], 2.2)).join(''),
    y1: yMs(1000).toFixed(1),
    y5: yMs(5000).toFixed(1),
    y1L: (yMs(1000) + 3).toFixed(1),
    // When the axis is stretched by a far miss the two threshold lines sit close; keep their labels apart.
    y5L: Math.min(yMs(5000) + 3, yMs(1000) + 3 - 9).toFixed(1),
    nowX: xp(Math.max(0, e.tca - T)).toFixed(1),
    trend,
  };
}

/** Axis half-heights for the relative-position chart, m. */
const RTN_STEPS = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];

/** r, t and n polylines on a symmetric axis around zero, in the 320 × 84 view box shared with the miss chart. */
export function buildRtn(e: ReplayEvent, s: KnownState, xp: (hoursBefore: number) => number): RtnView | null {
  const pts: { x: number; v: [number, number, number] }[] = [];
  for (let i = 0; i <= s.k; i++) {
    const v = rtnAt(e, i);
    if (v) pts.push({ x: xp(e.tca - e.m[i][0]), v });
  }
  if (!pts.length) return null;
  const peak = Math.max(...pts.flatMap((p) => p.v.map(Math.abs)));
  const top = RTN_STEPS.find((v) => v >= peak) ?? RTN_STEPS[RTN_STEPS.length - 1];
  const y = (v: number) => 38 - (clamp(v, -top, top) / top) * 32;
  const line = (j: 0 | 1 | 2) => pts.map((p) => p.x.toFixed(1) + ',' + y(p.v[j]).toFixed(1)).join(' ');
  return { r: line(0), t: line(1), n: line(2), maxTxt: top >= 1000 ? top / 1000 + ' km' : top + ' m' };
}

function buildHeader(ctx: RunCtx, e: ReplayEvent, s: KnownState, plan: Plan | null, mission: Mission | undefined): EventHeader {
  const resolved = s.phase === 'resolved';
  const appr = approvedAt(ctx, e.id);
  let status: string;
  if (resolved) {
    status = s.last[1] >= PC_ACTION && appr == null ? 'Passed with Pc still at or above 1e-4 and no approved burn. Flag for post-event review.' : 'Closest approach has passed.';
  } else if (appr != null) {
    status = 'Burn approved at run ' + appr + ' (simulated). Later messages are the real recorded ones, so they do not show the burn’s effect.';
  } else if (s.bucket === 'pc') {
    status = !plan
      ? e.tca - ctx.T < PLAN_CUTOFF_H
        ? 'Pc at or above 1e-4, but closest approach is under 3 h away. Hand over to flight dynamics.'
        : 'Pc at or above 1e-4, but the planner gave no burn plan for this message. Re-check at the next message.'
      : isDeferredNow(ctx, e.id)
        ? 'Deferred at this run. It returns to Decide at the next run.'
        : 'Pc at or above 1e-4. Choose a burn, or defer to the next screening run.';
  } else if (s.peaked) {
    status = 'Pc reached 1e-4 earlier and has fallen back. The plan was withdrawn; watching to closest approach.';
  } else {
    status = 'Below the action threshold. Re-scored at every screening run.';
  }
  return {
    id: e.id,
    sat: e.sat,
    orbit: mission ? mission.alt + ' km · ' + mission.inc.toFixed(1) + '°' : null,
    obj: e.obj.toLowerCase(),
    chip: chipFor(ctx, e, s),
    pcLabel: resolved ? 'Final Pc' : 'Pc',
    pc: pcTxt(s.last[1]),
    odds: pcOdds(s.last[1]),
    color: resolved ? C.slate : (BUCKET_COLOR[s.bucket] ?? C.slate),
    miss: mTxt(s.last[2]),
    tcaLabel: resolved ? 'Since TCA' : 'To TCA',
    tcaTxt: dh(e.tca - ctx.T),
    msgs: String(s.k + 1),
    status,
  };
}

function buildOther(ctx: RunCtx, e: ReplayEvent, s: KnownState): { other: OtherView; msgRows: MsgRow[] } {
  const vis = e.m.slice(0, s.k + 1);
  const msgRows = vis
    .map((v, i): MsgRow => {
      const t = tierOf(v);
      const b = bucketOf(v);
      return { n: String(i + 1), before: dh(e.tca - v[0]), pc: pcTxt(v[1]), pcTitle: pcOdds(v[1]) ?? undefined, pcColor: BUCKET_COLOR[b] ?? C.slate, miss: mTxt(v[2]), tier: t, tierTone: TIER_TONE[t], tierTip: TIER_TIP[t], queue: QUEUE_NAME[b] };
    })
    .reverse();
  const peak = Math.max(...vis.map((v) => v[1]));
  const appr = approvedAt(ctx, e.id);
  let other: OtherView;
  if (s.phase === 'resolved') {
    other = {
      title: 'Outcome',
      text:
        appr != null
          ? 'A burn was approved at run ' + appr + ' (simulated). The recorded messages do not include it; without the burn, the final Pc was ' + pcTxt(s.last[1]) + '.'
          : s.last[1] >= PC_ACTION
            ? 'No burn was approved, and the final Pc was still at or above 1e-4. Flag for post-event review.'
            : 'No burn was needed: the final Pc was below 1e-4.',
      facts: [
        { k: 'Peak Pc', v: pcTxt(peak) },
        { k: 'Final Pc', v: pcTxt(s.last[1]) },
        { k: 'Final miss', v: mTxt(s.last[2]) },
        { k: 'Messages', v: String(vis.length) },
      ],
    };
  } else if (s.bucket === 'pc') {
    const late = e.tca - ctx.T < PLAN_CUTOFF_H;
    other = {
      title: late ? 'Too close to plan' : 'No burn plan for this message',
      text: late
        ? 'A burn this close to closest approach needs flight-dynamics planning outside this tool.'
        : 'The planner did not run for this message, so there is no burn to review. Needle plans again when the next message arrives.',
      facts: [
        { k: 'Pc', v: pcTxt(s.last[1]) },
        { k: 'To TCA', v: dh(e.tca - ctx.T) },
      ],
    };
  } else {
    const miss = s.last[2];
    const risk = s.last[1];
    const rule =
      miss < 1000 ? 'miss under 1 km' : miss > 5000 && risk >= PC_WATCH ? 'Pc ≥ 1e-6 though far' : risk >= PC_WATCH ? 'Pc ≥ 1e-6' : s.peaked ? 'earlier Pc ≥ 1e-4' : 'miss under 5 km';
    other = {
      title: s.peaked ? 'Why it was downgraded' : 'Why it is on watch',
      text: s.peaked
        ? 'Tracking improved and Pc fell below 1e-4.'
        : 'It meets a watch rule but not the action rule (Pc ≥ 1e-4). The planner runs automatically if a later message crosses it.',
      facts: [
        { k: 'Peak Pc so far', v: pcTxt(peak) },
        { k: 'Rule triggered', v: rule },
        { k: 'Next message', v: 'about ' + ctx.replay.runH + ' h (next run)' },
      ],
    };
  }
  return { other, msgRows };
}

function buildCostOfWaiting(ctx: RunCtx, plan: Plan, facts: WorkspaceFacts): CostOfWaitingView {
  const budget = ctx.budget;
  const w = plan.c.wait;
  const H = w.length ? w[w.length - 1][0] + 6 : 6;
  const dvs = w.map((x) => x[1]).filter((v): v is number => v != null);
  const yTop = Math.ceil(clamp(Math.max(budget * 1.6, (dvs.length ? Math.max(...dvs) : budget) * 1.1), 4, 80));
  const X = (h: number) => 36 + (clamp(h, 0, H) / H) * 276;
  const Y = (dv: number) => 126 - (Math.min(dv, yTop) / yTop) * 116;
  let path = '';
  let over = '';
  w.forEach(([h, dv], i) => {
    if (dv == null) {
      over += 'M' + X(h).toFixed(1) + ' 8H' + X(h + 6).toFixed(1) + 'V12H' + X(h).toFixed(1) + 'Z';
      return;
    }
    const joined = path && w[i - 1] && w[i - 1][1] != null;
    path += (joined ? 'V' : 'M' + X(h).toFixed(1) + ' ') + Y(dv).toFixed(1) + 'H' + X(h + 6).toFixed(1);
  });
  const dlRel = plan.dlAbs - plan.msgT;
  const wi = windowIndex(plan.c, plan.age);
  const wNow = waitDv(plan.c, wi);
  const later = plan.c.wait[wi + 4];
  const nowTxt = wNow != null ? wNow.toFixed(1) : 'over 80';
  // A missing window is past TCA − 3 h; a null Δv means the window needs over 80 mm/s.
  const dayLater = !later
    ? 'not possible before closest approach'
    : later[1] == null
      ? 'over 80 mm/s'
      : later[1].toFixed(1) + ' mm/s' + (wNow ? ' (' + (later[1] / wNow).toFixed(2) + '×)' : '');
  const ticks: AxisTick[] = [];
  for (let h = 24; h < H - 4; h += 24) ticks.push({ x: X(h).toFixed(1), label: '+' + h + ' h' });
  const dlX = X(dlRel);
  const right = dlX > 200;
  const deadline = { x: dlX.toFixed(1), label: 'deadline ' + at(plan.dlAbs), anchor: right ? ('end' as const) : ('start' as const), tx: (right ? dlX - 4 : dlX + 4).toFixed(1) };
  const median = facts.medianWaitRatio24h != null ? ' Across all escalations, waiting 24 h costs a median ' + facts.medianWaitRatio24h.toFixed(2) + '× the Δv.' : '';
  return {
    path,
    over,
    ticks,
    deadline,
    budgetY: Y(budget).toFixed(1),
    budgetPct: (Y(budget) / 1.5).toFixed(2) + '%',
    topTxt: String(yTop),
    nowX: X(plan.age).toFixed(1),
    dlX: X(dlRel).toFixed(1),
    dlW: Math.max(0, X(H) - X(dlRel)).toFixed(1),
    caption: plan.overNow
      ? 'Past the ' + budget + ' mm/s deadline since ' + at(plan.dlAbs) + '. The current window needs ' + (wNow != null ? wNow.toFixed(1) + ' mm/s.' : 'over 80 mm/s.')
      : 'Burn in the current window: ' + nowTxt + ' mm/s. One day later: ' + dayLater + '. Budget holds until ' + at(plan.dlAbs) + ', in ' + dh(plan.left) + '.',
    note: 'Best burn time inside each window (orbital phase matters). Shaded: past the decision deadline.' + median,
  };
}

function buildEncounterPlane(plan: Plan, opt: CoaOption): EncounterPlaneView {
  const cev = plan.c;
  const m0 = cev.m2;
  const m1 = opt.m2After;
  const fit = Math.max(Math.hypot(m0[0], m0[1]), Math.hypot(m1[0], m1[1]), 2.2 * cev.ell.a, 1300) * 1.12;
  const sc = 140 / fit;
  const P2 = (v: [number, number]) => [150 + v[1] * sc, 150 - v[0] * sc] as const;
  const b0 = P2(m0);
  const a1 = P2(m1);
  const len = scaleBarM(75 / sc);
  return {
    rx1: Math.max(1.5, cev.ell.a * sc).toFixed(1),
    ry1: Math.max(1.5, cev.ell.b * sc).toFixed(1),
    rx3: Math.max(3, 3 * cev.ell.a * sc).toFixed(1),
    ry3: Math.max(3, 3 * cev.ell.b * sc).toFixed(1),
    rot: (cev.ell.deg - 90).toFixed(1),
    ring: (1000 * sc).toFixed(1),
    hbr: Math.max(2.5, cev.hbrEff * sc).toFixed(1),
    bx: b0[0].toFixed(1),
    by: b0[1].toFixed(1),
    ax: a1[0].toFixed(1),
    ay: a1[1].toFixed(1),
    sigTxt: mTxt(cev.ell.a) + ' × ' + mTxt(cev.ell.b),
    scale: { len: (len * sc).toFixed(1), label: len >= 1000 ? len / 1000 + ' km' : len + ' m' },
    labels: [
      { left: (b0[0] / 3).toFixed(2) + '%', top: (b0[1] / 3).toFixed(2) + '%', transform: 'translate(8px, -130%)', tone: TONE.decide, text: 'now ' + mTxt(cev.miss) },
      { left: (a1[0] / 3).toFixed(2) + '%', top: (a1[1] / 3).toFixed(2) + '%', transform: 'translate(8px, 30%)', tone: TONE.deferred, text: 'after ' + mTxt(opt.missAfter) },
    ],
  };
}

/** Scale-bar lengths, m. */
export const SCALE_STEPS = [250, 500, 1000, 2000, 5000];

/** The scale-bar length closest (on a log scale) to the target length. */
export function scaleBarM(targetM: number): number {
  return SCALE_STEPS.reduce((best, v) => (Math.abs(Math.log(v / targetM)) < Math.abs(Math.log(best / targetM)) ? v : best));
}

export function buildAttitude(alpha: number): Attitude {
  const a = (alpha * Math.PI) / 180;
  const L = 72;
  const tx = 110 + L * Math.cos(a);
  const ty = 110 - L * Math.sin(a);
  const hx = 110 + (L + 12) * Math.cos(a);
  const hy = 110 - (L + 12) * Math.sin(a);
  const px = 7 * Math.sin(a);
  const py = 7 * Math.cos(a);
  return {
    x: tx.toFixed(1),
    y: ty.toFixed(1),
    head: 'M' + hx.toFixed(1) + ',' + hy.toFixed(1) + 'L' + (tx + px).toFixed(1) + ',' + (ty + py).toFixed(1) + 'L' + (tx - px).toFixed(1) + ',' + (ty - py).toFixed(1) + 'Z',
    arc: alpha === 0 ? '' : 'M140,110A30,30 0 ' + (alpha > 180 ? 1 : 0) + ' 0 ' + (110 + 30 * Math.cos(a)).toFixed(1) + ',' + (110 - 30 * Math.sin(a)).toFixed(1),
  };
}

export function buildGateChecks(e: ReplayEvent, plan: Plan, opt: CoaOption, budget: number): GateCheck[] {
  const cev = plan.c;
  const wNow = waitDv(cev, windowIndex(cev, plan.age));
  const T = plan.msgT + plan.age;
  const passed = burnPassed(e, plan, opt);
  const inNow = Math.round((burnAt(e, opt) - plan.msgT) / 6) === Math.floor(plan.age / 6);
  const nowTxt = wNow != null ? wNow.toFixed(1) + ' mm/s' : 'over 80 mm/s';
  // The burn must still be ahead, and a burn in the current window must not promise less Δv than that window needs.
  const timing: GateCheck = passed
    ? {
        ok: false,
        title: 'Planned burn time passed ' + dh(T - burnAt(e, opt)) + ' ago.',
        detail: 'The current window needs ' + nowTxt + '; this plan offered ' + opt.dv.toFixed(1) + ' mm/s. Re-plan at the next message.',
      }
    : inNow && wNow != null && opt.dv + 0.05 < wNow
      ? { ok: false, title: 'Δv below what the current window needs.', detail: opt.dv.toFixed(1) + ' mm/s planned; the current window needs ' + nowTxt + '.' }
      : { ok: true, title: 'Plan computed ' + Math.round(plan.age) + ' h ago.', detail: inNow ? 'Burn falls in the current window (' + nowTxt + ').' : 'Burn in ' + dh(burnAt(e, opt) - T) + '.' };
  return [
    { ok: opt.pcAfter < 1e-4, title: 'Pc after burn below 1e-4.', detail: sci(opt.pcAfter) + '.' },
    { ok: opt.missAfter > 1000, title: 'Miss after burn above 1 km.', detail: mTxt(opt.missAfter) + '.' },
    {
      ok: cev.pcModelOk,
      title: cev.pcModelOk ? 'Model reproduces ESA’s Pc for this message.' : 'Model calibrated to ESA’s Pc.',
      detail: cev.pcModelOk ? 'Within 0.1 orders of magnitude.' : 'Effective radius ' + cev.hbrEff.toFixed(1) + ' m.',
    },
    { ok: opt.dv <= budget, title: opt.dv <= budget ? 'Within the Δv budget.' : 'Above the Δv budget.', detail: opt.dv.toFixed(1) + ' of ' + budget + ' mm/s.' },
    timing,
    { ok: false, title: 'Not verified here:', detail: 'burn execution error, drag and J2, and re-screening the new orbit against the catalogue.' },
  ];
}

function buildModal(ctx: RunCtx, e: ReplayEvent, plan: Plan, opt: CoaOption): ModalView {
  const cev = plan.c;
  const approved = approvedAt(ctx, e.id) != null;
  const obj = e.obj.toLowerCase();
  const passed = burnPassed(e, plan, opt);
  const T = plan.msgT + plan.age;
  // Pc now is ESA's Pc for the planning message, as everywhere else; the after value is the planner's model.
  const pcNow = e.m[plan.key][1];
  const aheadTxt = opt.dT >= 0 ? 'arrive about ' + (opt.dT / 1000).toFixed(1) + ' km earlier along the track' : 'arrive about ' + (-opt.dT / 1000).toFixed(1) + ' km later along the track';
  return {
    id: e.id,
    sat: e.sat,
    obj,
    optName: OPTION_NAMES[opt.key],
    approved,
    status: approved ? 'Approved · queued for upload' : 'Awaiting approval',
    when:
      'Message ' + (plan.key + 1) + (opt.key === 'coa3' ? ' + 24 h, ' : ' time, ') + Math.round(opt.leadH) + ' h before closest approach' +
      (passed ? ' (passed ' + dh(T - burnAt(e, opt)) + ' ago)' : ''),
    dv: opt.dv.toFixed(1) + ' mm/s',
    dirLong: dirLong(opt.alpha),
    beta: opt.beta,
    burn: 'about ' + Math.max(1, Math.round(opt.burnS)) + ' s at 1 N',
    prop: 'about ' + opt.propG.toFixed(1) + ' g',
    dA: 'semi-major axis ' + (opt.dA >= 0 ? '+' : '') + opt.dA.toFixed(1) + ' m',
    missNow: mTxt(cev.miss),
    missAfter: mTxt(opt.missAfter),
    pcNow: pcTxt(pcNow),
    pcNowOdds: pcOdds(pcNow),
    pcAfter: sci(opt.pcAfter),
    pcAfterOdds: odds(opt.pcAfter),
    rationale:
      'The ' + (obj === 'unknown' ? 'unidentified object' : obj) + ' passes ' + mTxt(cev.miss) + ' away at ' + cev.relSpeed.toFixed(1) + ' km/s on a ' + Math.round(cev.crossDeg) +
      '° crossing. This ' + dirShort(opt.alpha).toLowerCase() + ' burn makes us ' + aheadTxt + ' by closest approach, which opens the encounter-plane miss to ' + mTxt(opt.missAfter) +
      ' and cuts Pc to ' + sci(opt.pcAfter) + '.',
    approveLabel: approved ? 'Approved' : passed ? 'Burn time passed' : 'Approve and queue upload',
    burnPassed: !approved && passed,
    att: buildAttitude(opt.alpha),
    checks: buildGateChecks(e, plan, opt, ctx.budget),
  };
}

/**
 * The feasible option the operator picked, else the first in display order (robust first). Options whose burn time has
 * passed are skipped while another is still ahead.
 */
export function pickOption(plan: Plan | null, key: OptionKey, e?: ReplayEvent): CoaOption | null {
  if (!plan) return null;
  const feasible = orderedFeasible(plan.c.opts);
  const live = e ? feasible.filter((o) => !burnPassed(e, plan, o)) : feasible;
  return live.find((o) => o.key === key) ?? live[0] ?? feasible.find((o) => o.key === key) ?? feasible[0] ?? null;
}

/** Same Δv and direction: the minimum-Δv burn already meets the robust target. */
const sameBurn = (a: CoaOption, b: CoaOption) => a.dv === b.dv && a.alpha === b.alpha && a.beta === b.beta;

function optionSub(o: CoaOption, all: CoaOption[], robustMissM: number | undefined): string {
  if (o.key === 'coa4') return 'keeps ≥ 1 km at the pessimistic end' + (robustMissM != null ? ' (target ' + Math.round(robustMissM).toLocaleString('en-US') + ' m)' : '');
  const robust = all.find((x) => x.key === 'coa4');
  if (o.key === 'coa1' && robust && sameBurn(o, robust)) return dirShort(o.alpha) + ' · same burn: already robust';
  return dirShort(o.alpha);
}

export function buildWorkspace(ctx: RunCtx, e: ReplayEvent | null, optKey: OptionKey, facts: WorkspaceFacts, mission?: Mission, forecast?: Forecast | null): WorkspaceView {
  if (!e) return { kind: 'empty', text: 'Select an event from the queue, the timeline or the run digest.' };
  const st = stateAt(e, ctx.T, ctx.replay.runH);
  if (!isKnown(st)) return { kind: 'empty', text: 'Event #' + e.id + ' has not been reported yet. Its first message arrives in ' + dh(e.m[0][0] - ctx.T) + '.' };
  const live = planOf(e, st, ctx.T, ctx.budget);
  // An approved burn stays the one approved, even when a later message brings a new plan.
  const stored = approvedAt(ctx, e.id) != null ? ctx.dec.approvedPlan[e.id] : undefined;
  const plan = live && stored && e.coa[String(stored.key)] ? planAt(e, stored.key, ctx.T, ctx.budget) : live;
  const opt = stored && plan ? (orderedFeasible(plan.c.opts).find((o) => o.key === stored.opt) ?? null) : pickOption(plan, optKey, e);
  const fc = forecastAt(forecast, e, st);
  const header = buildHeader(ctx, e, st, plan, mission);
  const hist = buildHistory(e, st, ctx.T, fc);
  const fcCard: ForecastCardView | null = !forecast
    ? null
    : fc
      ? { kind: 'open', card: forecastCard(fc, e.tca - ctx.T) }
      : st.phase === 'resolved'
        ? { kind: 'passed', text: 'Closest approach has passed: the final miss was ' + mTxt(st.last[2]) + '. Nothing left to forecast.' }
        : null;
  if (plan && opt) {
    const appr = approvedAt(ctx, e.id);
    const optsAll = orderedFeasible(plan.c.opts);
    const opts: OptionsView = {
      basis: 'planned at message ' + (plan.key + 1) + ', ' + Math.round(plan.age) + ' h ago',
      rows: optsAll.map((o) => ({
        key: o.key,
        name: OPTION_NAMES[o.key],
        dir: optionSub(o, optsAll, plan.c.robustMissM) + (burnPassed(e, plan, o) ? ' · burn time passed' : ''),
        dvTxt: o.dv.toFixed(1) + ' mm/s',
        pcAfter: sci(o.pcAfter),
        pcAfterTitle: odds(o.pcAfter) ?? undefined,
        missAfter: mTxt(o.missAfter),
        on: o.key === opt.key,
        passed: burnPassed(e, plan, o),
      })),
      decision: appr != null ? 'Approved at run ' + appr + '.' : isDeferredNow(ctx, e.id) ? 'Deferred at this run; re-check after the next message.' : 'Not decided.',
      canDefer: appr == null && !isDeferredNow(ctx, e.id),
      approved: appr != null,
      locked: stored != null,
      burnPassed: appr == null && burnPassed(e, plan, opt),
      reviewLabel: appr != null ? 'View approved plan' : 'Review and approve',
    };
    const planner: PlannerView = { plan, opt, wc: buildCostOfWaiting(ctx, plan, facts), bp: buildEncounterPlane(plan, opt), opts, modal: buildModal(ctx, e, plan, opt) };
    return { kind: 'event', header, forecast: fcCard, hist, planner, other: null, msgRows: [] };
  }
  const { other, msgRows } = buildOther(ctx, e, st);
  return { kind: 'event', header, forecast: fcCard, hist, planner: null, other, msgRows };
}
