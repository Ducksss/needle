// One screening run: which events are open, to decide, on watch or passed, and the chip each one shows.

import type { OptionKey, Replay, ReplayEvent } from '../data/types';
import { type EventState, type KnownState, type Plan, PC_ACTION, isKnown, planOf, stateAt } from './replay';
import { TONE, type Tone } from './theme';

export interface LogEntry {
  /** 1-based run the decision was made at. */
  run: number;
  text: string;
}

/** Operator decisions in this replay. Runs are 1-based, as shown in the UI. */
export interface Decisions {
  approved: Record<number, number>;
  approvedTxt: Record<number, string>;
  /** The plan (CDM index) and option each approval was made on, so later plans cannot change an approved burn. */
  approvedPlan: Record<number, { key: number; opt: OptionKey }>;
  deferred: Record<number, number>;
  log: LogEntry[];
}

export const NO_DECISIONS: Decisions = { approved: {}, approvedTxt: {}, approvedPlan: {}, deferred: {}, log: [] };

export interface RunCtx {
  replay: Replay;
  /** 0-based screening run. */
  run: number;
  /** Replay time of this run, hours. */
  T: number;
  budget: number;
  dec: Decisions;
}

export function runCtx(replay: Replay, run: number, budget: number, dec: Decisions): RunCtx {
  return { replay, run, T: run * replay.runH, budget, dec };
}

/** Run (1-based) a burn was approved at, if that is at or before the given 1-based run. */
export function approvedBy(dec: Decisions, id: number, run1: number): number | null {
  const a = dec.approved[id];
  return a != null && a <= run1 ? a : null;
}

/** Approval visible at the current run. Stepping back before an approval hides it again. */
export const approvedAt = (ctx: RunCtx, id: number) => approvedBy(ctx.dec, id, ctx.run + 1);

export const isDeferredNow = (ctx: RunCtx, id: number) => ctx.dec.deferred[id] === ctx.run + 1;

export interface Row {
  e: ReplayEvent;
  /** State at this run. */
  s: EventState;
  /** State at the previous run. */
  p: EventState;
}

export interface KnownRow extends Row {
  s: KnownState;
}

export interface NeedRow extends KnownRow {
  plan: Plan | null;
}

export interface Snapshot {
  rows: Row[];
  open: KnownRow[];
  /** Decide queue, soonest deadline first; events without a plan go last. */
  needs: NeedRow[];
  /** Watch queue, highest Pc first. */
  watching: KnownRow[];
  quiet: number;
  /** Passed queue, most recent first. */
  passed: KnownRow[];
  openPrev: number;
  needsPrev: number;
  approvedN: number;
}

const known = (r: Row): r is KnownRow => isKnown(r.s);

export function snapshot(ctx: RunCtx): Snapshot {
  const { replay, T, run, budget, dec } = ctx;
  const runH = replay.runH;
  const rows: Row[] = replay.events.map((e) => ({ e, s: stateAt(e, T, runH), p: stateAt(e, T - runH, runH) }));
  const open = rows.filter(known).filter((r) => r.s.phase === 'open');
  const appr = (r: Row, run1: number) => approvedBy(dec, r.e.id, run1) != null;
  const needs = open
    .filter((r) => r.s.bucket === 'pc' && !appr(r, run + 1))
    .map((r): NeedRow => ({ ...r, plan: planOf(r.e, r.s, T, budget) }))
    .sort((a, b) => (a.plan ? a.plan.left : 1e9) - (b.plan ? b.plan.left : 1e9));
  const watching = open
    .filter((r) => (r.s.bucket !== 'pc' && (r.s.bucket !== 'quiet' || r.s.peaked)) || appr(r, run + 1))
    .sort((a, b) => b.s.last[1] - a.s.last[1]);
  const passed = rows
    .filter(known)
    .filter((r) => r.s.phase === 'resolved' && r.e.tca >= 0)
    .sort((a, b) => b.e.tca - a.e.tca);
  const openPrev = rows.filter((r) => r.p.phase === 'open').length;
  const needsPrev = rows.filter((r) => isKnown(r.p) && r.p.phase === 'open' && r.p.bucket === 'pc' && !appr(r, run)).length;
  const approvedN = Object.keys(dec.approved).filter((id) => approvedBy(dec, Number(id), run + 1) != null).length;
  return { rows, open, needs, watching, quiet: open.length - needs.length - watching.length, passed, openPrev, needsPrev, approvedN };
}

export type ChipLabel =
  | 'DECIDE'
  | 'DEFERRED'
  | 'APPROVED'
  | 'DOWNGRADED'
  | 'NEW'
  | 'WATCH'
  | 'PASSED'
  | 'PASSED · BURN'
  | 'PASSED · UNMITIGATED'
  | 'QUIET';

export interface Chip {
  label: ChipLabel;
  tone: Tone;
  tip: string;
}

export const CHIP_TIP: Record<ChipLabel, string> = {
  DECIDE: 'Latest Pc is at or above 1e-4, the action threshold. A burn decision is due before the deadline.',
  DEFERRED: 'The operator deferred the decision at this run. It returns to Decide at the next run.',
  APPROVED: 'A burn was approved (simulated). Watching until closest approach.',
  DOWNGRADED: 'Pc reached 1e-4 earlier, then fell back below it. The plan was withdrawn; still watching.',
  NEW: 'First message arrived in the last screening run. Below the action threshold.',
  WATCH: 'Below the action threshold, but Pc is at least 1e-6 or the miss is under 5 km. Re-scored every run.',
  PASSED: 'Closest approach has passed with Pc below 1e-4.',
  'PASSED · BURN': 'Closest approach has passed. A burn was approved for it.',
  'PASSED · UNMITIGATED': 'Closest approach passed with Pc still at or above 1e-4 and no approved burn. Flag for review.',
  QUIET: 'Below every watch rule: Pc under 1e-6 and miss over 5 km. Not listed in the queue; re-scored every run.',
};

const chip = (label: ChipLabel, tone: Tone): Chip => ({ label, tone, tip: CHIP_TIP[label] });

/** The status chip for an event, as shown in the queue, workspace and timeline. */
export function chipFor(ctx: RunCtx, e: ReplayEvent, s: KnownState): Chip {
  const appr = approvedAt(ctx, e.id) != null;
  if (s.phase === 'resolved') {
    if (appr) return chip('PASSED · BURN', TONE.approved);
    if (s.last[1] >= PC_ACTION) return chip('PASSED · UNMITIGATED', TONE.unmitigated);
    return chip('PASSED', TONE.passed);
  }
  if (appr) return chip('APPROVED', TONE.approved);
  if (s.bucket === 'pc') return isDeferredNow(ctx, e.id) ? chip('DEFERRED', TONE.deferred) : chip('DECIDE', TONE.decide);
  if (s.peaked) return chip('DOWNGRADED', TONE.downgraded);
  if (s.isNew) return chip('NEW', TONE.fresh);
  return chip('WATCH', TONE.watch);
}

/** Queue membership of an open or passed event: Decide, Watch, Passed, or Quiet when no queue lists it. */
export type QueueName = 'Decide' | 'Watch' | 'Passed' | 'Quiet';

export function queueOf(ctx: RunCtx, e: ReplayEvent, s: KnownState): QueueName {
  if (s.phase === 'resolved') return 'Passed';
  const appr = approvedAt(ctx, e.id) != null;
  if (s.bucket === 'pc' && !appr) return 'Decide';
  if ((s.bucket !== 'pc' && (s.bucket !== 'quiet' || s.peaked)) || appr) return 'Watch';
  return 'Quiet';
}

/** Chip for the queue state column: the event's chip, or QUIET when no queue lists it. */
export function queueChip(ctx: RunCtx, e: ReplayEvent, s: KnownState): Chip {
  return queueOf(ctx, e, s) === 'Quiet' ? chip('QUIET', TONE.passed) : chipFor(ctx, e, s);
}

/**
 * Events whose chip changed since the previous run, including events first reported or passed at this run.
 * Drives the short highlight during playback.
 */
export function changedSincePrev(ctx: RunCtx, snap: Snapshot): Set<number> {
  const out = new Set<number>();
  if (ctx.run === 0) return out;
  const prev: RunCtx = { ...ctx, run: ctx.run - 1, T: ctx.T - ctx.replay.runH };
  for (const r of snap.rows) {
    if (!isKnown(r.s)) continue;
    if (!isKnown(r.p) || chipFor(prev, r.e, r.p).label !== chipFor(ctx, r.e, r.s).label) out.add(r.e.id);
  }
  return out;
}

export const OPTION_NAMES: Record<OptionKey, string> = { coa4: 'Recommended (robust)', coa1: 'Minimum Δv', coa2: 'More margin', coa3: 'Wait 24 h' };

/** Display and default order: the robust option first when the planner produced one. */
export const OPTION_ORDER: OptionKey[] = ['coa4', 'coa1', 'coa2', 'coa3'];
export const DEFAULT_OPTION: OptionKey = 'coa4';

/** Feasible options in display order. */
export function orderedFeasible<T extends { key: OptionKey; feasible: boolean }>(opts: T[]): T[] {
  return opts.filter((o) => o.feasible).sort((a, b) => OPTION_ORDER.indexOf(a.key) - OPTION_ORDER.indexOf(b.key));
}
