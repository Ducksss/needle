import { describe, expect, it } from 'vitest';
import { ev, realReplay } from '../test/fixtures';
import { assignTracks, buildDock, densityCounts, dockHours } from './dock';
import { NO_DECISIONS, runCtx } from './run';

describe('dock', () => {
  const rp = realReplay();

  it('spans the replay window plus one day', () => {
    expect(dockHours(rp)).toBe(528);
  });

  it('counts open events once per run', () => {
    const counts = densityCounts(rp);
    expect(counts.length).toBe(rp.runs);
    expect(densityCounts(rp)).toBe(counts);
    for (const [open, pc] of counts) expect(pc).toBeLessThanOrEqual(open);
  });

  it('shades the next 24 h from the playhead', () => {
    const d = buildDock(runCtx(rp, 10, 10, NO_DECISIONS), null, null, 'coa1');
    expect(d.band.left).toBe(d.playLeft);
    expect(d.band.left).toBe(((80 / 528) * 100).toFixed(3) + '%');
    expect(d.band.w).toBe(((24 / 528) * 100).toFixed(3) + '%');
    expect(d.playLabel).toBe('Day 4 · 08:00');
  });

  it('marks the current run in the density strip', () => {
    const d = buildDock(runCtx(rp, 10, 10, NO_DECISIONS), null, null, 'coa1');
    expect(d.density.filter((x) => x.current).map((x) => x.run)).toEqual([10]);
  });

  it('only draws events already reported', () => {
    for (const run of [0, 20, 63]) {
      const T = run * rp.runH;
      const d = buildDock(runCtx(rp, run, 10, NO_DECISIONS), null, null, 'coa1');
      const ids = d.lanes.flatMap((l) => l.bars.map((b) => b.id));
      for (const id of ids) expect(rp.events.find((e) => e.id === id)!.m[0][0]).toBeLessThanOrEqual(T);
    }
  });

  it('stacks overlapping events on separate tracks', () => {
    const a = ev(1, 100, [[0, -3, 400]]);
    const b = ev(2, 120, [[50, -3, 400]]);
    const c = ev(3, 300, [[200, -3, 400]]);
    const { trackOf, count } = assignTracks([a, b, c]);
    expect(trackOf).toEqual({ 1: 0, 2: 1, 3: 0 });
    expect(count).toBe(2);
  });
});
