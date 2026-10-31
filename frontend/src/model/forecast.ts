// Forecasts at closest approach (contracts/README.md § forecast.json), from how similar train events moved: a band
// for the final miss distance, and a Pc outlook (a ceiling and outcome chances, since Pc has no useful band).

import type { Forecast, ForecastCell, PcForecastCell, ReplayEvent } from '../data/types';
import { dh, pcOdds, pcTxt } from './format';
import { C } from './theme';
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

/** Forecast distance in the console's one miss format: m under 1 km, km with 2 decimals above. */
export const kmTxt = (m: number) => (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');

/** A range in the same format, one unit when both ends share it: "1.59–10.97 km", "190–394 m", "640 m–1.25 km". */
export function rangeTxt(lo: number, hi: number): string {
  if (hi < 1000) return Math.round(lo) + '–' + Math.round(hi) + ' m';
  if (lo >= 1000) return (lo / 1000).toFixed(2) + '–' + (hi / 1000).toFixed(2) + ' km';
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
      'From the latest miss and the time left to closest approach (' + fc.leadDays.toFixed(1) + ' days).',
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
  pUnder1kmColor: string;
  pCriticalColor: string;
  /** Hover cards: the technical meaning behind each plain label. */
  pUnder1kmTip: string[];
  pCriticalTip: string[];
  footnote: string;
}

const PC_BAND_TXT = ['Pc below 1e-6', 'Pc 1e-6 to 1e-4', 'Pc ≥ 1e-4'];

/** "between 231 m and 2.08 km", one unit when both ends share it: "between 1.80 and 12.62 km". */
function betweenTxt(lo: number, hi: number): string {
  if (hi < 1000) return 'between ' + Math.round(lo) + ' and ' + Math.round(hi) + ' m';
  if (lo >= 1000) return 'between ' + (lo / 1000).toFixed(2) + ' and ' + (hi / 1000).toFixed(2) + ' km';
  return 'between ' + kmTxt(lo) + ' and ' + kmTxt(hi);
}

/** A forecast chance in risk orange from 50%, amber from 20%, otherwise ink. */
export const chanceColor = (p: number | null) => (p == null ? C.muted : p >= 0.5 ? C.risk : p >= 0.2 ? C.hidden : C.ink);

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
    pred: { left: pct(ax.at(fc.q50M)), label: 'likely final distance ' + kmTxt(fc.q50M) },
    band: { left: pct(a), width: pct(Math.max(0.004, b - a)), label: inTen(fc.coverage).replace(' in ', ' out of ') + ' similar events ended ' + betweenTxt(fc.q10M, fc.q90M) },
    risk: fc.q10M < 1000 ? { left: pct(a), width: pct(Math.max(0.004, Math.min(b, k) - a)) } : null,
    oneKm: pct(k),
    pUnder1km: pctTxt(fc.cell.pUnder1km),
    pUnder1kmBasis: fc.cell.n.toLocaleString('en-US') + ' similar past events',
    pCritical: pCriticalTxt(fc),
    pCriticalBasis: fc.pCriticalN != null ? fc.pCriticalN.toLocaleString('en-US') + ' similar past events at this risk level' : 'too few past events at this risk level',
    pCriticalMissing: fc.pCritical == null,
    pUnder1kmColor: chanceColor(fc.cell.pUnder1km),
    pCriticalColor: chanceColor(fc.pCritical),
    pUnder1kmTip: ['Technical: share of past events at the same lead time and miss distance whose final miss was under 1 km, the brief’s dangerous distance.'],
    pCriticalTip: [
      'Technical: chance the event ends Critical, the brief’s top tier (final Pc at least 1e-4 or miss under 1 km), when a burn is considered.',
      'From past events at the same lead time and distance that also shared today’s Pc band (' + PC_BAND_TXT[fc.pcBand] + ').',
    ],
    footnote:
      'Based on how similar past events moved from the same point. The range held ' +
      inTen(fc.coverage).replace(' in ', ' times out of ') + ' on ' + fc.heldOut.toLocaleString('en-US') + ' events held back for testing. The brief scores predictions made 2 or more days out; Needle updates this at every message.',
  };
}

/** pcForecast bin: 0 at the floor, then 1 below 1e-10, 2 for 1e-10 to 1e-6, 3 for 1e-6 to 1e-4, 4 at or above 1e-4. */
export function pcBinOf(f: NonNullable<Forecast['pcForecast']>, risk: number): number {
  return risk <= f.floorLog10 ? 0 : 1 + binOf([-Infinity, ...f.pcBinEdgesLog10, null], risk);
}

const PC_BIN_TXT = ['too small to compute', 'below 1e-10', 'from 1e-10 to 1e-6', 'from 1e-6 to 1e-4', 'at or above 1e-4'];

export interface PcOutlook {
  /** Days from the latest message to closest approach. */
  leadDays: number;
  pcBin: number;
  cell: PcForecastCell;
  /** The latest message's log10 Pc. */
  risk: number;
  /** "3 to 5 days": the lead-time bin the cell covers. */
  leadTxt: string;
  /** Share of held-out events that ended at or below the ceiling; null in an older forecast.json. */
  ceilingHeld: number | null;
}

/** Pc outlook for an open event from the latest message seen by T, or null when it has passed or there is no pcForecast. */
export function pcForecastAt(f: Forecast | null | undefined, e: ReplayEvent, s: KnownState): PcOutlook | null {
  const pf = f?.pcForecast;
  if (!f || !pf || s.phase !== 'open') return null;
  const [arrivalH, risk] = s.last;
  const leadDays = (e.tca - arrivalH) / 24;
  if (leadDays < 0) return null;
  const lb = binOf(f.leadEdgesDays, leadDays);
  const pcBin = pcBinOf(pf, risk);
  const cell = pf.cells[pcBin]?.[lb];
  if (!cell) return null;
  const lo = f.leadEdgesDays[lb] ?? 0;
  const hi = f.leadEdgesDays[lb + 1];
  const leadTxt = hi == null ? lo + '+ days' : lo === 0 ? 'under ' + hi + (hi === 1 ? ' day' : ' days') : lo + ' to ' + hi + ' days';
  return { leadDays, pcBin, cell, risk, leadTxt, ceilingHeld: f.validation.pcForecast?.ceilingHeld ?? null };
}

export interface PcOutlookKey {
  /** Swatch: the dashed ceiling, the grey fade, the floor band or the ring. */
  kind: 'ceiling' | 'fade' | 'floor' | 'ring';
  /** Plain words for a judge at a glance; the technical terms are in the card. */
  label: string;
  title: string;
  tip: string[];
}

export interface PcOutlookText {
  /** In drawing order: ceiling, fall to almost zero (or already negligible), still high at closest approach. */
  keys: PcOutlookKey[];
  note: string;
  /** Hover card of the note: the sample behind the numbers. */
  noteTip: string[];
}

export const PC_NOTE = 'Collision risk rarely goes up from here. It usually stays the same or drops as better tracking arrives.';

/** Plain labels for the Pc outlook, with probabilities as odds. */
export function pcOutlookText(po: PcOutlook): PcOutlookText {
  const c = po.cell;
  const n = c.n.toLocaleString('en-US');
  const keys: PcOutlookKey[] = [];
  if (po.pcBin !== 0 && c.ceilingDelta != null) {
    const top = po.risk + c.ceilingDelta;
    keys.push({
      kind: 'ceiling',
      label: 'worst likely: ' + (pcOdds(top) ?? 'negligible'),
      title: 'Worst likely',
      tip: [
        '9 out of 10 similar past events ended at or below this risk.',
        'Technical: Pc ceiling ' + pcTxt(top) + ', today’s Pc ' + pcTxt(po.risk) + (c.ceilingDelta < 0 ? ' lowered' : ' raised') + ' by ' + Math.abs(c.ceilingDelta).toFixed(2) + ' orders of magnitude (ceilingDelta)' +
          (po.ceilingHeld != null ? '; held on ' + (po.ceilingHeld * 100).toFixed(1) + '% of held-out events.' : '.'),
      ],
    });
    keys.push({
      kind: 'fade',
      label: pctTxt(c.pFloor) + ' chance the risk drops to almost zero',
      title: 'Drops to almost zero',
      tip: ['As tracking improves, the collision risk often turns out to be negligible.', 'Technical: share of ' + n + ' similar past events whose final Pc was too small to compute (the 1e-30 floor).'],
    });
  } else {
    keys.push({
      kind: 'floor',
      label: 'Risk is already negligible; ' + pctTxt(c.pFloor) + ' stay that way.',
      title: 'Already negligible',
      tip: ['Technical: today’s Pc is at the 1e-30 floor, too small to compute. ' + pctTxt(c.pFloor) + ' of ' + n + ' similar past events ended there.'],
    });
  }
  if (c.pAtLeast1e4 >= 0.01) {
    keys.push({
      kind: 'ring',
      label: pctTxt(c.pAtLeast1e4) + ' chance it’s still high at closest approach',
      title: 'Still high at closest approach',
      tip: ['Technical: chance the final Pc is at or above 1e-4, the action threshold. The ring sits on the 1e-4 line at closest approach, filled to that chance.'],
    });
  }
  return {
    keys,
    note: PC_NOTE,
    noteTip: [
      'Technical: from ' + n + ' past events with Pc ' + PC_BIN_TXT[po.pcBin] + ', ' + (c.pooledOverLead ? 'pooled over all lead times.' : po.leadTxt + ' before closest approach.'),
      pctTxt(c.pFloor) + ' ended too small to compute, ' + pctTxt(c.pBelow1e6) + ' below 1e-6 and ' + pctTxt(c.pAtLeast1e4) + ' at or above 1e-4.',
    ],
  };
}
