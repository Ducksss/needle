// Queue panel: Decide, Watch and Passed tabs.

import { clamp, dh, mTxt, pcOdds, pcTxt } from './format';
import { PC_ACTION } from './replay';
import { type Chip, type KnownRow, type NeedRow, type RunCtx, type Snapshot, chipFor } from './run';
import { BUCKET_COLOR, C } from './theme';

export type QueueTab = 'needs' | 'watch' | 'passed';

export interface QueueTabView {
  key: QueueTab;
  label: string;
  count: number;
  on: boolean;
}

export type Urgency = 'calm' | 'soon' | 'over';

export interface QueueRow {
  id: number;
  sat: string;
  obj: string;
  /** Null for DECIDE rows inside the Decide tab, where the chip adds nothing. */
  chip: Chip | null;
  pc: string;
  /** Odds for the row's hover title. */
  pcTitle: string | undefined;
  pcColor: string;
  col1: string;
  col1Color: string;
  col2: string;
  on: boolean;
  /** Decide tab only: time left to the deadline on a 48 h scale. */
  urgency: { w: string; tone: Urgency } | null;
  changed: boolean;
}

export interface QueueView {
  tabs: QueueTabView[];
  rows: QueueRow[];
  col: string;
  meta: string;
  empty: boolean;
}

/** The Passed tab shows the most recent 80. */
export const PASSED_LIMIT = 80;
/** Full length of the Decide tab's urgency bar, hours. */
export const URGENCY_SCALE_H = 48;

export function buildQueue(ctx: RunCtx, snap: Snapshot, tab: QueueTab, sel: number | null, changed: Set<number> = new Set()): QueueView {
  const T = ctx.T;
  const tabs: QueueTabView[] = [
    { key: 'needs', label: 'Decide', count: snap.needs.length, on: tab === 'needs' },
    { key: 'watch', label: 'Watch', count: snap.watching.length, on: tab === 'watch' },
    { key: 'passed', label: 'Passed', count: snap.passed.length, on: tab === 'passed' },
  ];
  const list: KnownRow[] = tab === 'needs' ? snap.needs : tab === 'watch' ? snap.watching : snap.passed.slice(0, PASSED_LIMIT);
  const rows = list.map((x): QueueRow => {
    let col1 = '';
    let col1Color: string = C.ink;
    let col2 = '';
    let urgency: QueueRow['urgency'] = null;
    if (tab === 'needs') {
      const plan = (x as NeedRow).plan;
      urgency =
        !plan || plan.overNow
          ? { w: '100%', tone: 'over' }
          : { w: ((clamp(plan.left, 0, URGENCY_SCALE_H) / URGENCY_SCALE_H) * 100).toFixed(1) + '%', tone: plan.left < 24 ? 'soon' : 'calm' };
      col2 = 'TCA ' + dh(x.e.tca - T);
      if (!plan) {
        col1 = 'too late';
        col1Color = C.overdue;
      } else if (plan.overNow) {
        col1 = 'over budget';
        col1Color = C.overdue;
      } else {
        col1 = 'in ' + dh(plan.left);
        col1Color = plan.left < 24 ? C.risk : C.ink;
      }
    } else if (tab === 'watch') {
      col1 = mTxt(x.s.last[2]);
      col2 = 'TCA ' + dh(x.e.tca - T);
    } else {
      col1 = 'final ' + pcTxt(x.s.last[1]);
      col1Color = x.s.last[1] >= PC_ACTION ? C.overdue : C.slate;
      col2 = dh(T - x.e.tca) + ' ago';
    }
    const chip = chipFor(ctx, x.e, x.s);
    return {
      id: x.e.id,
      sat: x.e.sat,
      obj: x.e.obj.toLowerCase(),
      chip: tab === 'needs' && chip.label === 'DECIDE' ? null : chip,
      pc: pcTxt(x.s.last[1]),
      pcTitle: pcOdds(x.s.last[1]) ?? undefined,
      pcColor: BUCKET_COLOR[x.s.bucket] ?? C.slate,
      col1,
      col1Color,
      col2,
      on: sel === x.e.id,
      urgency,
      changed: changed.has(x.e.id),
    };
  });
  return {
    tabs,
    rows,
    col: tab === 'needs' ? 'Decide within' : tab === 'watch' ? 'Miss' : 'Final Pc',
    meta: tab === 'needs' ? 'soonest deadline first' : tab === 'watch' ? snap.quiet + ' quiet events hidden' : 'most recent first',
    empty: rows.length === 0,
  };
}
