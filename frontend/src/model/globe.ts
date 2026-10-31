// Orbit context globe. Orientation is illustrative: RAANs are spread evenly and altitudes are exaggerated 3×.
// The scene is built once per run and selection in 3D; the canvas layer rotates and projects it every frame.

import type { CoaOption, Mission, ReplayEvent } from '../data/types';
import type { Lapse } from './lapse';
import { clamp } from './format';
import type { KnownRow, Row } from './run';
import { BUCKET_COLOR, C } from './theme';

export type Vec3 = [number, number, number];

/** Earth radius, km. */
export const RE = 6371;
/** Altitude exaggeration so LEO orbits separate from the surface. */
const EX = 3;
/** View box of the globe drawing, in drawing units. */
export const VIEW = 900;
const CX = VIEW / 2;
/** Drawing units per km. */
export const SC = 420 / (RE + 1200 * EX);
/** Earth's radius in drawing units. */
export const EARTH_R = RE * SC;

/** Yaw spins the scene about Earth's axis; tilt leans the axis toward the viewer. Radians. */
export interface View {
  yaw: number;
  tilt: number;
}

/** The opening view, as in the reference drawing. */
export const VIEW0: View = { yaw: 0.6, tilt: 0.38 };
/** Auto-rotation: one turn per minute. */
export const SPIN_RAD_PER_S = (2 * Math.PI) / 60;
/** Fast-forward spin per replay hour, as Earth turns: 15° an hour. */
export const SPIN_RAD_PER_REPLAY_H = (15 * Math.PI) / 180;
/** Satellites advance along their orbits by this much per replay hour (illustrative, not orbital rate). */
export const SAT_RAD_PER_REPLAY_H = (12 * Math.PI) / 180;
export const TILT_LIMIT = 1.3;

/** [x, y, visible, depth] in the 900 × 900 view box; depth < 0 is the near side. */
export type Pt = [number, number, boolean, number];

export function project([x, y, z]: Vec3, v: View): Pt {
  const ca = Math.cos(v.yaw);
  const sa = Math.sin(v.yaw);
  const ct = Math.cos(v.tilt);
  const st = Math.sin(v.tilt);
  const x1 = x * ca - y * sa;
  const y1 = x * sa + y * ca;
  const y2 = y1 * ct - z * st;
  const z2 = y1 * st + z * ct;
  return [CX + x1 * SC, CX - z2 * SC, y2 < 0 || Math.hypot(x1, z2) > RE + 1, y2];
}

/** The d3-geo orthographic rotation (degrees) that shows the same view as project(). */
export const d3Rotation = (v: View): [number, number, number] => [((v.yaw + Math.PI / 2) * 180) / Math.PI, (-v.tilt * 180) / Math.PI, 0];

export function orbit3(r: number, inc: number, raan: number, u: number): Vec3 {
  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  return [r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si];
}

/** Deterministic pseudo-random in [0, 1), used to scatter event dots and offset their pulses. */
export const hash = (n: number, s: number) => {
  const x = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Pulse and blink phase in [0, 1) at time tMs, offset per item so lights do not flash in unison. */
export const phaseAt = (tMs: number, periodMs: number, offset: number) => (((tMs / periodMs + offset) % 1) + 1) % 1;

/** A satellite on its orbit. Its anomaly is u0 plus the shared phase, which advances with replay time. */
export interface Icon {
  r: number;
  inc: number;
  raan: number;
  u0: number;
  /** Blink offset for the nav light. */
  blink: number;
}

/** Icon position and two neighbours along the orbit, so the drawing can turn it to face its motion. */
export function iconAt(ic: Icon, phase: number, du = 0): { p: Vec3; prev: Vec3; next: Vec3 } {
  const u = ic.u0 + phase + du;
  return { p: orbit3(ic.r, ic.inc, ic.raan, u), prev: orbit3(ic.r, ic.inc, ic.raan, u - 0.01), next: orbit3(ic.r, ic.inc, ic.raan, u + 0.01) };
}

export interface OrbitLine {
  pts: Vec3[];
  selected: boolean;
  icon: Icon | null;
}

export type DotCode = 0 | 1 | 2 | 3;

export interface EventDot {
  id: number;
  p: Vec3;
  code: DotCode;
  pulse: number;
}

export interface SelectedScene {
  color: string;
  open: boolean;
  ev: Vec3;
  pulse: number;
  ahead: Vec3[];
  chaser: Vec3[];
  prop: Vec3[];
  sat: Icon | null;
}

export interface LapseMark {
  id: number;
  p: Vec3;
  color: string;
  unmitigated: boolean;
}

/** The fast-forward from the previous run: replay hours skipped, events first reported, events that passed. */
export interface GlobeLapse {
  key: string;
  dH: number;
  arrived: LapseMark[];
  passed: LapseMark[];
}

export interface GlobeScene {
  /** Replay time of this run, hours. */
  T: number;
  orbits: OrbitLine[];
  dots: EventDot[];
  sel: SelectedScene | null;
  lapse: GlobeLapse | null;
}

const DOT_CODE: Record<string, DotCode> = { pc: 3, hidden: 2, distance: 1, elevated: 1, quiet: 0 };
export const DOT_SIZE = [3, 5, 6.5, 9];
export const DOT_COLOR = ['#94A3B8', '#2563EB', '#A16207', '#C2410C'];

export interface GlobeInput {
  missions: Mission[];
  /** All replay events, to place the events that passed in a lapse. */
  events?: ReplayEvent[];
  T?: number;
  lapse?: Lapse | null;
  open: KnownRow[];
  /** Selected event row, when it has been reported. */
  sel: Row | null;
  opt: CoaOption | null;
}

const icon = (r: number, inc: number, raan: number, u0: number, blink: number): Icon => ({ r, inc, raan, u0, blink });

/** Where an event's dot sits: near its satellite's orbit, scattered deterministically by its id. */
function dotPos(o: { r: number; raan: number }, e: ReplayEvent): Vec3 {
  return orbit3(o.r + (hash(e.id, 3) - 0.5) * 120, (e.inc * Math.PI) / 180, o.raan + (hash(e.id, 1) - 0.5) * 0.3, hash(e.id, 2) * 2 * Math.PI);
}

/** The 3D scene for this run and selection. The selected event sits where its orbit faces the opening view. */
export function buildGlobeScene({ missions, events = [], T = 0, lapse = null, open, sel, opt }: GlobeInput): GlobeScene {
  const selSat = sel ? sel.e.sat : null;
  let selOrbit: { r: number; inc: number; raan: number } | null = null;
  const geo = missions.map((mm, k) => ({ r: RE + mm.alt * EX, inc: (mm.inc * Math.PI) / 180, raan: (k / missions.length) * Math.PI, label: mm.label, k }));
  const orbits = geo.map((o): OrbitLine => {
    const pts: Vec3[] = [];
    for (let j = 0; j <= 120; j++) pts.push(orbit3(o.r, o.inc, o.raan, (j / 120) * 2 * Math.PI));
    const selected = o.label === selSat;
    if (selected) selOrbit = { r: o.r, inc: o.inc, raan: o.raan };
    return { pts, selected, icon: selected ? null : icon(o.r, o.inc, o.raan, (o.k * 2.39996) % (2 * Math.PI), hash(o.k, 5)) };
  });
  const dots: EventDot[] = [];
  for (const x of open) {
    if (sel && x.e.id === sel.e.id) continue;
    const o = geo[x.e.mi];
    if (!o) continue;
    dots.push({ id: x.e.id, p: dotPos(o, x.e), code: DOT_CODE[x.s.bucket], pulse: hash(x.e.id, 4) });
  }
  let gl: GlobeLapse | null = null;
  if (lapse) {
    const byId = new Map(events.map((e) => [e.id, e]));
    const codeOf = new Map(open.map((x) => [x.e.id, DOT_CODE[x.s.bucket]]));
    const mark = (id: number, unmitigated: boolean, color: string): LapseMark[] => {
      const e = byId.get(id);
      const o = e ? geo[e.mi] : undefined;
      return e && o ? [{ id, p: dotPos(o, e), color, unmitigated }] : [];
    };
    gl = {
      key: lapse.key,
      dH: lapse.dH,
      arrived: lapse.arrived.flatMap((a) => mark(a.id, false, DOT_COLOR[codeOf.get(a.id) ?? 0])),
      passed: lapse.passed.flatMap((x) => mark(x.id, x.unmitigated, x.unmitigated ? C.alarm : C.faint)),
    };
  }
  const so = selOrbit as { r: number; inc: number; raan: number } | null;
  if (!sel || sel.s.phase === 'future' || !so) return { T, orbits, dots, sel: null, lapse: gl };

  const s = sel.s;
  let uEv = 0;
  let best = Infinity;
  for (let k = 0; k < 72; k++) {
    const u = (k / 72) * 2 * Math.PI;
    const d = project(orbit3(so.r, so.inc, so.raan, u), VIEW0)[3];
    if (d < best) {
      best = d;
      uEv = u;
    }
  }
  const scene: SelectedScene = {
    color: s.phase === 'resolved' ? C.muted : (BUCKET_COLOR[s.bucket] ?? C.risk),
    open: s.phase === 'open',
    ev: orbit3(so.r, so.inc, so.raan, uEv),
    pulse: hash(sel.e.id, 4),
    ahead: [],
    chaser: [],
    prop: [],
    sat: null,
  };
  if (s.phase === 'open') {
    const uSat = uEv - 1.3;
    for (let j = 0; j <= 40; j++) scene.ahead.push(orbit3(so.r, so.inc, so.raan, uSat + (j / 40) * (uEv - uSat)));
    scene.sat = icon(so.r, so.inc, so.raan, uSat, hash(sel.e.id, 6));
    const P = orbit3(so.r, so.inc, so.raan, uEv);
    const R = Math.hypot(P[0], P[1], P[2]);
    const phi = Math.asin(P[2] / R);
    const lam = Math.atan2(P[1], P[0]);
    const ic = (sel.e.inc * Math.PI) / 180;
    const su = clamp(Math.sin(phi) / Math.max(Math.sin(ic), 0.05), -1, 1);
    const wrap = (q: number) => Math.abs(Math.atan2(Math.sin(q), Math.cos(q)));
    const cand = [Math.asin(su), Math.PI - Math.asin(su)]
      .map((u) => ({ u, raan: lam - Math.atan2(Math.cos(ic) * Math.sin(u), Math.cos(u)) }))
      .sort((p1, p2) => wrap(p2.raan - so.raan) - wrap(p1.raan - so.raan))[0];
    for (let j = 0; j <= 50; j++) scene.chaser.push(orbit3(R, ic, cand.raan, cand.u - 0.9 + (j / 50) * 1.3));
    if (opt) {
      const uB = opt.key === 'coa3' ? uEv - 0.6 : uSat;
      const bump = clamp((Math.abs(opt.dT) / 1000) * 90, 60, 700);
      for (let j = 0; j <= 60; j++) {
        const u = uB + (j / 60) * (uEv + 0.4 - uB);
        const ww = clamp((u - uB) / (uEv - uB), 0, 1);
        scene.prop.push(orbit3(so.r + bump * ww * ww * (3 - 2 * ww), so.inc, so.raan, u));
      }
    }
  }
  return { T, orbits, dots, sel: scene, lapse: gl };
}
