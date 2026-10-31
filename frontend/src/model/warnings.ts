// Next 24 h warnings (contracts/README.md § 24 h warnings): passes in [T, T + 24 h], how many come within the
// dangerous distance, and up to three insights generated from the counts.

import { at, dh, mTxt, pcOdds, pcTxt, plural } from './format';
import { type KnownState, type Tier, PC_ACTION, PC_WATCH, TIER_TIP, isKnown, stateAt, tierOf } from './replay';
import { type Chip, type RunCtx, type Snapshot, approvedAt, queueChip } from './run';
import { BUCKET_COLOR, C, type Tone } from './theme';
import { TIER_TONE } from './workspace';

export const WINDOW_H = 24;
/** The brief's dangerous distance. */
export const DANGER_M = 1000;
export const ELEVATED_M = 5000;

export interface WarningRow {
  id: number;
  sat: string;
  obj: string;
  tca: number;
  tcaIn: string;
  tcaAt: string;
  miss: string;
  missM: number;
  pc: string;
  pcTitle: string | undefined;
  pcColor: string;
  tier: Tier;
  tierTone: Tone;
  tierTip: string;
  queue: Chip;
  selected: boolean;
}

export type CountKey = 'passes' | 'danger' | 'elevated' | 'pc' | 'deadlines';

export interface WarningCount {
  key: CountKey;
  label: string;
  v: number;
  color: string;
  tip: string;
}

export interface Insight {
  text: string;
  eventId: number | null;
}

export interface WarningsView {
  window: string;
  counts: WarningCount[];
  rows: WarningRow[];
  insights: Insight[];
}

interface InWindow {
  id: number;
  sat: string;
  obj: string;
  tca: number;
  s: KnownState;
}

/** Events whose closest approach falls in [T, T + 24 h] and whose first message arrived by T, sorted by TCA. */
export function eventsInWindow(ctx: RunCtx): InWindow[] {
  const { replay, T } = ctx;
  const out: InWindow[] = [];
  for (const e of replay.events) {
    if (e.tca < T || e.tca > T + WINDOW_H) continue;
    const s = stateAt(e, T, replay.runH);
    if (!isKnown(s)) continue;
    out.push({ id: e.id, sat: e.sat, obj: e.obj, tca: e.tca, s });
  }
  return out.sort((a, b) => a.tca - b.tca || a.id - b.id);
}

export function buildWarnings(ctx: RunCtx, snap: Snapshot, sel: number | null): WarningsView {
  const { T, budget } = ctx;
  const inWin = eventsInWindow(ctx);
  const byId = new Map(ctx.replay.events.map((e) => [e.id, e]));
  const miss = (x: InWindow) => x.s.last[2];
  const risk = (x: InWindow) => x.s.last[1];
  const danger = inWin.filter((x) => miss(x) < DANGER_M);
  const elevated = inWin.filter((x) => miss(x) >= DANGER_M && miss(x) <= ELEVATED_M);
  const pcHigh = inWin.filter((x) => risk(x) >= PC_ACTION);
  const deadlines = snap.needs
    .filter((n) => n.plan && !n.plan.overNow && n.plan.dlAbs <= T + WINDOW_H)
    .sort((a, b) => (a.plan?.dlAbs ?? 0) - (b.plan?.dlAbs ?? 0));

  const counts: WarningCount[] = [
    { key: 'passes', label: 'Passes', v: inWin.length, color: C.ink, tip: 'Reported events with closest approach within the next 24 h (time_to_tca ≤ 1 day). Each uses its latest message at this run.' },
    { key: 'danger', label: 'Under 1 km', v: danger.length, color: C.risk, tip: 'Latest miss distance under 1 km: the brief’s dangerous distance. The brief calls these Critical whatever the Pc.' },
    { key: 'elevated', label: '1 to 5 km', v: elevated.length, color: C.hidden, tip: 'Latest miss distance from 1 to 5 km. Elevated under the brief’s distance rule.' },
    { key: 'pc', label: 'Pc ≥ 1e-4', v: pcHigh.length, color: C.risk, tip: 'Latest Pc at or above 1e-4, the action threshold. These need a burn decision or a hand-over.' },
    {
      key: 'deadlines',
      label: 'Deadlines',
      v: deadlines.length,
      color: C.action,
      tip: 'Open Decide events whose ' + budget + ' mm/s budget deadline falls in the next 24 h, whatever their time_to_tca.',
    },
  ];

  const rows = inWin.map((x): WarningRow => {
    const e = byId.get(x.id)!;
    const tier = tierOf(x.s.last);
    return {
      id: x.id,
      sat: x.sat,
      obj: x.obj.toLowerCase(),
      tca: x.tca,
      tcaIn: dh(x.tca - T),
      tcaAt: at(x.tca),
      miss: mTxt(miss(x)),
      missM: miss(x),
      pc: pcTxt(risk(x)),
      pcTitle: pcOdds(risk(x)) ?? undefined,
      pcColor: BUCKET_COLOR[x.s.bucket] ?? C.slate,
      tier,
      tierTone: TIER_TONE[tier],
      tierTip: TIER_TIP[tier],
      queue: queueChip(ctx, e, x.s),
      selected: sel === x.id,
    };
  });

  const insights: Insight[] = [];
  if (!inWin.length) {
    insights.push({ text: 'No reported event reaches closest approach in the next 24 h.', eventId: null });
  } else if (!danger.length) {
    insights.push({ text: 'None of the ' + plural(inWin.length, 'pass', 'passes') + ' comes within 1 km. Closest: ' + closest(inWin) + '.', eventId: null });
  } else {
    insights.push({ text: dangerInsight(danger), eventId: null });
  }
  if (pcHigh.length) {
    const unapproved = pcHigh.filter((x) => approvedAt(ctx, x.id) == null);
    const approved = pcHigh.length - unapproved.length;
    const head = pcHigh.length === 1 ? '1 pass is' : pcHigh.length + ' passes are';
    const tail = approved ? ': ' + approved + ' with an approved burn, ' + unapproved.length + ' without.' : unapproved.length === 1 ? ', with no approved burn.' : ', none with an approved burn.';
    insights.push({ text: head + ' at Pc ≥ 1e-4 in the window' + tail, eventId: unapproved.length === 1 ? unapproved[0].id : null });
  }
  const first = deadlines[0];
  if (first?.plan) {
    insights.push({
      text: 'Earliest decision deadline: #' + first.e.id + ' (' + first.e.sat + ') by ' + at(first.plan.dlAbs) + ', in ' + dh(first.plan.left) + ', to stay within ' + budget + ' mm/s.',
      eventId: first.e.id,
    });
  }
  const bySat = new Map<string, number>();
  for (const x of inWin) bySat.set(x.sat, (bySat.get(x.sat) ?? 0) + 1);
  const top = Math.max(0, ...bySat.values());
  if (top >= 2) {
    const sats = [...bySat].filter(([, n]) => n === top).map(([s]) => s).sort();
    insights.push({
      text: sats.length === 1 ? sats[0] + ' is the busiest satellite: ' + top + ' of ' + inWin.length + ' passes.' : listJoin(sats) + ' are the busiest satellites: ' + top + ' passes each.',
      eventId: null,
    });
  }

  return { window: at(T) + ' → ' + at(T + WINDOW_H), counts, rows, insights: insights.slice(0, 3) };
}

/** How the brief's distance rule and Pc compare for the passes under 1 km. */
function dangerInsight(danger: InWindow[]): string {
  const n = danger.length;
  const lowPc = danger.filter((x) => x.s.last[1] < PC_WATCH).length;
  const highPc = danger.filter((x) => x.s.last[1] >= PC_ACTION).length;
  const all = n === 1 ? 'The one pass under 1 km has' : 'All ' + n + ' passes under 1 km have';
  if (lowPc === n) return all + ' Pc below 1e-6: Critical by the brief’s distance rule, Watch for Needle.';
  if (lowPc > 0) return lowPc + ' of ' + n + ' passes under 1 km have Pc below 1e-6: Critical by the brief’s distance rule, far below the action threshold.';
  if (highPc === 0) return all + ' Pc from 1e-6 to 1e-4: Needle watches them and plans no burn yet.';
  return plural(n, 'pass', 'passes') + ' under 1 km; ' + highPc + ' also at Pc ≥ 1e-4.';
}

/** "a", "a and b", "a, b and c". */
export function listJoin(xs: string[]): string {
  return xs.length < 2 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

function closest(xs: InWindow[]): string {
  const c = xs.reduce((a, b) => (b.s.last[2] < a.s.last[2] ? b : a));
  return '#' + c.id + ' at ' + mTxt(c.s.last[2]);
}
