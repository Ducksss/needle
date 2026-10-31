import type { ConsoleData, Fleet, Metrics, Replay } from './types';

/** Where the console reads its data: the API when VITE_API_URL is set, otherwise the static copies in public/data/. */
export function dataUrls(apiUrl: string | undefined = import.meta.env.VITE_API_URL, base: string = import.meta.env.BASE_URL) {
  const api = apiUrl?.trim().replace(/\/+$/, '');
  if (api) return { mode: 'api' as const, fleet: `${api}/api/fleet`, replay: `${api}/api/replay`, metrics: `${api}/api/metrics` };
  const root = base.endsWith('/') ? base : base + '/';
  return { mode: 'static' as const, fleet: `${root}data/fleet.json`, replay: `${root}data/replay.json`, metrics: `${root}data/metrics.json` };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadConsoleData(urls = dataUrls()): Promise<ConsoleData> {
  const [fleet, replay, metrics] = await Promise.all([
    getJson<Fleet>(urls.fleet),
    getJson<Replay>(urls.replay),
    getJson<Metrics>(urls.metrics).catch(() => null),
  ]);
  return { fleet, replay, metrics };
}
