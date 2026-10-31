// Time-lapse between two screening runs: how much replay time passed, which events were first reported, and which
// passed closest approach. Drives the fast-forward animation; the data on screen always shows the target run.

import { PC_ACTION, isKnown, stateAt } from './replay';
import { type RunCtx, approvedAt } from './run';

/** Length of every fast-forward animation, ms. It must fit inside the 1.2 s Play step. */
export const LAPSE_MS = 700;
/** At most this many arrival bursts and pass fades per jump, so a long slider jump stays readable. */
export const LAPSE_EFFECTS_MAX = 40;

export interface LapseEvent {
  id: number;
  /** Passed with Pc still at or above 1e-4 and no approved burn. */
  unmitigated: boolean;
}

export interface Lapse {
  /** Changes whenever the target run changes, so a repeated selection does not replay the effects. */
  key: string;
  /** Replay hours from the previous target to this one; negative when stepping back. */
  dH: number;
  /** Events whose first message arrived in the skipped window and that are still open. */
  arrived: LapseEvent[];
  /** Events that passed closest approach in the skipped window. */
  passed: LapseEvent[];
  /** "+8 h", "+3 d 4 h", "−16 h"; empty when nothing changed. */
  label: string;
}

/** Signed span as a short label: "+8 h", "+3 d 4 h", "−1 d", "0 h". */
export function spanTxt(dH: number): string {
  const sign = dH > 0 ? '+' : dH < 0 ? '−' : '';
  const a = Math.round(Math.abs(dH));
  const d = Math.floor(a / 24);
  const h = a % 24;
  return sign + (d ? d + ' d' + (h ? ' ' + h + ' h' : '') : h + ' h');
}

/** The ease used by every part of the time-lapse. */
export const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

/**
 * The visible part of a long spin: it ends at the same angle as the full turn (mod 2π) but turns at most capTurns
 * times plus the remainder, so a jump of days does not blur.
 */
export function visibleTurn(totalRad: number, capTurns = 1): number {
  const full = 2 * Math.PI;
  const a = Math.abs(totalRad);
  const rem = a % full;
  const turns = Math.min(Math.floor(a / full), capTurns);
  return Math.sign(totalRad) * (rem + turns * full);
}

export function lapseBetween(ctx: RunCtx, fromRun: number): Lapse {
  const { replay, run } = ctx;
  const runH = replay.runH;
  const T0 = fromRun * runH;
  const T1 = run * runH;
  const arrived: LapseEvent[] = [];
  const passed: LapseEvent[] = [];
  if (T1 > T0) {
    for (const e of replay.events) {
      const first = e.m[0][0];
      if (first > T0 && first <= T1 && e.tca > T1) arrived.push({ id: e.id, unmitigated: false });
      // Includes events first reported inside the window too, so one that escalated and passed unseen still flashes.
      if (e.tca > T0 && e.tca <= T1) {
        const s = stateAt(e, T1, runH);
        const unmitigated = isKnown(s) && s.last[1] >= PC_ACTION && approvedAt(ctx, e.id) == null;
        passed.push({ id: e.id, unmitigated });
      }
    }
  }
  const dH = T1 - T0;
  return {
    key: fromRun + '>' + run,
    dH,
    arrived: arrived.slice(-LAPSE_EFFECTS_MAX),
    passed: passed.slice(-LAPSE_EFFECTS_MAX),
    label: dH ? spanTxt(dH) : '',
  };
}
