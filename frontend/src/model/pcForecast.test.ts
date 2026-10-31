// Pc outlook on the Pc chart (contracts/README.md § forecast.json, "pcForecast").

import { describe, expect, it } from 'vitest';
import type { Forecast } from '../data/types';
import { ev, realData } from '../test/fixtures';
import { pcBinOf, pcForecastAt, pcOutlookText } from './forecast';
import { isKnown, stateAt } from './replay';
import { DEFAULT_OPTION, NO_DECISIONS, runCtx } from './run';
import { buildWorkspace, PC_NOTE, PC_NOTE_OLD } from './workspace';

const data = realData();
const f = data.forecast as Forecast;
const pf = f.pcForecast!;
const known = (e: ReturnType<typeof ev>, T: number) => {
  const s = stateAt(e, T, 8);
  if (!isKnown(s)) throw new Error('unreported');
  return s;
};

describe('Pc outlook', () => {
  it('bins Pc as the contract says: floor, below 1e-10, 1e-10 to 1e-6, 1e-6 to 1e-4, at or above 1e-4', () => {
    expect([-30, -29.98, -10.01, -10, -6.01, -6, -4.01, -4, -2].map((r) => pcBinOf(pf, r))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('reads #6341 at run 5 from its latest message: ceiling below today, 53% fall to ~0, 11% end at or above 1e-4', () => {
    const e = data.replay.events.find((x) => x.id === 6341)!;
    const ctx = runCtx(data.replay, 4, 10, NO_DECISIONS);
    const po = pcForecastAt(f, e, known(e, ctx.T))!;
    expect([po.pcBin, po.leadTxt, po.cell.n, po.cell.ceilingDelta]).toEqual([4, '3 to 5 days', 38, -0.43]);
    const t = pcOutlookText(po);
    expect([t.floor, t.atLeast1e4]).toEqual(['53% fall to ~0', '11% end ≥ 1e-4']);
    expect(t.ceilingTip[0]).toBe('9 in 10 similar events ended at or below this (held on 89.9% of held-out events).');
    expect(t.noteTip[0]).toBe('From 38 past events with Pc at or above 1e-4, 3 to 5 days before closest approach.');

    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, f);
    if (ws.kind !== 'event') throw new Error('no event');
    const fan = ws.hist.pcFc!;
    expect(fan.ceiling).not.toBeNull();
    expect(fan.floorLabel).toEqual(['53% fall to ~0']);
    expect(fan.ring.label).toBe('11% end ≥ 1e-4');
    expect(ws.hist.pcNote.text).toBe(PC_NOTE);
  });

  it('draws no ceiling at the floor and says how many stay too small to compute', () => {
    const e = ev(1, 100, [[10, -30, 3000]]);
    const po = pcForecastAt(f, e, known(e, 20))!;
    expect(po.pcBin).toBe(0);
    const t = pcOutlookText(po);
    expect(t.atLeast1e4).toBeNull();
    expect(t.floor).toMatch(/^\d+% stay too small to compute$/);
    const ctx = runCtx({ runs: 64, runH: 8, windowH: 504, note: 'test', events: [e] }, 3, 10, NO_DECISIONS);
    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, f);
    if (ws.kind !== 'event') throw new Error('no event');
    expect(ws.hist.pcFc?.ceiling).toBeNull();
    expect(ws.hist.pcFc?.floorLabel).toEqual([t.floor.replace(' to compute', ''), 'to compute']);
  });

  it('uses only the latest message seen by T', () => {
    const e = ev(1, 100, [[10, -30, 3000], [50, -3.5, 400]]);
    expect(pcForecastAt(f, e, known(e, 20))!.pcBin).toBe(0);
    expect(pcForecastAt(f, e, known(e, 60))!.pcBin).toBe(4);
  });

  it('shows nothing once closest approach has passed, and keeps the old note without pcForecast', () => {
    const e = ev(1, 30, [[10, -3.5, 400]]);
    expect(pcForecastAt(f, e, known(e, 40))).toBeNull();
    const { pcForecast: _drop, ...older } = f;
    expect(pcForecastAt(older, e, known(e, 20))).toBeNull();
    const ctx = runCtx({ runs: 64, runH: 8, windowH: 504, note: 'test', events: [e] }, 2, 10, NO_DECISIONS);
    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, older);
    if (ws.kind !== 'event') throw new Error('no event');
    expect([ws.hist.pcFc, ws.hist.pcNote.text]).toEqual([null, PC_NOTE_OLD]);
  });
});
