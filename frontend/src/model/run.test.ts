import { describe, expect, it } from 'vitest';
import { coa, ev, realReplay, replayOf } from '../test/fixtures';
import { isKnown } from './replay';
import { NO_DECISIONS, type Decisions, chipFor, queueOf, runCtx, snapshot } from './run';

describe('snapshot on the committed replay', () => {
  const rp = realReplay();

  it('splits every open event into exactly one of Decide, Watch or quiet at every run', () => {
    for (let run = 0; run < rp.runs; run++) {
      const snap = snapshot(runCtx(rp, run, 10, NO_DECISIONS));
      expect(snap.needs.length + snap.watching.length + snap.quiet).toBe(snap.open.length);
      expect(snap.quiet).toBeGreaterThanOrEqual(0);
      const ids = new Set([...snap.needs, ...snap.watching].map((r) => r.e.id));
      expect(ids.size).toBe(snap.needs.length + snap.watching.length);
    }
  });

  it('sorts Decide by deadline, with no-plan events last', () => {
    for (let run = 0; run < rp.runs; run++) {
      const lefts = snapshot(runCtx(rp, run, 10, NO_DECISIONS)).needs.map((n) => (n.plan ? n.plan.left : 1e9));
      expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    }
  });

  it('sorts Passed most recent first', () => {
    const tcas = snapshot(runCtx(rp, rp.runs - 1, 10, NO_DECISIONS)).passed.map((r) => r.e.tca);
    expect(tcas).toEqual([...tcas].sort((a, b) => b - a));
  });
});

describe('decisions', () => {
  const e = ev(7, 200, [[0, -3.5, 400], [8, -3.4, 380]], { coa: { '0': coa() } });
  const rp = replayOf([e]);
  const dec = (over: Partial<Decisions>): Decisions => ({ ...NO_DECISIONS, ...over });

  it('moves an approved event from Decide to Watch from its approval run on', () => {
    const d = dec({ approved: { 7: 3 } });
    expect(snapshot(runCtx(rp, 1, 10, d)).needs.map((n) => n.e.id)).toEqual([7]);
    const at3 = snapshot(runCtx(rp, 2, 10, d));
    expect(at3.needs).toEqual([]);
    expect(at3.watching.map((n) => n.e.id)).toEqual([7]);
    expect(at3.approvedN).toBe(1);
  });

  it('shows the chip for the decision at this run', () => {
    const s = (run: number) => {
      const st = snapshot(runCtx(rp, run, 10, NO_DECISIONS)).rows[0].s;
      if (!isKnown(st)) throw new Error('unreported');
      return st;
    };
    expect(chipFor(runCtx(rp, 1, 10, NO_DECISIONS), e, s(1)).label).toBe('DECIDE');
    expect(chipFor(runCtx(rp, 1, 10, dec({ deferred: { 7: 2 } })), e, s(1)).label).toBe('DEFERRED');
    expect(chipFor(runCtx(rp, 2, 10, dec({ deferred: { 7: 2 } })), e, s(2)).label).toBe('DECIDE');
    expect(chipFor(runCtx(rp, 2, 10, dec({ approved: { 7: 2 } })), e, s(2)).label).toBe('APPROVED');
    expect(chipFor(runCtx(rp, 0, 10, dec({ approved: { 7: 2 } })), e, s(0)).label).toBe('DECIDE');
    expect(chipFor(runCtx(rp, 25, 10, NO_DECISIONS), e, s(25)).label).toBe('PASSED · UNMITIGATED');
    expect(chipFor(runCtx(rp, 25, 10, dec({ approved: { 7: 2 } })), e, s(25)).label).toBe('PASSED · BURN');
  });

  it('names the queue an event sits in', () => {
    const quiet = ev(8, 200, [[0, -9, 20000]]);
    const ctx = runCtx(replayOf([quiet]), 1, 10, NO_DECISIONS);
    const s = snapshot(ctx).rows[0].s;
    expect(isKnown(s) && queueOf(ctx, quiet, s)).toBe('Quiet');
  });
});
