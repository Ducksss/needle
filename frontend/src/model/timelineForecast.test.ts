import { describe, expect, it } from 'vitest';
import { realData } from '../test/fixtures';
import { buildDock, dockHours, futureWindows } from './dock';
import { forecastAt } from './forecast';
import { isKnown, stateAt } from './replay';
import { NO_DECISIONS, runCtx } from './run';

const data = realData();
const rp = data.replay;
const run = 15;
const ctx = runCtx(rp, run, 10, NO_DECISIONS);
const T = ctx.T;
const dock = buildDock(ctx, null, null, 'coa4', new Set(), data.forecast!);

describe('timeline forecast', () => {
  it('rings each open bar at closest approach with its Pc-aware chance of ending Critical', () => {
    const bars = dock.lanes.flatMap((l) => l.bars);
    expect(bars.some((b) => b.forecast)).toBe(true);
    for (const b of bars) {
      if (!b.future) {
        expect(b.forecast).toBeNull();
        continue;
      }
      const e = rp.events.find((x) => x.id === b.id)!;
      const s = stateAt(e, T, rp.runH);
      if (!isKnown(s)) throw new Error('unreported');
      expect(b.forecast?.p).toBe(forecastAt(data.forecast, e, s)?.pCritical ?? null);
      expect(parseFloat(b.forecast!.left)).toBeCloseTo((Math.min(e.tca, dockHours(rp)) / dockHours(rp)) * 100, 2);
      expect(b.forecast!.label).toBe(b.forecast!.p != null && b.forecast!.p >= 0.2 ? Math.round(b.forecast!.p * 100) + '%' : null);
    }
  });

  it('shows actual counts up to now only, and the forecast after the playhead', () => {
    for (const d of dock.density) expect(d.future).toBe(d.run > run);
    for (const d of dock.density.filter((x) => x.future)) expect(d.h).toBe('0%');
    const lastX = Math.max(...[...dock.decideLine.matchAll(/H([\d.]+)/g)].map((m) => Number(m[1])));
    expect(lastX).toBeCloseTo((((run + 1) * rp.runH) / dockHours(rp)) * 100, 2);
    expect(dock.forecastLine.startsWith('M' + ((T / dockHours(rp)) * 100).toFixed(3))).toBe(true);
  });

  it('sums the chances of passes due in each window, from events reported by then', () => {
    const w = futureWindows(ctx, data.forecast, dockHours(rp));
    const due = rp.events.filter((e) => e.tca > T && e.tca < dockHours(rp) && e.m[0][0] <= T).length;
    expect(w.reduce((a, x) => a + x.due, 0)).toBe(due);
    expect(w.some((x) => x.start >= T + 24 && x.start < T + 72 && x.due > 0)).toBe(true);
    expect(w.every((x) => x.expected <= x.due)).toBe(true);
  });

  it('draws no forecast without forecast.json', () => {
    const plain = buildDock(ctx, null, null, 'coa4');
    expect(plain.forecastLine).toBe('');
    expect(plain.lanes.flatMap((l) => l.bars).every((b) => b.forecast === null)).toBe(true);
  });
});
