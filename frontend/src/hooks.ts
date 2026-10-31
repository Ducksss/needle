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
