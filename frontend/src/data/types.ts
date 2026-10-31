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

export type OptionKey = 'coa1' | 'coa2' | 'coa3';

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

export interface ConsoleData {
  fleet: Fleet;
  replay: Replay;
  metrics: Metrics | null;
}
