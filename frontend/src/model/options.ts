// Burn options for a plan: the planner's options, plus "Burn this window" once the options planned for the message's own
// window have passed. That option has only a Δv: the cost-of-waiting envelope (physics.wait_envelope) gives the lowest Δv
// that meets Pc < 1e-4 and a miss over 1 km for a burn anywhere in the 6 h window. It has no burn vector, so nothing may
// invent one: direction, Pc after and miss after are shown as targets, not computed values.

import type { CoaOption, OptionKey, ReplayEvent } from '../data/types';
import { mTxt, sci } from './format';
import { type Plan, PC_ACTION, burnAt, burnPassed, waitDv } from './replay';
import { orderedFeasible } from './run';

/** Cost-of-waiting window length, hours. */
export const WINDOW_H = 6;

export interface WindowOption {
  key: 'win';
  /** Marks this option apart from the planner's: there is no burn vector. */
  window: true;
  feasible: true;
  dv: number;
  /** Hours before closest approach at the window start, so burnAt gives the window start. */
  leadH: number;
  /** Window index from the planning message, and its start and end in replay hours. */
  wi: number;
  start: number;
  end: number;
}

export type PlanOption = CoaOption | WindowOption;
export type PlanKey = OptionKey | 'win';
/** The option choice kept in the UI: a key, or the recommended option. */
export type OptChoice = PlanKey | 'rec';

export const isWindow = (o: PlanOption): o is WindowOption => 'window' in o;

export const OPTION_NAMES: Record<PlanKey, string> = { coa4: 'Robust', coa1: 'Minimum Δv', coa2: 'More margin', coa3: 'Wait 24 h', win: 'Burn this window' };
/** Short names for the Next decision banner. */
export const OPTION_SHORT: Record<PlanKey, string> = { coa4: 'robust', coa1: 'minimum Δv', coa2: 'more margin', coa3: 'wait 24 h', win: 'this window' };
export const DEFAULT_OPTION: OptChoice = 'rec';

/**
 * The window option at window index wi (default: the window holding now), or null when that window needs over 80 mm/s or
 * lies past the cost-of-waiting data (closest approach under 3 h away).
 */
export function windowOption(e: ReplayEvent, plan: Plan, wi = Math.floor(Math.max(0, plan.age) / WINDOW_H)): WindowOption | null {
  const dv = waitDv(plan.c, wi);
  if (dv == null) return null;
  const start = plan.msgT + wi * WINDOW_H;
  return { key: 'win', window: true, feasible: true, dv, leadH: e.tca - start, wi, start, end: start + WINDOW_H };
}

/** The list with the window option placed after Robust, the position it always takes in the table. */
export function withWindow(list: PlanOption[], win: WindowOption): PlanOption[] {
  const rest = list.filter((o) => !isWindow(o));
  const i = rest.findIndex((o) => o.key !== 'coa4');
  return [...rest.slice(0, i < 0 ? rest.length : i), win, ...rest.slice(i < 0 ? rest.length : i)];
}

/**
 * Feasible options in display order. "Burn this window" follows Robust whenever its Δv is below every option still ahead,
 * which includes the case where every option planned at the message has passed.
 */
export function planOptions(e: ReplayEvent, plan: Plan): PlanOption[] {
  const feasible: PlanOption[] = orderedFeasible(plan.c.opts);
  const win = windowOption(e, plan);
  if (!win) return feasible;
  const ahead = feasible.filter((o) => !burnPassed(e, plan, o));
  return ahead.every((o) => win.dv < o.dv) ? withWindow(feasible, win) : feasible;
}

/** The option meets both targets: Pc after below 1e-4 and the miss after over 1 km. The window option meets them by construction. */
export const meetsTargets = (o: PlanOption) => isWindow(o) || (o.pcAfter < Math.pow(10, PC_ACTION) && o.missAfter > 1000);

/** The target an option misses, in words, or null when it meets both. */
export function missedTarget(o: PlanOption): string | null {
  if (isWindow(o) || meetsTargets(o)) return null;
  if (!(o.pcAfter < Math.pow(10, PC_ACTION))) return 'misses the Pc target (' + sci(o.pcAfter) + ' is not below 1e-4)';
  return 'misses the miss target (' + mTxt(o.missAfter) + ' is not above 1 km)';
}

/**
 * The first option still ahead that meets both targets and fits the budget, in the order Robust, this window, then the
 * others. When none fits the budget, the cheapest option still ahead that meets both targets.
 */
export function recommended(e: ReplayEvent, plan: Plan, budget: number): PlanOption | null {
  const ok = planOptions(e, plan).filter((o) => !burnPassed(e, plan, o) && meetsTargets(o));
  return ok.find((o) => o.dv <= budget) ?? [...ok].sort((a, b) => a.dv - b.dv)[0] ?? null;
}

/**
 * The option the operator picked if it is still ahead, else the recommended one. Options whose burn time has passed are
 * skipped while another is still ahead.
 */
export function pickOption(plan: Plan | null, choice: OptChoice, e: ReplayEvent, budget: number): PlanOption | null {
  if (!plan) return null;
  const all = planOptions(e, plan);
  const live = all.filter((o) => !burnPassed(e, plan, o));
  const rec = recommended(e, plan, budget);
  const picked = choice === 'rec' ? undefined : live.find((o) => o.key === choice);
  return picked ?? rec ?? live[0] ?? all.find((o) => o.key === choice) ?? all[0] ?? null;
}

/**
 * When an approved burn happens, in replay hours: a window burn from the later of its window start and the approval
 * time, since it cannot happen before it was approved; any other option at its planned burn time.
 */
export const approvedStart = (e: ReplayEvent, o: PlanOption, approvedAtH: number) => (isWindow(o) ? Math.max(o.start, approvedAtH) : burnAt(e, o));

/** The option an approval recorded, rebuilt from the plan it was approved on. */
export function approvedOption(e: ReplayEvent, plan: Plan, stored: { opt: PlanKey; wi?: number }): PlanOption | null {
  if (stored.opt === 'win') return stored.wi != null ? windowOption(e, plan, stored.wi) : null;
  return orderedFeasible(plan.c.opts).find((o) => o.key === stored.opt) ?? null;
}
