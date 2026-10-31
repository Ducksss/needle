// Header KPIs and the Next decision strip.

import { at, dh, pcWithOdds, sgn } from './format';
import { waitDv, windowIndex } from './replay';
import type { NeedRow, Snapshot } from './run';
import { C } from './theme';

export interface Kpi {
  label: string;
  v: string;
  color: string;
  d: string;
  dColor: string;
  tip: string;
}

export function buildKpis(snap: Snapshot): Kpi[] {
  const { open, needs, passed, openPrev, needsPrev, approvedN } = snap;
  return [
    {
      label: 'Open',
      v: String(open.length),
      color: C.ink,
      d: sgn(open.length - openPrev),
      dColor: C.muted,
      tip: 'Events with at least one message whose closest approach is still ahead. The small number is the change since the last run.',
    },
    {
      label: 'To decide',
      v: String(needs.length),
      color: C.risk,
      d: sgn(needs.length - needsPrev),
      dColor: needs.length > needsPrev ? C.risk : C.muted,
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

/** The most urgent Decide event with a plan, or a calm message when none is due. */
export function buildNext(snap: Snapshot, budget: number, sel: number | null = null): NextDecision {
  const urgent: NeedRow | undefined = snap.needs.find((x) => x.plan);
  if (!urgent || !urgent.plan) {
    return { tone: 'clear', label: 'No decision due', text: snap.open.length + ' events open; none needs a decision at this run.', eventId: null, showing: false };
  }
  const { e, s, plan } = urgent;
  const w0 = waitDv(plan.c, windowIndex(plan.c, plan.age));
  const head = '#' + e.id + ' · ' + e.sat + ' vs ' + e.obj.toLowerCase() + ' · Pc ' + pcWithOdds(s.last[1]) + '. ';
  const tail = plan.overNow
    ? 'Already above the ' + budget + ' mm/s budget: decide now or accept a larger burn.'
    : 'Decide within ' + dh(plan.left) + ' (by ' + at(plan.dlAbs) + ') to stay inside the ' + budget + ' mm/s budget. Lowest burn now: ' + (w0 != null ? w0.toFixed(1) + ' mm/s.' : 'above 80 mm/s.');
  return { tone: 'decide', label: 'Next decision', text: head + tail, eventId: e.id, showing: sel === e.id };
}
