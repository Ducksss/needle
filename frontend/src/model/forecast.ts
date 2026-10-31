// Final-miss forecast (contracts/README.md § forecast.json): where an event's miss distance is likely to end up at
// closest approach, from how similar train events moved. Pc is not forecast.

import type { Forecast, ForecastCell, ReplayEvent } from '../data/types';
import { dh } from './format';
import { PC_ACTION, PC_WATCH, type KnownState } from './replay';

/** Index of the bin holding v: edges[i] <= v < edges[i + 1], with null as an open upper edge. Clamped to the bins. */
export function binOf(edges: (number | null)[], v: number): number {
  const bins = edges.length - 1;
  for (let i = 0; i < bins; i++) {
    const hi = edges[i + 1];
    if (hi == null || v < hi) return i;
  }
  return bins - 1;
}

/** The latest message's Pc band for pCriticalByPc: 0 below 1e-6, 1 from 1e-6 to 1e-4, 2 at or above 1e-4. */
export function pcBandOf(f: Forecast, risk: number): 0 | 1 | 2 {
  const [lo, hi] = f.pcEdgesLog10 ?? [PC_WATCH, PC_ACTION];
  return risk < lo ? 0 : risk < hi ? 1 : 2;
}

export interface MissForecast {
  /** Days from the latest message to closest approach. */
  leadDays: number;
  cell: ForecastCell;
  /** Chance of ending Critical given the Pc band; null with too little history or an older forecast.json. */
  pCritical: number | null;
  /** Past events behind that chance, and the Pc band they share. */
  pCriticalN: number | null;
  pcBand: 0 | 1 | 2;
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
  const lb = binOf(f.leadEdgesDays, leadDays);
  const mb = binOf(f.missEdgesM, missM);
  const cell = f.cells[lb]?.[mb];
  if (!cell) return null;
  // cells[...].pCritical ignores Pc (an event at Pc 5e-4 would read about 5%), so it is never shown.
  const band = pcBandOf(f, s.last[1]);
  const byPcCell = f.pCriticalByPc?.[band]?.[lb]?.[mb];
  const byPc = byPcCell?.p;
  return {
    leadDays,
    cell,
    pCritical: byPc ?? null,
    pCriticalN: byPcCell?.n ?? null,
    pcBand: band,
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

export const NOT_ENOUGH = 'not enough history';

/** The Pc-conditioned chance of ending Critical, or "not enough history". */
export const pCriticalTxt = (fc: MissForecast) => (fc.pCritical == null ? NOT_ENOUGH : pctTxt(fc.pCritical));

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
    pCritical: pCriticalTxt(fc),
    tip: [
      inTen(fc.coverage) + ' similar events ended inside this band (checked on ' + fc.heldOut.toLocaleString('en-US') + ' held-out events); n = ' + fc.cell.n.toLocaleString('en-US') + '.',
      'From the latest miss and the time left to closest approach (' + fc.leadDays.toFixed(1) + ' days). Pc is not forecast.',
    ],
  };
}

/** Log-scale position of a distance on the range bar, as a share of its width. */
export interface RangeAxis {
  lo: number;
  hi: number;
  at: (m: number) => number;
  ticks: { pos: number; label: string }[];
}

const TICKS_M = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/** A log km axis wide enough for now, the band and the 1 km line, padded to round edges. */
export function rangeAxis(values: number[]): RangeAxis {
  const lo = Math.max(50, Math.min(...values, 1000) / 1.6);
  const hi = Math.max(...values, 1000) * 1.6;
  const L = Math.log10(lo);
  const span = Math.log10(hi) - L;
  const at = (m: number) => Math.max(0, Math.min(1, (Math.log10(Math.max(m, 1)) - L) / span));
  const ticks = TICKS_M.filter((t) => t >= lo && t <= hi).map((t) => ({ pos: at(t), label: t >= 1000 ? t / 1000 + ' km' : t + ' m' }));
  return { lo, hi, at, ticks };
}

export interface ForecastCard {
  /** "Predicted from today's message, 5d 22h before closest approach". */
  lead: string;
  ticks: { left: string; label: string }[];
  now: { left: string; label: string };
  pred: { left: string; label: string };
  band: { left: string; width: string; label: string };
  /** The part of the band below 1 km, tinted in the risk colour. */
  risk: { left: string; width: string } | null;
  oneKm: string;
  pUnder1km: string;
  /** What the chance under 1 km rests on: "1,078 similar events". */
  pUnder1kmBasis: string;
  pCritical: string;
  /** What the chance of ending Critical rests on: "20 similar events at Pc ≥ 1e-4". */
  pCriticalBasis: string;
  /** True when the chance of ending Critical is missing for lack of history. */
  pCriticalMissing: boolean;
  footnote: string;
}

const PC_BAND_TXT = ['Pc below 1e-6', 'Pc 1e-6 to 1e-4', 'Pc ≥ 1e-4'];

const pct = (x: number) => (x * 100).toFixed(2) + '%';

/** toTcaH: hours from now to closest approach, as the workspace header shows it. */
export function forecastCard(fc: MissForecast, toTcaH = fc.leadDays * 24): ForecastCard {
  const ax = rangeAxis([fc.missM, fc.q10M, fc.q50M, fc.q90M]);
  const a = ax.at(fc.q10M);
  const b = ax.at(fc.q90M);
  const k = ax.at(1000);
  return {
    lead: 'Predicted from today’s message, ' + dh(toTcaH) + ' before closest approach',
    ticks: ax.ticks.map((t) => ({ left: pct(t.pos), label: t.label })),
    now: { left: pct(ax.at(fc.missM)), label: 'now ' + kmTxt(fc.missM) },
    pred: { left: pct(ax.at(fc.q50M)), label: 'predicted final ' + kmTxt(fc.q50M) },
    band: { left: pct(a), width: pct(Math.max(0.004, b - a)), label: inTen(fc.coverage) + ': ' + rangeTxt(fc.q10M, fc.q90M) },
    risk: fc.q10M < 1000 ? { left: pct(a), width: pct(Math.max(0.004, Math.min(b, k) - a)) } : null,
    oneKm: pct(k),
    pUnder1km: pctTxt(fc.cell.pUnder1km),
    pUnder1kmBasis: fc.cell.n.toLocaleString('en-US') + ' similar events',
    pCritical: pCriticalTxt(fc),
    pCriticalBasis: fc.pCriticalN != null ? fc.pCriticalN.toLocaleString('en-US') + ' similar events at ' + PC_BAND_TXT[fc.pcBand] : 'too few past events at ' + PC_BAND_TXT[fc.pcBand],
    pCriticalMissing: fc.pCritical == null,
    footnote:
      'Band and chance under 1 km: past events at the same lead time and distance. Chance it ends Critical: past events that also shared the Pc band. The band held ' +
      inTen(fc.coverage).replace(' in ', ' times in ') + ' on ' + fc.heldOut.toLocaleString('en-US') + ' held-out events. The brief scores predictions made 2+ days out; Needle updates this at every message.',
  };
}
