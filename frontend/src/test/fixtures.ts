// Test helpers: the committed static data, and small synthetic events.

import fleetRaw from '../../public/data/fleet.json?raw';
import forecastRaw from '../../public/data/forecast.json?raw';
import replayRaw from '../../public/data/replay.json?raw';
import type { Cdm, Coa, ConsoleData, Fleet, Forecast, ForecastCell, Replay, ReplayEvent } from '../data/types';

export const realReplay = (): Replay => JSON.parse(replayRaw) as Replay;
export const realForecast = (): Forecast => JSON.parse(forecastRaw) as Forecast;
export const realData = (): ConsoleData => ({ fleet: JSON.parse(fleetRaw) as Fleet, replay: realReplay(), metrics: null, forecast: realForecast() });

const cell = (over: Partial<ForecastCell> = {}): ForecastCell => ({ n: 100, ratioQ10: 0.6, ratioQ50: 1, ratioQ90: 1.8, pUnder1km: 0.15, pCritical: 0.15, pooled: false, ...over });

/** Two lead bins (under and over 2 days) by two miss bins (under and over 2 km). */
export function forecastOf(cells: ForecastCell[][] = [[cell({ pCritical: 0.9 }), cell()], [cell({ pCritical: 0.5 }), cell({ pCritical: 0.02 })]]): Forecast {
  const band = (p: (number | null)[][]) => p.map((row) => row.map((x) => ({ p: x, n: 50 })));
  return {
    leadEdgesDays: [0, 2, null],
    missEdgesM: [0, 2000, null],
    quantiles: [0.1, 0.5, 0.9],
    cells,
    robustRatioQ10: [0.9, 0.6],
    // By Pc band (below 1e-6, 1e-6 to 1e-4, 1e-4 and up), then lead and miss bins.
    pCriticalByPc: [band([[0.8, 0.05], [0.3, 0.01]]), band([[0.9, 0.2], [0.5, null]]), band([[0.95, 0.6], [0.7, 0.4]])],
    pcEdgesLog10: [-6, -4],
    validation: { heldOutEvents: 2529, coverage10to90: 0.799 },
  };
}

export function coa(over: Partial<Coa> = {}): Coa {
  return {
    risk: -3.5,
    miss: 400,
    tca: 3,
    relSpeed: 10,
    crossDeg: 60,
    altKm: 600,
    m2: [100, 388],
    ell: { a: 800, b: 40, deg: 10 },
    hbrEff: 7,
    pcModelOk: true,
    wait: [
      [0, 2],
      [6, 4],
      [12, 9],
      [18, 12],
      [24, 15],
    ],
    opts: [
      { key: 'coa1', feasible: true, dv: 2, alpha: 0, beta: 0, leadH: 60, pcAfter: 5e-5, missAfter: 1500, dR: 0, dT: -1200, dN: 0, burnS: 2, propG: 0.9, dA: 3.7, m2After: [110, 1496] },
      { key: 'coa2', feasible: true, dv: 5, alpha: 180, beta: 0, leadH: 60, pcAfter: 5e-7, missAfter: 3000, dR: 0, dT: 2800, dN: 0, burnS: 5, propG: 2.3, dA: -9.2, m2After: [120, 2997] },
      { key: 'coa3', feasible: false, dv: 7, alpha: 0, beta: 0, leadH: 36, pcAfter: 9e-5, missAfter: 1100, dR: 0, dT: -900, dN: 0, burnS: 7, propG: 3.2, dA: 13, m2After: [105, 1095] },
    ],
    ...over,
  };
}

export function ev(id: number, tca: number, m: Cdm[], over: Partial<ReplayEvent> = {}): ReplayEvent {
  return { id, sat: 'ESA-01', mi: 0, obj: 'Debris', inc: 97, tca, m, coa: {}, ...over };
}

export function replayOf(events: ReplayEvent[], runs = 64): Replay {
  return { runs, runH: 8, windowH: 504, note: 'test', events };
}
