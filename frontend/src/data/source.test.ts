import { afterEach, describe, expect, it, vi } from 'vitest';
import { realData } from '../test/fixtures';
import { checkForecast, dataUrls, isMission, isReplayEvent, loadConsoleData } from './source';

describe('dataUrls', () => {
  it('reads the static copies when no API is set', () => {
    expect(dataUrls(undefined, '/')).toEqual({ mode: 'static', fleet: '/data/fleet.json', replay: '/data/replay.json', metrics: '/data/metrics.json', forecast: '/data/forecast.json' });
    expect(dataUrls('  ', '/needle').replay).toBe('/needle/data/replay.json');
  });

  it('reads the API when VITE_API_URL is set', () => {
    expect(dataUrls('http://localhost:8000/', '/')).toEqual({
      mode: 'api',
      fleet: 'http://localhost:8000/api/fleet',
      replay: 'http://localhost:8000/api/replay',
      metrics: 'http://localhost:8000/api/metrics',
      forecast: '/data/forecast.json',
    });
  });
});

describe('loadConsoleData', () => {
  afterEach(() => vi.unstubAllGlobals());

  const CELL = { n: 100, ratioQ10: 0.6, ratioQ50: 1, ratioQ90: 1.8, pUnder1km: 0.15, pCritical: 0.15, pooled: false };
  const FORECAST = { leadEdgesDays: [0, null], missEdgesM: [0, null], cells: [[CELL]], validation: { coverage10to90: 0.8, heldOutEvents: 10 } };
  const BODY: Record<string, object> = { 'fleet.json': { missions: [] }, 'replay.json': { runs: 64, runH: 8, events: [] }, 'metrics.json': {}, 'forecast.json': FORECAST };
  const respond = (missing: string[], body = BODY) =>
    vi.fn(async (url: string) => {
      if (missing.some((m) => url.endsWith(m))) return new Response('not found', { status: 404 });
      const name = url.split('/').pop()!;
      return new Response(JSON.stringify({ url, ...body[name] }), { status: 200 });
    });

  it('treats a missing metrics.json as optional', async () => {
    vi.stubGlobal('fetch', respond(['metrics.json']));
    const data = await loadConsoleData(dataUrls(undefined, '/'));
    expect(data.fleet).toEqual({ url: '/data/fleet.json', missions: [] });
    expect(data.metrics).toBeNull();
    expect(data.replay).toEqual({ url: '/data/replay.json', runs: 64, runH: 8, events: [] });
    expect(data.forecast).toEqual({ url: '/data/forecast.json', ...FORECAST });
  });

  it('drops a forecast that lacks the fields the cards read', async () => {
    const { leadEdgesDays: _drop, ...partial } = FORECAST;
    vi.stubGlobal('fetch', respond([], { ...BODY, 'forecast.json': partial }));
    const data = await loadConsoleData(dataUrls(undefined, '/'));
    expect(data.forecast).toBeNull();
  });

  it('fails when the replay cannot be read', async () => {
    vi.stubGlobal('fetch', respond(['replay.json']));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: HTTP 404');
  });

  it('fails when a file parses but is not the contract shape', async () => {
    vi.stubGlobal('fetch', respond([], { ...BODY, 'replay.json': { runs: 64 } }));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: missing events, runs or runH');
  });

  it('fails into the error state when an event lacks its object type or has a malformed plan', async () => {
    const good = { id: 1, sat: 'ESA-01', mi: 0, obj: 'Debris', inc: 97, tca: 30, m: [[10, -5, 900]], coa: {} };
    for (const bad of [{ ...good, obj: undefined }, { ...good, coa: { '0': { opts: [] } } }, { ...good, coa: { '3': { opts: [], wait: [] } } }]) {
      vi.stubGlobal('fetch', respond([], { ...BODY, 'replay.json': { runs: 64, runH: 8, events: [good, bad] } }));
      await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: event 1 is not in the contract shape');
    }
  });

  it('fails into the error state when a fleet mission lacks its altitude', async () => {
    vi.stubGlobal('fetch', respond([], { ...BODY, 'fleet.json': { missions: [{ label: 'ESA-01', alt: 700, inc: 98 }, { label: 'ESA-02', inc: 98 }] } }));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/fleet.json: mission 1 is not in the contract shape');
  });

  it('fails into the error state when one event lacks its messages', async () => {
    const good = { id: 1, sat: 'ESA-01', mi: 0, obj: 'Debris', inc: 97, tca: 30, m: [[10, -5, 900]], coa: {} };
    vi.stubGlobal('fetch', respond([], { ...BODY, 'replay.json': { runs: 64, runH: 8, events: [good, { ...good, id: 2, m: undefined }] } }));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: event 1 is not in the contract shape');
  });
});

describe('contract checks', () => {
  const data = realData();

  it('accept the committed replay and forecast', () => {
    expect(data.replay.events.every(isReplayEvent)).toBe(true);
    expect(data.fleet.missions.every(isMission)).toBe(true);
    const f = checkForecast(data.forecast)!;
    expect([f.pCriticalByPc != null, f.pcForecast != null, f.validation.pcForecast?.ceilingSamples]).toEqual([true, true, 4355]);
  });

  it('reject a miss cell without its numbers, and drop only a malformed Pc outlook', () => {
    const f = data.forecast!;
    expect(checkForecast({ ...f, cells: [[{ ...f.cells[0][0], n: undefined }]] })).toBeNull();
    const noPc = checkForecast({ ...f, pcForecast: { ...f.pcForecast!, cells: [[{ n: 3 }]] } })!;
    expect([noPc.pcForecast, noPc.cells.length]).toEqual([undefined, f.cells.length]);
  });
});
