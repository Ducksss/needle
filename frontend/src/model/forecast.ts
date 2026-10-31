// Final-miss forecast (contracts/README.md § forecast.json): where an event's miss distance is likely to end up at
// closest approach, from how similar train events moved. Pc is not forecast.

import type { Forecast, ForecastCell, ReplayEvent } from '../data/types';
import type { KnownState } from './replay';

/** Index of the bin holding v: edges[i] <= v < edges[i + 1], with null as an open upper edge. Clamped to the bins. */
export function binOf(edges: (number | null)[], v: number): number {
  const bins = edges.length - 1;
  for (let i = 0; i < bins; i++) {
    const hi = edges[i + 1];
    if (hi == null || v < hi) return i;
  }
  return bins - 1;
}

export interface MissForecast {
  /** Days from the latest message to closest approach. */
  leadDays: number;
  cell: ForecastCell;
  missM: number;
  q10M: number;
  q50M: number;
  q90M: number;
  /** Share of held-out events that ended inside [q10, q90]. */
  coverage: number;
  heldOut: number;
}

/** Forecast for an open event from its latest message, or null when the event has passed or there is no forecast. */
export function forecastAt(f: Forecast | null | undefined, e: ReplayEvent, s: KnownState): MissForecast | null {
  if (!f || s.phase !== 'open') return null;
  const [arrivalH, , missM] = s.last;
  const leadDays = (e.tca - arrivalH) / 24;
  if (leadDays < 0) return null;
  const cell = f.cells[binOf(f.leadEdgesDays, leadDays)]?.[binOf(f.missEdgesM, missM)];
  if (!cell) return null;
  return {
    leadDays,
    cell,
    missM,
    q10M: missM * cell.ratioQ10,
    q50M: missM * cell.ratioQ50,
    q90M: missM * cell.ratioQ90,
    coverage: f.validation.coverage10to90,
    heldOut: f.validation.heldOutEvents,
  };
}

/** Forecast distance, one decimal in km: "1.5 km", "640 m". */
export const kmTxt = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');

/** A range with one unit: "0.9–2.8 km" once the top reaches 1 km, "640–980 m" below; "40 m–1.2 km" when km would round the low end to 0.0. */
export function rangeTxt(lo: number, hi: number): string {
  if (hi < 1000) return Math.round(lo) + '–' + Math.round(hi) + ' m';
  if (lo >= 100) return (lo / 1000).toFixed(1) + '–' + (hi / 1000).toFixed(1) + ' km';
  return kmTxt(lo) + '–' + kmTxt(hi);
}

/** "8 in 10" from a coverage share. */
export const inTen = (share: number) => Math.round(share * 10) + ' in 10';

export const pctTxt = (p: number) => (p < 0.01 ? 'under 1%' : Math.round(p * 100) + '%');

export interface ForecastLine {
  median: string;
  range: string;
  cover: string;
  pUnder1km: string;
  pCritical: string;
  tip: string[];
}

export function forecastLine(fc: MissForecast): ForecastLine {
  return {
    median: kmTxt(fc.q50M),
    range: rangeTxt(fc.q10M, fc.q90M),
    cover: inTen(fc.coverage),
    pUnder1km: pctTxt(fc.cell.pUnder1km),
    pCritical: pctTxt(fc.cell.pCritical),
    tip: [
      inTen(fc.coverage) + ' similar events ended inside this band (checked on ' + fc.heldOut.toLocaleString('en-US') + ' held-out events); n = ' + fc.cell.n.toLocaleString('en-US') + '.',
      'From the latest miss and the time left to closest approach (' + fc.leadDays.toFixed(1) + ' days). Pc is not forecast.',
    ],
  };
}
