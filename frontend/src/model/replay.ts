// Event state at a replay time, Needle buckets, brief tiers and burn plans.

import type { Cdm, Coa, CoaOption, ReplayEvent, Rtn } from '../data/types';

/** Action threshold: Pc 1e-4, as log10. */
export const PC_ACTION = -4;
/** Watch threshold: Pc 1e-6, as log10. */
export const PC_WATCH = -6;

export type Bucket = 'pc' | 'hidden' | 'distance' | 'elevated' | 'quiet';

/**
 * Needle's bucket for one CDM. pc: Pc >= 1e-4. hidden: Pc >= 1e-6 but miss > 5 km.
 * distance: miss < 1 km and Pc < 1e-4. elevated: any other watch rule. quiet: none.
 */
export function bucketOf(m: Cdm): Bucket {
  const [, risk, miss] = m;
  if (risk >= PC_ACTION) return 'pc';
  if (miss > 5000 && risk >= PC_WATCH) return 'hidden';
  if (miss < 1000) return 'distance';
  if (risk >= PC_WATCH || miss <= 5000) return 'elevated';
  return 'quiet';
}

export type Tier = 'CRITICAL' | 'ELEVATED' | 'SAFE';

/** The brief's tier for one CDM. */
export function tierOf(m: Cdm): Tier {
  const [, risk, miss] = m;
  if (risk >= PC_ACTION || miss < 1000) return 'CRITICAL';
  if (risk >= PC_WATCH || miss <= 5000) return 'ELEVATED';
  return 'SAFE';
}

export const TIER_TIP: Record<Tier, string> = {
  CRITICAL: 'Brief rule: Critical when Pc is at least 1e-4 or the miss is under 1 km.',
  ELEVATED: 'Brief rule: Elevated when Pc is 1e-6 to 1e-4, or the miss is 1 to 5 km.',
  SAFE: 'Brief rule: Safe when Pc is below 1e-6 and the miss is over 5 km.',
};

export interface KnownState {
  phase: 'open' | 'resolved';
  /** Index of the latest CDM received by this time. */
  k: number;
  last: Cdm;
  bucket: Bucket;
  /** Some CDM so far reached Pc >= 1e-4. */
  peaked: boolean;
  /** First CDM arrived within the last screening run. */
  isNew: boolean;
}

export type EventState = { phase: 'future' } | KnownState;

export const isKnown = (s: EventState): s is KnownState => s.phase !== 'future';

/** What the console knows about an event at replay time t (hours). */
export function stateAt(e: ReplayEvent, t: number, runH: number): EventState {
  let k = -1;
  for (let i = 0; i < e.m.length; i++) if (e.m[i][0] <= t) k = i;
  if (k < 0) return { phase: 'future' };
  const last = e.m[k];
  return {
    phase: e.tca <= t ? 'resolved' : 'open',
    k,
    last,
    bucket: bucketOf(last),
    peaked: e.m.slice(0, k + 1).some((m) => m[1] >= PC_ACTION),
    isNew: e.m[0][0] > t - runH,
  };
}

export interface Plan {
  /** CDM index the plan was computed at. */
  key: number;
  c: Coa;
  /** Arrival time of that CDM. */
  msgT: number;
  /** Hours since that CDM. */
  age: number;
  /** Decision deadline: the start of the first 6 h window whose lowest Δv exceeds the budget, else TCA − 3 h. */
  dlAbs: number;
  /** Hours from now to the deadline. */
  left: number;
  /** The deadline has already passed. */
  overNow: boolean;
}

/** Burns are planned up to this many hours before closest approach; after that, flight dynamics takes over. */
export const PLAN_CUTOFF_H = 3;

/**
 * The latest burn plan for an open Decide event at time T. Null when there is none, or when closest approach is under
 * 3 h away, so nothing can be approved past the planner's own window.
 */
export function planOf(e: ReplayEvent, s: EventState, T: number, budget: number): Plan | null {
  if (s.phase !== 'open' || s.bucket !== 'pc') return null;
  if (T >= e.tca - PLAN_CUTOFF_H) return null;
  const ks = Object.keys(e.coa).map(Number).filter((k) => k <= s.k);
  if (!ks.length) return null;
  return planAt(e, Math.max(...ks), T, budget);
}

/** The plan computed at CDM index key, seen at time T. */
export function planAt(e: ReplayEvent, key: number, T: number, budget: number): Plan {
  const c = e.coa[String(key)];
  const msgT = e.m[key][0];
  const age = T - msgT;
  let firstOver: number | null = null;
  // Scan from the window holding now: a window that has already gone by cannot set a deadline still to come.
  const nowStart = Math.floor(Math.max(0, age) / 6) * 6;
  for (const [h, dv] of c.wait) {
    if (h < nowStart) continue;
    if (dv == null || dv > budget) {
      firstOver = h;
      break;
    }
  }
  const endRel = e.tca - msgT - PLAN_CUTOFF_H;
  const dlRel = firstOver == null ? endRel : firstOver;
  return { key, c, msgT, age, dlAbs: msgT + dlRel, left: msgT + dlRel - T, overNow: dlRel <= age };
}

const isRtn = (v: unknown): v is Rtn => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Relative position for message i, or null when replay.json does not carry it. */
export function rtnAt(e: ReplayEvent, i: number): Rtn | null {
  const v = e.rtn?.[i];
  return isRtn(v) ? v : null;
}

/** Replay hour of an option's burn: its lead time before closest approach. */
export const burnAt = (e: ReplayEvent, o: CoaOption) => e.tca - o.leadH;

/**
 * The option's burn window has gone by: the 6 h window that holds now is later than the one the plan put the burn in.
 * Its Δv is stale; the current window may need more.
 */
export function burnPassed(e: ReplayEvent, plan: Plan, o: CoaOption): boolean {
  const planned = Math.round((burnAt(e, o) - plan.msgT) / 6);
  return Math.floor(plan.age / 6) > planned;
}

/** Index of the 6 h cost-of-waiting window that contains the current time. */
export const windowIndex = (c: Coa, age: number) => Math.min(c.wait.length - 1, Math.floor(age / 6));

/** Lowest Δv in the window at index i, or null when that window needs over 80 mm/s or does not exist. */
export const waitDv = (c: Coa, i: number): number | null => (c.wait[i] ? c.wait[i][1] : null);

/**
 * The run to open on: the first replay event whose final Pc is at or above 1e-4 and that has a plan,
 * at the run when its first plan arrives. Falls back to run 13 with nothing selected.
 */
export function initialSelection(events: ReplayEvent[], runH: number, runs: number): { run: number; sel: number | null } {
  const firstHi = events.find((e) => e.m[e.m.length - 1][1] >= PC_ACTION && Object.keys(e.coa).length);
  if (!firstHi) return { run: Math.min(runs - 1, 12), sel: null };
  const k0 = Math.min(...Object.keys(firstHi.coa).map(Number));
  return { run: Math.min(runs - 1, Math.max(0, Math.ceil(firstHi.m[k0][0] / runH))), sel: firstHi.id };
}
