// Shapes from contracts/README.md. Only the fields the console reads are required.

export interface Mission {
  mid: number;
  label: string;
  alt: number;
  inc: number;
  evTrain: number;
  evTest: number;
  pc: number;
  hidden: number;
  distance: number;
  critical: number;
  elevated: number;
  safe: number;
  topId: number;
  topRisk: number;
  topMiss: number;
}

export interface Fleet {
  missions: Mission[];
  dots: [number, number, number, number, number][];
  pcEvents: unknown[];
}

/** Relative position of the chaser in the target's RTN frame at closest approach, m. */
export type Rtn = [r: number, t: number, n: number];

/** One CDM: [arrival hours from replay start, log10 Pc (floor -30), miss distance m]. */
export type Cdm = [arrivalH: number, risk: number, missM: number];

export type OptionKey = 'coa1' | 'coa2' | 'coa3' | 'coa4';

export interface CoaOption {
  key: OptionKey;
  feasible: boolean;
  dv: number;
  alpha: number;
  beta: number;
  leadH: number;
  pcAfter: number;
  missAfter: number;
  dR: number;
  dT: number;
  dN: number;
  burnS: number;
  propG: number;
  dA: number;
  m2After: [number, number];
}

export interface Coa {
  risk: number;
  miss: number;
  tca: number;
  relSpeed: number;
  crossDeg: number;
  altKm: number;
  m2: [number, number];
  ell: { a: number; b: number; deg: number };
  hbrEff: number;
  pcModelOk: boolean;
  /** Nominal post-burn miss that keeps the forecast 10th percentile at or above 1 km (coa4's target), m. */
  robustMissM?: number;
  wait: [hoursAfterCdm: number, dvMmS: number | null][];
  opts: CoaOption[];
}

export interface ReplayEvent {
  id: number;
  sat: string;
  mi: number;
  obj: string;
  inc: number;
  tca: number;
  m: Cdm[];
  coa: Record<string, Coa>;
  /** Relative position per CDM, aligned with m. Optional so an older replay.json still loads. */
  rtn?: Rtn[];
}

export interface Replay {
  runs: number;
  runH: number;
  windowH: number;
  note: string;
  events: ReplayEvent[];
}

export interface Metrics {
  generatedAt?: string;
  test?: { rows?: number; methods?: { name: string; accuracy: number; macroF1: number; criticalRecall: number; criticalPrecision: number }[] };
  physics?: { pcEvents?: number; within002?: number; medianAbsErr?: number };
  replay?: { events?: number; escalated?: number; coaMessages?: number; pcModelWithin01?: number; medianWaitRatio24h?: number };
}

export interface ForecastCell {
  n: number;
  ratioQ10: number;
  ratioQ50: number;
  ratioQ90: number;
  pUnder1km: number;
  pCritical: number;
  pooled: boolean;
}

/** contracts/README.md § forecast.json: how far the miss can still move before closest approach. */
export interface Forecast {
  /** Lead-time bin edges, days; null is open-ended. */
  leadEdgesDays: (number | null)[];
  /** Current-miss bin edges, m; null is open-ended. */
  missEdgesM: (number | null)[];
  quantiles: number[];
  /** cells[leadBin][missBin]. */
  cells: ForecastCell[][];
  robustRatioQ10: number[];
  /** Chance of ending Critical by the latest message's Pc band, then lead and miss bins. p is null with too little history. */
  pCriticalByPc?: { p: number | null; n: number; pooledOver?: string }[][][];
  /** Pc band edges, log10: below the first is band 0, between is band 1, at or above the last is band 2. */
  pcEdgesLog10?: number[];
  validation: { heldOutEvents: number; coverage10to90: number; coverageByLeadBin?: Record<string, number> };
}

export interface ConsoleData {
  fleet: Fleet;
  replay: Replay;
  metrics: Metrics | null;
  /** Optional: the console shows no forecast without it. */
  forecast?: Forecast | null;
}
