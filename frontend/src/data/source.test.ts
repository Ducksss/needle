import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataUrls, loadConsoleData } from './source';

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

  const BODY: Record<string, object> = { 'fleet.json': { missions: [] }, 'replay.json': { events: [] }, 'metrics.json': {} };
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
    expect(data.replay).toEqual({ url: '/data/replay.json', events: [] });
  });

  it('fails when the replay cannot be read', async () => {
    vi.stubGlobal('fetch', respond(['replay.json']));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: HTTP 404');
  });

  it('fails when a file parses but is not the contract shape', async () => {
    vi.stubGlobal('fetch', respond([], { ...BODY, 'replay.json': { runs: 64 } }));
    await expect(loadConsoleData(dataUrls(undefined, '/'))).rejects.toThrow('/data/replay.json: missing events');
  });
});
