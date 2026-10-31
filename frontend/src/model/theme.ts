// Colour roles from the A3+ visual system (frontend/README.md).

export const C = {
  ink: '#0F172A',
  risk: '#C2410C',
  watch: '#2563EB',
  hidden: '#B45309',
  action: '#6D28D9',
  ok: '#0F766E',
  muted: '#64748B',
  slate: '#475569',
  faint: '#94A3B8',
  border: '#E3E8EE',
  alarm: '#DC2626',
  burnt: '#F97316',
  overdue: '#991B1B',
} as const;

/** Colour for a Needle bucket, used on Pc values and globe dots. */
export const BUCKET_COLOR: Record<string, string> = {
  pc: C.risk,
  hidden: C.hidden,
  distance: C.watch,
  // Teal is kept for approved and safe states, so the general watch bucket reads neutral.
  elevated: '#334155',
  quiet: C.faint,
};

/** Colour of a Pc value by its own band: Critical orange, Elevated amber, otherwise muted. */
export const pcColor = (risk: number) => (risk >= -4 ? C.risk : risk >= -6 ? C.hidden : C.muted);

/** Colour of a miss distance by its own band: under 1 km orange, 1 to 5 km amber, otherwise muted. */
export const missColor = (m: number) => (m < 1000 ? C.risk : m <= 5000 ? C.hidden : C.muted);

export interface Tone {
  bg: string;
  fg: string;
}

export const TONE = {
  decide: { bg: '#FDE8DD', fg: '#9A3412' },
  deferred: { bg: '#EDE9FE', fg: '#5B21B6' },
  approved: { bg: '#CCFBF1', fg: '#115E59' },
  downgraded: { bg: '#E2E8F0', fg: '#334155' },
  fresh: { bg: '#DBEAFE', fg: '#1E40AF' },
  watch: { bg: '#FEF3C7', fg: '#92400E' },
  passed: { bg: '#F1F5F9', fg: '#475569' },
  unmitigated: { bg: '#FEE2E2', fg: '#991B1B' },
} satisfies Record<string, Tone>;
