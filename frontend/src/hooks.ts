// Small hooks for the time-lapse: reduced-motion preference and an eased number.

import { useEffect, useRef, useState } from 'react';
import { LAPSE_MS, easeOut } from './model/lapse';

/** True while the user asks for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * A number that eases to each new target over the time-lapse. A new target mid-way starts from the value on screen,
 * so rapid changes coalesce instead of queueing. Under reduced motion it jumps.
 */
export function useTween(target: number, ms = LAPSE_MS): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const s = useRef({ from: target, to: target, t0: 0, shown: target, raf: 0 });
  useEffect(() => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    if (reduced || st.to === target) {
      st.from = st.to = st.shown = target;
      setShown(target);
      return;
    }
    st.from = st.shown;
    st.to = target;
    st.t0 = performance.now();
    const step = (t: number) => {
      const p = (t - st.t0) / ms;
      st.shown = st.from + (st.to - st.from) * easeOut(p);
      setShown(st.shown);
      if (p < 1) st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(st.raf);
  }, [target, reduced, ms]);
  return shown;
}

const PAD = 8;

/**
 * Keeps a host's hover card on screen: flips it up or down when it would leave the viewport vertically, and shifts it
 * sideways when it would leave horizontally. Runs on the frame after the card becomes visible.
 */
export function fitCard(host: Element | null) {
  const tt = host?.querySelector<HTMLElement>(':scope > .tt');
  if (!host || !tt) return;
  tt.style.transform = '';
  tt.classList.remove('tt-up', 'tt-down');
  requestAnimationFrame(() => {
    let r = tt.getBoundingClientRect();
    if (!r.width) return;
    const h = host.getBoundingClientRect();
    const up = r.bottom <= h.top + 1;
    if (!up && r.bottom > window.innerHeight - PAD && h.top - r.height - 6 > PAD) tt.classList.add('tt-up');
    else if (up && r.top < PAD && h.bottom + r.height + 6 < window.innerHeight - PAD) tt.classList.add('tt-down');
    r = tt.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - PAD) dx = window.innerWidth - PAD - r.right;
    if (r.left + dx < PAD) dx = PAD - r.left;
    if (dx) tt.style.transform = `translateX(${Math.round(dx)}px)`;
  });
}

/** Fits every hover card as it opens, by pointer or keyboard focus. */
export function useHoverCardFit() {
  useEffect(() => {
    const on = (e: Event) => fitCard((e.target as Element | null)?.closest?.('.tw') ?? null);
    document.addEventListener('pointerover', on);
    document.addEventListener('focusin', on);
    return () => {
      document.removeEventListener('pointerover', on);
      document.removeEventListener('focusin', on);
    };
  }, []);
}
