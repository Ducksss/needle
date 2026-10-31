// Numbers quoted in the data notes and captions, computed from replay.json so they always match the data on screen.

import type { Replay } from '../data/types';

export interface ReplayFacts {
  events: number;
  /** Replay events with at least one CDM at Pc >= 1e-4. */
  escalated: number;
  /** CDMs with a burn plan (Pc >= 1e-4 and >= 3 h to TCA). */
  coaMessages: number;
  /** Of those, how many the Pc model reproduces within 0.1 orders of magnitude. */
  pcModelWithin01: number;
  /** Median of (lowest Δv one day later) / (lowest Δv now), across plans where both exist. */
  medianWaitRatio24h: number | null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function replayFacts(replay: Replay): ReplayFacts {
  const coas = replay.events.flatMap((e) => Object.values(e.coa));
  const ratios: number[] = [];
  for (const c of coas) {
    const now = c.wait[0]?.[1];
    const later = c.wait[4]?.[1];
    if (now != null && now > 0 && later != null) ratios.push(later / now);
  }
  return {
    events: replay.events.length,
    escalated: replay.events.filter((e) => e.m.some((m) => m[1] >= -4)).length,
    coaMessages: coas.length,
    pcModelWithin01: coas.filter((c) => c.pcModelOk).length,
    medianWaitRatio24h: median(ratios),
  };
}
