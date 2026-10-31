import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react';
import { type GlobeScene, SPIN_RAD_PER_S, TILT_LIMIT, VIEW, VIEW0, type View } from '../model/globe';
import { clamp } from '../model/format';
import { drawGlobe } from './globeDraw';

/** Auto-rotation resumes this long after a drag or key turn ends. */
const RESUME_MS = 3000;
const KEY_STEP = 0.18;

interface Live {
  view: View;
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
  const live = useRef<Live>({ view: { ...VIEW0 }, dragging: false, hover: false, resumeAt: 0, last: 0, dirty: true, reduced: false, visible: true, px: 1, pointer: null });

  useEffect(() => {
    sceneRef.current = scene;
    live.current.dirty = true;
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
      drawGlobe(ctx, sceneRef.current, s.view, { px: s.px, tMs: t, motion: !s.reduced });
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
