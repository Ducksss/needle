// Workspace for the selected event: header, message history, and either the burn planner or the messages table.

import type { CoaOption, OptionKey, ReplayEvent } from '../data/types';
import { at, clamp, dh, dirLong, dirShort, dotPath, mTxt, pcTxt, sci } from './format';
import { type Bucket, type KnownState, type Plan, type Tier, PC_ACTION, PC_WATCH, TIER_TIP, bucketOf, isKnown, planOf, stateAt, tierOf, waitDv, windowIndex } from './replay';
import { type Chip, type RunCtx, OPTION_NAMES, approvedAt, chipFor, isDeferredNow } from './run';
import { BUCKET_COLOR, C, TONE, type Tone } from './theme';

export interface EventHeader {
  id: number;
  sat: string;
  obj: string;
  chip: Chip;
  pcLabel: string;
  pc: string;
  color: string;
  miss: string;
  tcaLabel: string;
  tcaTxt: string;
  msgs: string;
  status: string;
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
  pcColor: string;
  miss: string;
  tier: Tier;
  tierTone: Tone;
  tierTip: string;
  queue: string;
}

export interface CostOfWaitingView {
  path: string;
  over: string;
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
  scaleTxt: string;
  labels: PlaneLabel[];
}

export interface OptionRow {
  key: OptionKey;
  name: string;
  dir: string;
  dvTxt: string;
  pcAfter: string;
  missAfter: string;
  on: boolean;
}

export interface OptionsView {
  basis: string;
  rows: OptionRow[];
  decision: string;
  canDefer: boolean;
  approved: boolean;
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
  pcAfter: string;
  rationale: string;
  approveLabel: string;
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
  | { kind: 'event'; header: EventHeader; hist: HistoryView; planner: PlannerView | null; other: OtherView | null; msgRows: MsgRow[] };

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

export function buildHistory(e: ReplayEvent, s: KnownState, T: number): HistoryView {
  const vis = e.m.slice(0, s.k + 1);
  const xp = (hb: number) => 40 + ((168 - clamp(hb, 0, 168)) / 168) * 276;
  const yPc = (r: number) => 6 + ((-2 - clamp(r, -14, -2)) / 12) * 80;
  const maxMiss = Math.max(...vis.map((v) => v[2]));
  const yMax = clamp(Math.max(6000, maxMiss * 1.15), 6000, 40000);
  const yMs = (v: number) => 70 - (Math.min(v, yMax) / yMax) * 62;
  const pcP = vis.map((v) => [xp(e.tca - v[0]), yPc(v[1]), v[1]] as const);
  const msP = vis.map((v) => [xp(e.tca - v[0]), yMs(v[2])] as const);
  const lastTwo = vis.slice(-2);
  let trend = 'first message';
  if (lastTwo.length === 2) {
    const d = lastTwo[1][1] - lastTwo[0][1];
    trend = (d > 0.3 ? 'Pc rising' : d < -0.3 ? 'Pc falling' : 'Pc steady') + ' · miss ' + (lastTwo[1][2] < lastTwo[0][2] ? 'shrinking' : 'growing');
  }
  return {
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

function buildHeader(ctx: RunCtx, e: ReplayEvent, s: KnownState, plan: Plan | null): EventHeader {
  const resolved = s.phase === 'resolved';
  const appr = approvedAt(ctx, e.id);
  let status: string;
  if (resolved) {
    status = s.last[1] >= PC_ACTION && appr == null ? 'Passed with Pc still at or above 1e-4 and no approved burn. Flag for post-event review.' : 'Closest approach has passed.';
  } else if (appr != null) {
    status = 'Burn approved at run ' + appr + ' (simulated). Later messages are the real recorded ones, so they do not show the burn’s effect.';
  } else if (s.bucket === 'pc') {
    status = plan ? 'Pc at or above 1e-4. Choose a burn, or defer to the next screening run.' : 'Pc at or above 1e-4, but closest approach is under 3 h away. Hand over to flight dynamics.';
  } else if (s.peaked) {
    status = 'Pc reached 1e-4 earlier and has fallen back. The plan was withdrawn; watching to closest approach.';
  } else {
    status = 'Below the action threshold. Re-scored at every screening run.';
  }
  return {
    id: e.id,
    sat: e.sat,
    obj: e.obj.toLowerCase(),
    chip: chipFor(ctx, e, s),
    pcLabel: resolved ? 'Final Pc' : 'Pc',
    pc: pcTxt(s.last[1]),
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
      return { n: String(i + 1), before: dh(e.tca - v[0]), pc: pcTxt(v[1]), pcColor: BUCKET_COLOR[b] ?? C.slate, miss: mTxt(v[2]), tier: t, tierTone: TIER_TONE[t], tierTip: TIER_TIP[t], queue: QUEUE_NAME[b] };
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
    other = {
      title: 'Too close to plan',
      text: 'A burn this close to closest approach needs flight-dynamics planning outside this tool.',
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
        ? 'Tracking improved and Pc fell below 1e-4. In ESA’s training histories, 141 of 154 events that reached Pc 1e-4 fell back below it by their last message.'
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
  const w24 = waitDv(plan.c, wi + 4);
  const nowTxt = wNow != null ? wNow.toFixed(1) : 'over 80';
  const dayLater = w24 != null ? w24.toFixed(1) + ' mm/s' + (wNow ? ' (' + (w24 / wNow).toFixed(2) + '×)' : '') : 'not possible before closest approach';
  const median = facts.medianWaitRatio24h != null ? ' Across all escalations, waiting 24 h costs a median ' + facts.medianWaitRatio24h.toFixed(2) + '× the Δv.' : '';
  return {
    path,
    over,
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
    scaleTxt: mTxt(fit),
    labels: [
      { left: (b0[0] / 3).toFixed(2) + '%', top: (b0[1] / 3).toFixed(2) + '%', transform: 'translate(8px, -130%)', tone: TONE.decide, text: 'now ' + mTxt(cev.miss) },
      { left: (a1[0] / 3).toFixed(2) + '%', top: (a1[1] / 3).toFixed(2) + '%', transform: 'translate(8px, 30%)', tone: TONE.deferred, text: 'after ' + mTxt(opt.missAfter) },
    ],
  };
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

export function buildGateChecks(plan: Plan, opt: CoaOption, budget: number): GateCheck[] {
  const cev = plan.c;
  const wNow = waitDv(cev, windowIndex(cev, plan.age));
  return [
    { ok: opt.pcAfter < 1e-4, title: 'Pc after burn below 1e-4.', detail: sci(opt.pcAfter) + '.' },
    { ok: opt.missAfter > 1000, title: 'Miss after burn above 1 km.', detail: mTxt(opt.missAfter) + '.' },
    {
      ok: cev.pcModelOk,
      title: cev.pcModelOk ? 'Model reproduces ESA’s Pc for this message.' : 'Model calibrated to ESA’s Pc.',
      detail: cev.pcModelOk ? 'Within 0.1 orders of magnitude.' : 'Effective radius ' + cev.hbrEff.toFixed(1) + ' m.',
    },
    { ok: opt.dv <= budget, title: opt.dv <= budget ? 'Within the Δv budget.' : 'Above the Δv budget.', detail: opt.dv.toFixed(1) + ' of ' + budget + ' mm/s.' },
    {
      ok: plan.age < 6 || (wNow != null && wNow <= budget),
      title: 'Plan computed ' + Math.round(plan.age) + ' h ago.',
      detail: 'Best burn in the current window: ' + (wNow != null ? wNow.toFixed(1) + ' mm/s.' : 'over 80 mm/s.'),
    },
    { ok: false, title: 'Not verified here:', detail: 'burn execution error, drag and J2, and re-screening the new orbit against the catalogue.' },
  ];
}

function buildModal(ctx: RunCtx, e: ReplayEvent, plan: Plan, opt: CoaOption): ModalView {
  const cev = plan.c;
  const approved = approvedAt(ctx, e.id) != null;
  const obj = e.obj.toLowerCase();
  const aheadTxt = opt.dT >= 0 ? 'arrive about ' + (opt.dT / 1000).toFixed(1) + ' km earlier along the track' : 'arrive about ' + (-opt.dT / 1000).toFixed(1) + ' km later along the track';
  return {
    id: e.id,
    sat: e.sat,
    obj,
    optName: OPTION_NAMES[opt.key],
    approved,
    status: approved ? 'Approved · queued for upload' : 'Awaiting approval',
    when: 'Message ' + (plan.key + 1) + (opt.key === 'coa3' ? ' + 24 h, ' : ' time, ') + Math.round(opt.leadH) + ' h before closest approach',
    dv: opt.dv.toFixed(1) + ' mm/s',
    dirLong: dirLong(opt.alpha),
    beta: opt.beta,
    burn: 'about ' + Math.max(1, Math.round(opt.burnS)) + ' s at 1 N',
    prop: 'about ' + opt.propG.toFixed(1) + ' g',
    dA: 'semi-major axis ' + (opt.dA >= 0 ? '+' : '') + opt.dA.toFixed(1) + ' m',
    missNow: mTxt(cev.miss),
    missAfter: mTxt(opt.missAfter),
    pcNow: pcTxt(cev.risk),
    pcAfter: sci(opt.pcAfter),
    rationale:
      'The ' + (obj === 'unknown' ? 'unidentified object' : obj) + ' passes ' + mTxt(cev.miss) + ' away at ' + cev.relSpeed.toFixed(1) + ' km/s on a ' + Math.round(cev.crossDeg) +
      '° crossing. This ' + dirShort(opt.alpha).toLowerCase() + ' burn makes us ' + aheadTxt + ' by closest approach, which opens the encounter-plane miss to ' + mTxt(opt.missAfter) +
      ' and cuts Pc to ' + sci(opt.pcAfter) + '.',
    approveLabel: approved ? 'Approved' : 'Approve and queue upload',
    att: buildAttitude(opt.alpha),
    checks: buildGateChecks(plan, opt, ctx.budget),
  };
}

/** The feasible option the operator picked, else the first feasible one. */
export function pickOption(plan: Plan | null, key: OptionKey): CoaOption | null {
  if (!plan) return null;
  const feasible = plan.c.opts.filter((o) => o.feasible);
  return feasible.find((o) => o.key === key) ?? feasible[0] ?? null;
}

export function buildWorkspace(ctx: RunCtx, e: ReplayEvent | null, optKey: OptionKey, facts: WorkspaceFacts): WorkspaceView {
  if (!e) return { kind: 'empty', text: 'Select an event from the queue, the timeline or the run digest.' };
  const st = stateAt(e, ctx.T, ctx.replay.runH);
  if (!isKnown(st)) return { kind: 'empty', text: 'Event #' + e.id + ' has not been reported yet. Its first message arrives in ' + dh(e.m[0][0] - ctx.T) + '.' };
  const plan = planOf(e, st, ctx.T, ctx.budget);
  const opt = pickOption(plan, optKey);
  const header = buildHeader(ctx, e, st, plan);
  const hist = buildHistory(e, st, ctx.T);
  if (plan && opt) {
    const appr = approvedAt(ctx, e.id);
    const optsAll = plan.c.opts.filter((o) => o.feasible);
    const opts: OptionsView = {
      basis: 'planned at message ' + (plan.key + 1) + ', ' + Math.round(plan.age) + ' h ago',
      rows: optsAll.map((o) => ({
        key: o.key,
        name: OPTION_NAMES[o.key],
        dir: dirShort(o.alpha),
        dvTxt: o.dv.toFixed(1) + ' mm/s',
        pcAfter: sci(o.pcAfter),
        missAfter: mTxt(o.missAfter),
        on: o.key === opt.key,
      })),
      decision: appr != null ? 'Approved at run ' + appr + '.' : isDeferredNow(ctx, e.id) ? 'Deferred at this run; re-check after the next message.' : 'Not decided.',
      canDefer: appr == null,
      approved: appr != null,
      reviewLabel: appr != null ? 'View approved plan' : 'Review and approve',
    };
    const planner: PlannerView = { plan, opt, wc: buildCostOfWaiting(ctx, plan, facts), bp: buildEncounterPlane(plan, opt), opts, modal: buildModal(ctx, e, plan, opt) };
    return { kind: 'event', header, hist, planner, other: null, msgRows: [] };
  }
  const { other, msgRows } = buildOther(ctx, e, st);
  return { kind: 'event', header, hist, planner: null, other, msgRows };
}
