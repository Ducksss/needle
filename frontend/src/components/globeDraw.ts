// Canvas drawing of the orbit globe for one frame. Pure drawing: no React, no timers.

import { type GeoPermissibleObjects, geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { DOT_COLOR, DOT_SIZE, EARTH_R, type GlobeLapse, type GlobeScene, type Icon, type Pt, VIEW, type Vec3, type View, d3Rotation, iconAt, orbit3, phaseAt, project } from '../model/globe';
import { easeOut } from '../model/lapse';

/** Natural Earth 110 m land, bundled through world-atlas. */
const LAND = feature(land110, land110.objects.land) as GeoPermissibleObjects;
const GRATICULE = geoGraticule().step([30, 30])();
const SPHERE: GeoPermissibleObjects = { type: 'Sphere' };

const PULSE_MS = 1800;
const SEL_PULSE_MS = 1600;
const BLINK_MS = 1700;

/** Strokes the runs of points on one side of the globe (front when want is true). */
function polyline(ctx: CanvasRenderingContext2D, pts: Vec3[], v: View, want: boolean) {
  ctx.beginPath();
  let pen = false;
  for (const p of pts) {
    const q = project(p, v);
    if (q[2] === want) {
      if (pen) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
      pen = true;
    } else pen = false;
  }
  ctx.stroke();
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, dash: number[] = [], alpha = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.globalAlpha = alpha;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
}

/** Satellite glyph: a body and two panels, turned to face its motion on screen. */
function glyph(ctx: CanvasRenderingContext2D, ic: { p: Vec3; prev: Vec3; next: Vec3 }, v: View, scale: number, line: string, body: string, lineW: number): Pt | null {
  const q = project(ic.p, v);
  if (!q[2]) return null;
  const a = project(ic.prev, v);
  const b = project(ic.next, v);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
  ctx.save();
  ctx.translate(q[0], q[1]);
  ctx.rotate(ang);
  ctx.scale(scale, scale);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = line;
  ctx.lineWidth = lineW / scale;
  ctx.lineJoin = 'round';
  for (const x0 of [-15, 5.5]) {
    ctx.beginPath();
    ctx.rect(x0, -2.6, 9.5, 5.2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = body;
  ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
  ctx.restore();
  return q;
}

/**
 * Nav light: the satellite's body flashes once per cycle, then fades. It sits on the body rather than beside it, so
 * it cannot be read as a conjunction dot. Off under reduced motion.
 */
function navLight(ctx: CanvasRenderingContext2D, q: Pt, tMs: number, offset: number, size: number) {
  const ph = phaseAt(tMs, BLINK_MS, offset);
  const a = ph < 0.3 ? 1 - ph / 0.3 : 0;
  if (a <= 0) return;
  ctx.setLineDash([]);
  ctx.fillStyle = '#F97316';
  ctx.globalAlpha = 0.22 * a;
  circle(ctx, q[0], q[1], size * 2.4);
  ctx.fill();
  ctx.globalAlpha = a;
  circle(ctx, q[0], q[1], size);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A short trail behind a moving satellite, fading toward its tail. trail is the arc length, radians, signed by motion. */
function trailOf(ctx: CanvasRenderingContext2D, ic: Icon, phase: number, trail: number, v: View) {
  const steps = 10;
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 4;
  for (let j = 0; j < steps; j++) {
    const u0 = ic.u0 + phase - (trail * (j + 1)) / steps;
    const u1 = ic.u0 + phase - (trail * j) / steps;
    const a = project(orbit3(ic.r, ic.inc, ic.raan, u0), v);
    const b = project(orbit3(ic.r, ic.inc, ic.raan, u1), v);
    if (!a[2] || !b[2]) continue;
    ctx.globalAlpha = 0.5 * (1 - j / steps);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

/** New events burst in with a bright ring; passed events fade, with a red flash when they passed unmitigated. */
function lapseMarks(ctx: CanvasRenderingContext2D, lapse: GlobeLapse, p: number, v: View) {
  const e = easeOut(p);
  ctx.setLineDash([]);
  for (const m of lapse.arrived) {
    const q = project(m.p, v);
    if (!q[2]) continue;
    stroke(ctx, m.color, 5, [], 0.9 * (1 - p));
    circle(ctx, q[0], q[1], 10 + 70 * e);
    ctx.stroke();
    ctx.globalAlpha = 0.85 * (1 - p);
    ctx.fillStyle = '#FFFFFF';
    circle(ctx, q[0], q[1], 14 * (1 - e) + 4);
    ctx.fill();
  }
  for (const m of lapse.passed) {
    const q = project(m.p, v);
    if (!q[2]) continue;
    if (m.unmitigated && p < 0.7) {
      stroke(ctx, '#DC2626', 5, [], 0.9 * (1 - p / 0.7));
      circle(ctx, q[0], q[1], 12 + 50 * e);
      ctx.stroke();
    }
    ctx.globalAlpha = 1 - e;
    ctx.fillStyle = m.color;
    circle(ctx, q[0], q[1], 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export interface DrawOpts {
  /** Canvas pixels per drawing unit. */
  px: number;
  tMs: number;
  /** False under prefers-reduced-motion: static rings, steady lights. */
  motion: boolean;
  /** Satellite phase along the orbits, radians; advances with replay time. */
  phase: number;
  /** Trail arc behind each satellite while it moves, radians; 0 when settled. */
  trail: number;
  /** Lapse effects in progress, with their linear progress in [0, 1]. */
  lapse: { marks: GlobeLapse; p: number } | null;
}

export function drawGlobe(ctx: CanvasRenderingContext2D, scene: GlobeScene, v: View, { px, tMs, motion, phase, trail, lapse }: DrawOpts) {
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.clearRect(0, 0, VIEW, VIEW);
  ctx.lineCap = 'butt';
  const proj = geoOrthographic().scale(EARTH_R).translate([VIEW / 2, VIEW / 2]).rotate(d3Rotation(v)).clipAngle(90);
  const path = geoPath(proj, ctx);

  for (const o of scene.orbits) {
    if (o.selected) stroke(ctx, '#0F172A', 1.5, [], 0.25);
    else stroke(ctx, '#E6EBF0', 1.5);
    polyline(ctx, o.pts, v, false);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  path(SPHERE);
  ctx.fillStyle = '#EDF1F5';
  ctx.fill();
  stroke(ctx, '#CBD5E1', 2);
  ctx.stroke();
  ctx.beginPath();
  path(GRATICULE);
  stroke(ctx, '#DAE1E8', 1.2);
  ctx.stroke();
  ctx.beginPath();
  path(LAND);
  ctx.fillStyle = '#DEE4EA';
  ctx.fill();
  stroke(ctx, '#C9D2DC', 1.2);
  ctx.stroke();

  stroke(ctx, '#AAB7C6', 1.5);
  for (const o of scene.orbits) if (!o.selected) polyline(ctx, o.pts, v, true);

  for (const d of scene.dots) {
    const q = project(d.p, v);
    if (!q[2]) continue;
    const r = DOT_SIZE[d.code];
    if (d.code > 0) {
      const ph = motion ? phaseAt(tMs, PULSE_MS, d.pulse) : 0.45;
      stroke(ctx, DOT_COLOR[d.code], 2, [], motion ? 0.55 * (1 - ph) : 0.35);
      circle(ctx, q[0], q[1], r * (1.2 + 1.8 * ph));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = DOT_COLOR[d.code];
    circle(ctx, q[0], q[1], r);
    ctx.fill();
  }

  const sel = scene.sel;
  for (const o of scene.orbits) {
    if (!o.selected) continue;
    stroke(ctx, '#0F172A', 3);
    polyline(ctx, o.pts, v, true);
  }
  if (sel) {
    ctx.lineCap = 'round';
    stroke(ctx, '#C2410C', 5, [0.1, 12]);
    polyline(ctx, sel.chaser, v, true);
    stroke(ctx, '#0F172A', 5, [16, 11]);
    polyline(ctx, sel.ahead, v, true);
    stroke(ctx, '#6D28D9', 5, [14, 10]);
    polyline(ctx, sel.prop, v, true);
    ctx.lineCap = 'butt';
  }

  if (lapse) lapseMarks(ctx, lapse.marks, lapse.p, v);

  for (const o of scene.orbits) {
    if (!o.icon) continue;
    if (trail) trailOf(ctx, o.icon, phase, trail, v);
    const q = glyph(ctx, iconAt(o.icon, phase), v, 1.4, '#64748B', '#64748B', 1.5);
    if (q && motion) navLight(ctx, q, tMs, o.icon.blink, 4.5);
  }

  if (sel) {
    const q = project(sel.ev, v);
    if (q[2]) {
      if (sel.open) {
        const ph = motion ? phaseAt(tMs, SEL_PULSE_MS, sel.pulse) : 0.5;
        stroke(ctx, sel.color, 3, [], motion ? 0.7 * (1 - ph) : 0.3);
        circle(ctx, q[0], q[1], 22 + 44 * ph);
        ctx.stroke();
      }
      stroke(ctx, sel.color, 4);
      circle(ctx, q[0], q[1], 22);
      ctx.stroke();
      ctx.fillStyle = sel.color;
      circle(ctx, q[0], q[1], 9);
      ctx.fill();
    }
    if (sel.sat) {
      const s = glyph(ctx, iconAt(sel.sat, 0), v, 3.2, '#0F172A', '#0F172A', 2.5);
      if (s && motion) navLight(ctx, s, tMs, sel.sat.blink, 8);
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}
