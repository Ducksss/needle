import type { ConsoleData, Fleet, Forecast, Metrics, Replay } from './types';

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
    getJson<Forecast>(urls.forecast)
      .then((f) => (Array.isArray(f?.cells) ? f : null))
      .catch(() => null),
  ]);
  // Fail into the error state, not a blank page, when a file parses but is not the contract shape.
  if (!Array.isArray(fleet?.missions)) throw new Error(`${urls.fleet}: missing missions`);
  if (!Array.isArray(replay?.events)) throw new Error(`${urls.replay}: missing events`);
  return { fleet, replay, metrics, forecast };
}
