import { describe, expect, it } from 'vitest';
import { realData } from '../test/fixtures';
import { replayFacts } from './facts';
import { DEFAULT_OPTION, NO_DECISIONS } from './run';
import { buildView } from './view';

// After PR #10 (risk rounded down to 2 decimals) no Decide event lacks a plan days before closest approach.
describe('M1 data (PR #10)', () => {
  const data = realData();
  const ui = (run: number, sel: number) => ({ run, tab: 'needs' as const, sel, opt: DEFAULT_OPTION, budget: 10, dec: NO_DECISIONS });

  it('shows neither "too late" nor "no plan" for #12126 at run 10 or #9051 at run 40', () => {
    for (const [run, id] of [
      [9, 12126],
      [39, 9051],
    ]) {
      const v = buildView(data, ui(run, id));
      expect(v.queue.rows.find((r) => r.id === id)?.col1 ?? '').not.toMatch(/too late|no plan/);
      expect(v.ws.kind === 'event' && v.ws.header.status).not.toMatch(/under 3 h|no burn plan/);
    }
  });

  it('has a plan for every Decide event that is more than 3 h out, at every run', () => {
    for (let run = 0; run < data.replay.runs; run++) {
      for (const r of buildView(data, { ...ui(run, 0) }).queue.rows) expect(r.col1).not.toBe('no plan');
    }
  });

  it('counts 23 escalated events', () => {
    expect(replayFacts(data.replay).escalated).toBe(23);
  });
});
