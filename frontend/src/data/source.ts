import type { ConsoleData, Fleet, Forecast, Metrics, Replay } from './types';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Loose shapes for checking parsed JSON before the console trusts it.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const isGrid = (g: unknown, ok: (c: Obj) => boolean) => Array.isArray(g) && g.length > 0 && g.every((row) => Array.isArray(row) && row.every((c) => isObj(c) && ok(c)));

/** A replay event the console can render: numeric ids and times, and every CDM as [time, log10 Pc, miss]. */
export function isReplayEvent(e: unknown): boolean {
  if (!isObj(e) || !num(e.id) || !num(e.tca) || !num(e.mi) || typeof e.sat !== 'string' || !isObj(e.coa)) return false;
  return Array.isArray(e.m) && e.m.length > 0 && e.m.every((c) => Array.isArray(c) && num(c[0]) && num(c[1]) && num(c[2]));
}

/**
 * The forecast with every field the console reads, or null. The miss cells and validation numbers are required; the
 * optional Pc-conditioned chances and Pc outlook are dropped on their own when malformed, so the miss forecast still shows.
 */
export function checkForecast(f: unknown): Forecast | null {
  if (!isObj(f) || !Array.isArray(f.leadEdgesDays) || !Array.isArray(f.missEdgesM)) return null;
  const v = f.validation;
  if (!isObj(v) || !num(v.heldOutEvents) || !num(v.coverage10to90)) return null;
  if (!isGrid(f.cells, (c) => num(c.n) && num(c.ratioQ10) && num(c.ratioQ50) && num(c.ratioQ90) && num(c.pUnder1km))) return null;
  const byPc = Array.isArray(f.pCriticalByPc) && f.pCriticalByPc.every((band) => isGrid(band, (c) => num(c.n) && (c.p === null || num(c.p))));
  const pf = f.pcForecast;
  const pcOk = isObj(pf) && Array.isArray(pf.pcBinEdgesLog10) && num(pf.floorLog10) && isGrid(pf.cells, (c) => num(c.n) && num(c.pFloor) && num(c.pBelow1e6) && num(c.pAtLeast1e4) && (c.ceilingDelta === null || num(c.ceilingDelta)));
  const pv = v.pcForecast;
  const pvOk = isObj(pv) && num(pv.ceilingHeld) && num(pv.ceilingSamples);
  const out = { ...f, validation: { ...v, pcForecast: pvOk ? pv : undefined }, pCriticalByPc: byPc ? f.pCriticalByPc : undefined, pcForecast: pcOk ? pf : undefined };
  return out as unknown as Forecast;
}

/** Where the console reads its data: the API when VITE_API_URL is set, otherwise the static copies in public/data/. */
export function dataUrls(apiUrl: string | undefined = import.meta.env.VITE_API_URL, base: string = import.meta.env.BASE_URL) {
  const api = apiUrl?.trim().replace(/\/+$/, '');
  const root = base.endsWith('/') ? base : base + '/';
  // The API has no forecast route; the static copy ships with the console either way.
  const forecast = `${root}data/forecast.json`;
  if (api) return { mode: 'api' as const, fleet: `${api}/api/fleet`, replay: `${api}/api/replay`, metrics: `${api}/api/metrics`, forecast };
  return { mode: 'static' as const, fleet: `${root}data/fleet.json`, replay: `${root}data/replay.json`, metrics: `${root}data/metrics.json`, forecast };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadConsoleData(urls = dataUrls()): Promise<ConsoleData> {
  const [fleet, replay, metrics, forecast] = await Promise.all([
    getJson<Fleet>(urls.fleet),
    getJson<Replay>(urls.replay),
    getJson<Metrics>(urls.metrics).catch(() => null),
    getJson<unknown>(urls.forecast)
      // Only a forecast with every field the cards read; otherwise the console shows no forecast rather than failing.
      .then(checkForecast)
      .catch(() => null),
  ]);
  // Fail into the error state, not a blank page, when a file parses but is not the contract shape.
  if (!Array.isArray(fleet?.missions)) throw new Error(`${urls.fleet}: missing missions`);
  if (!Array.isArray(replay?.events) || !num(replay.runs) || !num(replay.runH)) throw new Error(`${urls.replay}: missing events, runs or runH`);
  const bad = replay.events.findIndex((e) => !isReplayEvent(e));
  if (bad >= 0) throw new Error(`${urls.replay}: event ${bad} is not in the contract shape`);
  return { fleet, replay, metrics, forecast };
}
