// Orbit context globe. Orientation is illustrative: RAANs are spread evenly and altitudes are exaggerated 3×.

import type { CoaOption, Mission } from '../data/types';
import { clamp, dotPath } from './format';
import type { KnownRow, Row } from './run';
import { BUCKET_COLOR, C } from './theme';

export interface GlobeView {
  grat: string;
  backDim: string;
  backSel: string;
  frontDim: string;
  frontSel: string;
  dots: [string, string, string, string];
  chaser: string;
  ahead: string;
  prop: string;
  icoPanels: string;
  icoBody: string;
  evRing: string;
  evDot: string;
  evColor: string;
  selPanels: string;
  selBody: string;
}

const Re = 6371;
const EX = 3;
const CX = 450;
const SC = 420 / (Re + 1200 * EX);
const cs = Math.cos(0.6);
const ss = Math.sin(0.6);
const ct = Math.cos(0.38);
const stl = Math.sin(0.38);

/** [x, y, visible, depth] in the 900 × 900 view box. */
type Pt = [number, number, boolean, number];

function proj(x: number, y: number, z: number): Pt {
  const x1 = x * cs - y * ss;
  const y1 = x * ss + y * cs;
  const y2 = y1 * ct - z * stl;
  const z2 = y1 * stl + z * ct;
  return [CX + x1 * SC, CX - z2 * SC, y2 < 0 || Math.hypot(x1, z2) > Re + 1, y2];
}

function orbit3(r: number, inc: number, raan: number, u: number): [number, number, number] {
  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  return [r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si];
}

const orbitPt = (r: number, inc: number, raan: number, u: number) => proj(...orbit3(r, inc, raan, u));

/** Polyline through the points on one side of the globe (front when want is true). */
function pathOf(pts: Pt[], want: boolean): string {
  let s = '';
  let pen = false;
  for (const p of pts) {
    if (p[2] === want) {
      s += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      pen = true;
    } else pen = false;
  }
  return s;
}

/** Deterministic pseudo-random in [0, 1) for scattering event dots. */
const hash = (n: number, s: number) => {
  const x = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function glyph(cx: number, cy: number, ang: number, s: number) {
  const c = Math.cos(ang + Math.PI / 2);
  const sn = Math.sin(ang + Math.PI / 2);
  const T = (x: number, y: number) => (cx + (x * c - y * sn) * s).toFixed(1) + ',' + (cy + (x * sn + y * c) * s).toFixed(1);
  const rect = (x0: number, y0: number, x1: number, y1: number) => 'M' + T(x0, y0) + 'L' + T(x1, y0) + 'L' + T(x1, y1) + 'L' + T(x0, y1) + 'Z';
  return { panels: rect(-15, -2.6, -5.5, 2.6) + rect(5.5, -2.6, 15, 2.6), body: rect(-3.4, -3.4, 3.4, 3.4) };
}

function heading(r: number, inc: number, raan: number, u: number) {
  const p1 = orbitPt(r, inc, raan, u - 0.01);
  const p2 = orbitPt(r, inc, raan, u + 0.01);
  return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
}

let gratCache: string | null = null;

export function graticule(): string {
  if (gratCache) return gratCache;
  let gr = '';
  for (const lat of [-60, -30, 0, 30, 60]) {
    const la = (lat * Math.PI) / 180;
    const pts: Pt[] = [];
    for (let k = 0; k <= 96; k++) {
      const lo = (k / 96) * 2 * Math.PI;
      pts.push(proj(Re * Math.cos(la) * Math.cos(lo), Re * Math.cos(la) * Math.sin(lo), Re * Math.sin(la)));
    }
    gr += pathOf(pts, true);
  }
  for (let q = 0; q < 12; q++) {
    const lo = (q / 12) * 2 * Math.PI;
    const pts: Pt[] = [];
    for (let k = 0; k <= 48; k++) {
      const la = -Math.PI / 2 + (k / 48) * Math.PI;
      pts.push(proj(Re * Math.cos(la) * Math.cos(lo), Re * Math.cos(la) * Math.sin(lo), Re * Math.sin(la)));
    }
    gr += pathOf(pts, true);
  }
  gratCache = gr;
  return gr;
}

const DOT_CODE: Record<string, 0 | 1 | 2 | 3> = { pc: 3, hidden: 2, distance: 1, elevated: 1, quiet: 0 };
const DOT_SIZE = [3, 5, 6.5, 9];

export interface GlobeInput {
  missions: Mission[];
  open: KnownRow[];
  /** Selected event row, when it has been reported. */
  sel: Row | null;
  opt: CoaOption | null;
}

export function buildGlobe({ missions, open, sel, opt }: GlobeInput): GlobeView {
  const g: GlobeView = {
    grat: graticule(),
    backDim: '',
    backSel: '',
    frontDim: '',
    frontSel: '',
    dots: ['', '', '', ''],
    chaser: '',
    ahead: '',
    prop: '',
    icoPanels: '',
    icoBody: '',
    evRing: '',
    evDot: '',
    evColor: C.risk,
    selPanels: '',
    selBody: '',
  };
  const selSat = sel ? sel.e.sat : null;
  let selOrbit: { r: number; inc: number; raan: number } | null = null;
  const orbits = missions.map((mm, k) => {
    const r = Re + mm.alt * EX;
    const inc = (mm.inc * Math.PI) / 180;
    const raan = (k / missions.length) * Math.PI;
    const pts: Pt[] = [];
    for (let j = 0; j <= 120; j++) pts.push(orbitPt(r, inc, raan, (j / 120) * 2 * Math.PI));
    if (mm.label === selSat) {
      g.frontSel += pathOf(pts, true);
      g.backSel += pathOf(pts, false);
      selOrbit = { r, inc, raan };
    } else {
      g.frontDim += pathOf(pts, true);
      g.backDim += pathOf(pts, false);
      const u = (k * 2.39996) % (2 * Math.PI);
      const p = orbitPt(r, inc, raan, u);
      if (p[2]) {
        const gl = glyph(p[0], p[1], heading(r, inc, raan, u), 1.4);
        g.icoPanels += gl.panels;
        g.icoBody += gl.body;
      }
    }
    return { r, inc, raan };
  });
  for (const x of open) {
    if (sel && x.e.id === sel.e.id) continue;
    const o = orbits[x.e.mi];
    if (!o) continue;
    const p = orbitPt(o.r + (hash(x.e.id, 3) - 0.5) * 120, (x.e.inc * Math.PI) / 180, o.raan + (hash(x.e.id, 1) - 0.5) * 0.3, hash(x.e.id, 2) * 2 * Math.PI);
    const cd = DOT_CODE[x.s.bucket];
    if (p[2]) g.dots[cd] += dotPath(p[0], p[1], DOT_SIZE[cd]);
  }
  const so = selOrbit as { r: number; inc: number; raan: number } | null;
  if (sel && sel.s.phase !== 'future' && so) {
    const s = sel.s;
    g.evColor = s.phase === 'resolved' ? C.muted : (BUCKET_COLOR[s.bucket] ?? C.risk);
    let uEv = 0;
    let best = Infinity;
    for (let k = 0; k < 72; k++) {
      const u = (k / 72) * 2 * Math.PI;
      const p = orbitPt(so.r, so.inc, so.raan, u);
      if (p[3] < best) {
        best = p[3];
        uEv = u;
      }
    }
    const evP = orbitPt(so.r, so.inc, so.raan, uEv);
    g.evRing = dotPath(evP[0], evP[1], 22);
    g.evDot = dotPath(evP[0], evP[1], 9);
    if (s.phase === 'open') {
      const uSat = uEv - 1.3;
      const ahead: Pt[] = [];
      for (let j = 0; j <= 40; j++) ahead.push(orbitPt(so.r, so.inc, so.raan, uSat + (j / 40) * (uEv - uSat)));
      g.ahead = pathOf(ahead, true);
      const sP = orbitPt(so.r, so.inc, so.raan, uSat);
      if (sP[2]) {
        const gl = glyph(sP[0], sP[1], heading(so.r, so.inc, so.raan, uSat), 3.2);
        g.selPanels = gl.panels;
        g.selBody = gl.body;
      }
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
      const deb: Pt[] = [];
      for (let j = 0; j <= 50; j++) deb.push(orbitPt(R, ic, cand.raan, cand.u - 0.9 + (j / 50) * 1.3));
      g.chaser = pathOf(deb, true);
      if (opt) {
        const uB = opt.key === 'coa3' ? uEv - 0.6 : uSat;
        const bump = clamp((Math.abs(opt.dT) / 1000) * 90, 60, 700);
        const pts: Pt[] = [];
        for (let j = 0; j <= 60; j++) {
          const u = uB + (j / 60) * (uEv + 0.4 - uB);
          const ww = clamp((u - uB) / (uEv - uB), 0, 1);
          pts.push(orbitPt(so.r + bump * ww * ww * (3 - 2 * ww), so.inc, so.raan, u));
        }
        g.prop = pathOf(pts, true);
      }
    }
  }
  return g;
}
