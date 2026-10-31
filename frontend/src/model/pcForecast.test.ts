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

  it('reads #6341 at run 5 in plain words: worst likely 1 in 10,000, 53% drop to almost zero, 11% still high', () => {
    const e = data.replay.events.find((x) => x.id === 6341)!;
    const ctx = runCtx(data.replay, 4, 10, NO_DECISIONS);
    const po = pcForecastAt(f, e, known(e, ctx.T))!;
    expect([po.pcBin, po.leadTxt, po.cell.n, po.cell.ceilingDelta]).toEqual([4, '3 to 5 days', 38, -0.43]);
    const t = pcOutlookText(po);
    expect(t.keys.map((k) => k.label)).toEqual(['worst likely: 1 in 10,000', '53% chance the risk drops to almost zero', '11% chance it’s still high at closest approach']);
    expect(t.keys[0].tip[0]).toBe('9 in 10 similar events ended at or below this. Checked on 4,355 forecasts for held-out events: held 89.9% of the time.');
    expect(t.keys[0].tip[1]).toBe('Technical: Pc ceiling 9.7e-5, today’s Pc 2.6e-4 lowered by 0.43 orders of magnitude (ceilingDelta).');
    expect(t.keys[1].tip[0]).toBe('As tracking improves, the collision risk often turns out to be negligible.');
    expect(t.noteTip[0]).toBe('Technical: from 38 past events with Pc at or above 1e-4, 3 to 5 days before closest approach.');

    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, f);
    if (ws.kind !== 'event') throw new Error('no event');
    const fan = ws.hist.pcFc!;
    expect(fan.ceiling).not.toBeNull();
    expect(fan.keys.map((k) => k.kind)).toEqual(['ceiling', 'fade', 'ring']);
    expect(ws.hist.pcNote?.text).toBe('Collision risk rarely goes up from here. It usually stays the same or drops as better tracking arrives.');
    expect(ws.hist.pcNote?.text).toBe(PC_NOTE);
  });

  it('draws no ceiling at the floor and says the risk is already negligible', () => {
    const e = ev(1, 100, [[10, -30, 3000]]);
    const po = pcForecastAt(f, e, known(e, 20))!;
    expect(po.pcBin).toBe(0);
    const t = pcOutlookText(po);
    expect(t.keys.map((k) => k.kind)).toEqual(['floor']);
    expect(t.keys[0].label).toMatch(/^Risk is already negligible; \d+% stay that way\.$/);
    const ctx = runCtx({ runs: 64, runH: 8, windowH: 504, note: 'test', events: [e] }, 3, 10, NO_DECISIONS);
    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, f);
    if (ws.kind !== 'event') throw new Error('no event');
    expect(ws.hist.pcFc?.ceiling).toBeNull();
    expect(ws.hist.pcFc?.keys).toEqual(t.keys);
  });

  it('leaves out the still-high line under 1%', () => {
    const e = ev(1, 100, [[10, -8, 3000]]);
    const t = pcOutlookText(pcForecastAt(f, e, known(e, 20))!);
    expect(t.keys.some((k) => k.kind === 'ring')).toBe(false);
  });

  it('uses only the latest message seen by T', () => {
    const e = ev(1, 100, [[10, -30, 3000], [50, -3.5, 400]]);
    expect(pcForecastAt(f, e, known(e, 20))!.pcBin).toBe(0);
    expect(pcForecastAt(f, e, known(e, 60))!.pcBin).toBe(4);
  });

  it('shows nothing once closest approach has passed, and keeps the old note without pcForecast', () => {
    const e = ev(1, 30, [[10, -3.5, 400]]);
    expect(pcForecastAt(f, e, known(e, 40))).toBeNull();
    const passed = buildWorkspace(runCtx({ runs: 64, runH: 8, windowH: 504, note: 'test', events: [e] }, 5, 10, NO_DECISIONS), e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, f);
    if (passed.kind !== 'event') throw new Error('no event');
    expect([passed.hist.pcFc, passed.hist.pcNote]).toEqual([null, null]);
    const { pcForecast: _drop, ...older } = f;
    expect(pcForecastAt(older, e, known(e, 20))).toBeNull();
    const ctx = runCtx({ runs: 64, runH: 8, windowH: 504, note: 'test', events: [e] }, 2, 10, NO_DECISIONS);
    const ws = buildWorkspace(ctx, e, DEFAULT_OPTION, { medianWaitRatio24h: null }, undefined, older);
    if (ws.kind !== 'event') throw new Error('no event');
    expect([ws.hist.pcFc, ws.hist.pcNote?.text]).toEqual([null, PC_NOTE_OLD]);
  });
});
