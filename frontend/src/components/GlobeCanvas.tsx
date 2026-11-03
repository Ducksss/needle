import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react';
import { type GlobeLapse, type GlobeScene, SAT_RAD_PER_REPLAY_H, SPIN_RAD_PER_REPLAY_H, SPIN_RAD_PER_S, TILT_LIMIT, VIEW, VIEW0, type View } from '../model/globe';
import { LAPSE_MS, easeOut, visibleTurn } from '../model/lapse';
import { clamp } from '../model/format';
import { drawGlobe } from './globeDraw';

/** Auto-rotation resumes this long after a drag or key turn ends. */
const RESUME_MS = 3000;
const KEY_STEP = 0.18;

/** A value easing from one number to another over LAPSE_MS. */
interface Tween {
  from: number;
  to: number;
  t0: number;
}

const tweenAt = (tw: Tween, now: number) => tw.from + (tw.to - tw.from) * easeOut((now - tw.t0) / LAPSE_MS);

interface Live {
  view: View;
  /** Fast-forward spin added to the view's yaw. */
  spin: Tween;
  /** Satellite phase along the orbits. */
  phase: Tween;
  effects: { marks: GlobeLapse; t0: number } | null;
  lastKey: string | null;
  started: boolean;
  dragging: boolean;
  hover: boolean;
  resumeAt: number;
  last: number;
  dirty: boolean;
  reduced: boolean;
  visible: boolean;
  px: number;
  pointer: { x: number; y: number } | null;
}

/**
 * The orbit globe on a canvas. It spins once a minute, turns by drag or arrow keys, and pulses open conjunctions.
 * Only this canvas redraws each frame; React re-renders only when the scene changes.
 */
export function GlobeCanvas({ scene, label }: { scene: GlobeScene; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const live = useRef<Live>({ view: { ...VIEW0 }, spin: { from: 0, to: 0, t0: 0 }, phase: { from: 0, to: 0, t0: 0 }, effects: null, lastKey: null, started: false, dragging: false, hover: false, resumeAt: 0, last: 0, dirty: true, reduced: false, visible: true, px: 1, pointer: null });

  useEffect(() => {
    sceneRef.current = scene;
    const s = live.current;
    s.dirty = true;
    if (!s.started) {
      // First scene: satellites start where this run's replay time puts them, with nothing to animate.
      const ph = SAT_RAD_PER_REPLAY_H * scene.T;
      s.phase = { from: ph, to: ph, t0: 0 };
      s.started = true;
      s.lastKey = scene.lapse?.key ?? null;
      return;
    }
    const lapse = scene.lapse;
    if (!lapse || lapse.key === s.lastKey) return;
    s.lastKey = lapse.key;
    // Coalesce: always ease from what is on screen now to the latest target; nothing queues.
    const now = performance.now();
    const ease = (tw: Tween, add: number): Tween => {
      const to = tw.to + add;
      return s.reduced ? { from: to, to, t0: now } : { from: tweenAt(tw, now), to, t0: now };
    };
    s.spin = ease(s.spin, visibleTurn(SPIN_RAD_PER_REPLAY_H * lapse.dH));
    s.phase = ease(s.phase, visibleTurn(SAT_RAD_PER_REPLAY_H * lapse.dH));
    s.effects = !s.reduced && lapse.dH > 0 ? { marks: lapse, t0: now } : null;
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const s = live.current;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    s.reduced = mq.matches;
    const onMotion = () => {
      s.reduced = mq.matches;
      // Turning reduced motion on mid-transition snaps to the end state, as a scene change does under reduced motion.
      if (s.reduced) {
        const now = performance.now();
        s.spin = { from: s.spin.to, to: s.spin.to, t0: now };
        s.phase = { from: s.phase.to, to: s.phase.to, t0: now };
        s.effects = null;
      }
      s.dirty = true;
    };
    mq.addEventListener('change', onMotion);
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      s.px = (size * dpr) / VIEW;
      s.dirty = true;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();
    const io = new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting;
      s.dirty = true;
    });
    io.observe(canvas);
    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = s.last ? Math.min(100, t - s.last) : 0;
      s.last = t;
      if (!s.visible) return;
      if (!s.reduced && !s.dragging && !s.hover && t >= s.resumeAt) s.view.yaw += (SPIN_RAD_PER_S * dt) / 1000;
      if (s.reduced && !s.dirty) return;
      const ph = tweenAt(s.phase, t);
      const p = (t - s.phase.t0) / LAPSE_MS;
      // The trail follows the remaining speed of the ease, so it shrinks to nothing as satellites settle.
      const trail = p < 1 ? Math.max(-0.7, Math.min(0.7, (s.phase.to - s.phase.from) * 0.35 * (1 - p) * (1 - p))) : 0;
      const fx = s.effects && t - s.effects.t0 < LAPSE_MS ? { marks: s.effects.marks, p: (t - s.effects.t0) / LAPSE_MS } : null;
      if (!fx) s.effects = null;
      const view = { yaw: s.view.yaw + tweenAt(s.spin, t), tilt: s.view.tilt };
      drawGlobe(ctx, sceneRef.current, view, { px: s.px, tMs: t, motion: !s.reduced, phase: ph, trail, lapse: fx });
      s.dirty = false;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', onMotion);
    };
  }, []);

  const turn = (dYaw: number, dTilt: number) => {
    const s = live.current;
    s.view.yaw += dYaw;
    s.view.tilt = clamp(s.view.tilt + dTilt, -TILT_LIMIT, TILT_LIMIT);
    s.dirty = true;
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current.dragging = true;
    live.current.pointer = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s.dragging || !s.pointer) return;
    const k = Math.PI / Math.max(1, e.currentTarget.clientWidth);
    turn((e.clientX - s.pointer.x) * k, (e.clientY - s.pointer.y) * k);
    s.pointer = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    const s = live.current;
    s.dragging = false;
    s.pointer = null;
    s.resumeAt = performance.now() + RESUME_MS;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[e.key];
    if (!step) return;
    e.preventDefault();
    turn(step[0], step[1]);
    live.current.resumeAt = performance.now() + RESUME_MS;
  };

  return (
    <canvas
      ref={canvasRef}
      className="fill globe-canvas"
      role="img"
      aria-label={label + ' Drag, or focus and use the arrow keys, to turn the globe.'}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => (live.current.hover = true)}
      onPointerLeave={() => (live.current.hover = false)}
      onKeyDown={onKeyDown}
    />
  );
}
