// Header KPIs and the Next decision strip.

import { at, dh, pcWithOdds, sgn } from './format';
import { PLAN_CUTOFF_H, burnPassed, waitDv, windowIndex } from './replay';
import { type NeedRow, type RunCtx, type Snapshot, isDeferredNow, orderedFeasible } from './run';
import { C } from './theme';

export interface Kpi {
  label: string;
  v: string;
  color: string;
  d: string;
  dColor: string;
  tip: string;
}

export function buildKpis(snap: Snapshot, run = 1): Kpi[] {
  const { open, needs, passed, openPrev, needsPrev, approvedN } = snap;
  // Run 1 has no earlier run to compare with.
  const first = run === 0;
  return [
    {
      label: 'Open',
      v: String(open.length),
      color: C.ink,
      d: first ? '' : sgn(open.length - openPrev),
      dColor: C.muted,
      tip: 'Events with at least one message whose closest approach is still ahead. The small number is the change since the last run.',
    },
    {
      label: 'To decide',
      v: String(needs.length),
      color: C.risk,
      d: first ? '' : sgn(needs.length - needsPrev),
      dColor: !first && needs.length > needsPrev ? C.risk : C.muted,
      tip: 'Open events whose latest Pc is at or above 1e-4 and that have no approved burn.',
    },
    { label: 'Passed', v: String(passed.length), color: C.slate, d: '', dColor: C.muted, tip: 'Events whose closest approach has passed during the replay.' },
    {
      label: 'Approved',
      v: String(approvedN),
      color: C.ok,
      d: '',
      dColor: C.muted,
      tip: 'Burns approved in this replay. Nothing is uploaded; later messages do not include the burn.',
    },
  ];
}

export type NextTone = 'decide' | 'clear' | 'neutral';

export interface NextDecision {
  tone: NextTone;
  label: string;
  text: string;
  /** Event to open, when a decision is due. */
  eventId: number | null;
  /** That event is already open in the workspace. */
  showing: boolean;
}

/**
 * The most urgent Decide event that is not deferred at this run: soonest deadline first, then events with no plan.
 * A missing plan means "under 3 h" only when closest approach really is under 3 h away.
 */
export function buildNext(snap: Snapshot, budget: number, sel: number | null = null, ctx?: RunCtx): NextDecision {
  const ready = ctx ? snap.needs.filter((x) => !isDeferredNow(ctx, x.e.id)) : snap.needs;
  const urgent: NeedRow | undefined = ready.find((x) => x.plan);
  const head = (x: NeedRow) => '#' + x.e.id + ' · ' + x.e.sat + ' vs ' + x.e.obj.toLowerCase() + ' · Pc ' + pcWithOdds(x.s.last[1]) + '. ';
  if (!urgent || !urgent.plan) {
    const first = ready[0];
    if (first) {
      const late = ctx ? first.e.tca - ctx.T < PLAN_CUTOFF_H : true;
      return {
        tone: 'decide',
        label: 'Next decision',
        text:
          head(first) +
          (late
            ? 'Closest approach is under 3 h away and there is no burn plan: hand over to flight dynamics.'
            : 'No burn plan for this message (the planner did not run). Re-check at the next message.'),
        eventId: first.e.id,
        showing: sel === first.e.id,
      };
    }
    if (snap.needs.length) {
      const n = snap.needs.length;
      return { tone: 'neutral', label: 'All deferred', text: (n === 1 ? 'The one Decide event is' : 'All ' + n + ' Decide events are') + ' deferred to the next run.', eventId: null, showing: false };
    }
    return { tone: 'clear', label: 'No decision due', text: snap.open.length + ' events open; none needs a decision at this run.', eventId: null, showing: false };
  }
  const { e, plan } = urgent;
  const w0 = waitDv(plan.c, windowIndex(plan.c, plan.age));
  const nowTxt = w0 != null ? w0.toFixed(1) + ' mm/s' : 'over 80 mm/s';
  // Recommend only an option whose burn time is still ahead.
  const rec = orderedFeasible(plan.c.opts).find((o) => !burnPassed(e, plan, o));
  const burn = rec
    ? 'Recommended burn: ' + rec.dv.toFixed(1) + ' mm/s (' + (rec.key === 'coa4' ? 'robust' : rec.key === 'coa1' ? 'minimum Δv' : rec.key === 'coa3' ? 'wait 24 h' : 'more margin') + ').'
    : 'The planned burn times have passed; the current window needs ' + nowTxt + '. Re-plan at the next message.';
  const tail = plan.overNow
    ? 'Already above the ' + budget + ' mm/s budget: decide now or accept a larger burn.'
    : 'Decide within ' + dh(plan.left) + ' (by ' + at(plan.dlAbs) + ') to stay inside the ' + budget + ' mm/s budget. ' + burn;
  return { tone: 'decide', label: 'Next decision', text: head(urgent) + tail, eventId: e.id, showing: sel === e.id };
}
