import { describe, expect, it } from 'vitest';
import { coa, ev, realReplay, replayOf } from '../test/fixtures';
import { NO_DECISIONS, runCtx, snapshot } from './run';
import { buildWarnings, eventsInWindow } from './warnings';

const T = 48;
const run = T / 8;

function fixture() {
  return replayOf([
    ev(1, 50, [[10, -8, 400]], { sat: 'ESA-02' }),
    ev(2, 60, [[10, -5, 600]], { sat: 'ESA-02' }),
    ev(3, 70, [[10, -7, 3000]], { sat: 'ESA-03' }),
    ev(4, 72, [[20, -3.5, 9000]], { sat: 'ESA-02' }),
    ev(5, 72.1, [[10, -8, 400]]),
    ev(6, 65, [[49, -8, 400]]),
    ev(7, 47.9, [[10, -8, 400]]),
    ev(8, 200, [[30, -3.5, 2000]], { coa: { '0': coa({ wait: [[0, 2], [6, 3], [12, 4], [18, 5], [24, 6], [30, 20]] }) } }),
  ]);
}

describe('eventsInWindow', () => {
  it('keeps passes in [T, T + 24 h] already reported at T, sorted by TCA', () => {
    const ctx = runCtx(fixture(), run, 10, NO_DECISIONS);
    expect(eventsInWindow(ctx).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it('includes a pass exactly at either edge', () => {
    const rp = replayOf([ev(1, 48, [[0, -8, 9000]]), ev(2, 72, [[0, -8, 9000]])]);
    expect(eventsInWindow(runCtx(rp, run, 10, NO_DECISIONS)).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('buildWarnings', () => {
  const rp = fixture();
  const ctx = runCtx(rp, run, 10, NO_DECISIONS);
  const view = buildWarnings(ctx, snapshot(ctx), null);
  const count = (k: string) => view.counts.find((c) => c.key === k)?.v;

  it('counts passes by distance and Pc', () => {
    expect(count('passes')).toBe(4);
    expect(count('danger')).toBe(2);
    expect(count('elevated')).toBe(1);
    expect(count('pc')).toBe(1);
  });

  it('counts decision deadlines in the window whatever the TCA', () => {
    expect(count('deadlines')).toBe(1);
  });

  it('labels each row with the brief tier and the Needle queue', () => {
    expect(view.rows.map((r) => [r.id, r.tier, r.queue.label])).toEqual([
      [1, 'CRITICAL', 'WATCH'],
      [2, 'CRITICAL', 'WATCH'],
      [3, 'ELEVATED', 'WATCH'],
      [4, 'CRITICAL', 'DECIDE'],
    ]);
  });

  it('writes at most three insights, starting with the dangerous-distance one', () => {
    expect(view.insights.length).toBe(3);
    expect(view.insights[0].text).toBe('1 of 2 passes under 1 km have Pc below 1e-6: Critical by the brief’s distance rule, far below the action threshold.');
    expect(view.insights[1].text).toBe('1 pass is at Pc ≥ 1e-4 in the window, with no approved burn.');
    expect(view.insights[1].eventId).toBe(4);
    expect(view.insights[2].text).toMatch(/^Earliest decision deadline: #8 \(ESA-01\) by Day 3 12:00, in 0d 12h, to stay within 10 mm\/s\.$/);
  });

  it('says so when nothing comes within 1 km', () => {
    const quiet = replayOf([ev(1, 50, [[10, -8, 9000]]), ev(2, 52, [[10, -8, 7000]])]);
    const c = runCtx(quiet, run, 10, NO_DECISIONS);
    expect(buildWarnings(c, snapshot(c), null).insights.map((i) => i.text)).toEqual([
      'None of the 2 passes comes within 1 km. Closest: #2 at 7.00 km.',
      'ESA-01 is the busiest satellite: 2 of 2 passes.',
    ]);
  });

  it('says so when the window is empty', () => {
    const c = runCtx(replayOf([]), run, 10, NO_DECISIONS);
    const v = buildWarnings(c, snapshot(c), null);
    expect(v.rows).toEqual([]);
    expect(v.insights[0].text).toBe('No reported event reaches closest approach in the next 24 h.');
  });

  it('stays consistent on the committed replay at every run', () => {
    const real = realReplay();
    for (let r = 0; r < real.runs; r++) {
      const c = runCtx(real, r, 10, NO_DECISIONS);
      const v = buildWarnings(c, snapshot(c), null);
      const n = (k: string) => v.counts.find((x) => x.key === k)!.v;
      expect(n('passes')).toBe(v.rows.length);
      expect(n('danger') + n('elevated')).toBeLessThanOrEqual(n('passes'));
      expect(v.rows.map((x) => x.tca)).toEqual([...v.rows.map((x) => x.tca)].sort((a, b) => a - b));
      expect(v.insights.length).toBeGreaterThan(0);
      expect(v.insights.length).toBeLessThanOrEqual(3);
    }
  });
});
