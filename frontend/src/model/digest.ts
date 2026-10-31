// Since last run digest and the decision log.

import { pcOdds, pcTxt, plural } from './format';
import { isKnown } from './replay';
import type { KnownRow, LogEntry, Snapshot } from './run';
import { C } from './theme';

export interface DigestItem {
  id: number;
  sat: string;
  v: string;
  title: string | undefined;
}

export interface DigestGroup {
  title: string;
  color: string;
  items: DigestItem[];
}

export interface DigestView {
  meta: string;
  groups: DigestGroup[];
  quiet: boolean;
  /** Run 1: nothing earlier to compare with. */
  first: boolean;
}

/** Each group lists at most this many events; the title carries the full count. */
export const DIGEST_LIMIT = 4;

export function buildDigest(snap: Snapshot, run = 1): DigestView {
  if (run === 0) return { meta: plural(snap.open.length, 'event') + ' open', groups: [], quiet: true, first: true };
  const known = snap.rows.filter((r): r is KnownRow => isKnown(r.s));
  const wasPc = (r: KnownRow) => isKnown(r.p) && r.p.phase === 'open' && r.p.bucket === 'pc';
  const esc = known.filter((r) => r.s.phase === 'open' && r.s.bucket === 'pc' && !wasPc(r));
  const down = known.filter((r) => r.s.phase === 'open' && r.s.bucket !== 'pc' && wasPc(r));
  const pas = known.filter((r) => r.s.phase === 'resolved' && r.p.phase === 'open');
  const newOnes = snap.open.filter((r) => r.s.isNew);
  const item = (r: KnownRow, v: string): DigestItem => ({ id: r.e.id, sat: r.e.sat, v, title: pcOdds(r.s.last[1]) ?? undefined });
  const groups: DigestGroup[] = [];
  if (esc.length) groups.push({ title: 'Escalated to Pc ≥ 1e-4 · ' + esc.length, color: C.risk, items: esc.slice(0, DIGEST_LIMIT).map((r) => item(r, pcTxt(r.s.last[1]))) });
  if (down.length) groups.push({ title: 'Downgraded · ' + down.length, color: C.watch, items: down.slice(0, DIGEST_LIMIT).map((r) => item(r, pcTxt(r.s.last[1]))) });
  if (pas.length) groups.push({ title: 'Passed closest approach · ' + pas.length, color: C.slate, items: pas.slice(0, DIGEST_LIMIT).map((r) => item(r, 'final ' + pcTxt(r.s.last[1]))) });
  return { meta: plural(newOnes.length, 'new event') + ' reported', groups, quiet: !groups.length, first: false };
}

export interface LogRow {
  run: string;
  text: string;
}

/** Decisions made at or before the run on screen, newest run first. */
export const buildLog = (log: LogEntry[], run1 = Infinity): LogRow[] =>
  log
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.run <= run1)
    .sort((a, b) => b.l.run - a.l.run || b.i - a.i)
    .map(({ l }) => ({ run: 'Run ' + l.run, text: l.text }));
