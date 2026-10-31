import { describe, expect, it } from 'vitest';
import { coa, ev, realReplay } from '../test/fixtures';
import { bucketOf, initialSelection, planOf, stateAt, tierOf } from './replay';

describe('bucketOf', () => {
  it('applies the Needle rules in order', () => {
    expect(bucketOf([0, -4, 99999])).toBe('pc');
    expect(bucketOf([0, -5, 6000])).toBe('hidden');
    expect(bucketOf([0, -6, 5001])).toBe('hidden');
    expect(bucketOf([0, -7, 500])).toBe('distance');
    expect(bucketOf([0, -5, 500])).toBe('distance');
    expect(bucketOf([0, -5, 3000])).toBe('elevated');
    expect(bucketOf([0, -7, 3000])).toBe('elevated');
    expect(bucketOf([0, -7, 6000])).toBe('quiet');
  });
});

describe('tierOf', () => {
  it('applies the brief tiers', () => {
    expect(tierOf([0, -7, 999])).toBe('CRITICAL');
    expect(tierOf([0, -4, 50000])).toBe('CRITICAL');
    expect(tierOf([0, -6, 50000])).toBe('ELEVATED');
    expect(tierOf([0, -7, 5000])).toBe('ELEVATED');
    expect(tierOf([0, -7, 5001])).toBe('SAFE');
  });
});

describe('stateAt', () => {
  const e = ev(1, 100, [
    [10, -7, 9000],
    [20, -3.5, 400],
    [30, -5, 2000],
  ]);

  it('is future before the first message', () => {
    expect(stateAt(e, 9, 8)).toEqual({ phase: 'future' });
  });

  it('uses the latest message received', () => {
    const s = stateAt(e, 25, 8);
    expect(s.phase).toBe('open');
    if (s.phase === 'future') return;
    expect(s.k).toBe(1);
    expect(s.bucket).toBe('pc');
    expect(s.isNew).toBe(false);
  });

  it('marks new events and earlier peaks', () => {
    const fresh = stateAt(e, 12, 8);
    expect(fresh.phase !== 'future' && fresh.isNew).toBe(true);
    const later = stateAt(e, 40, 8);
    expect(later.phase !== 'future' && later.peaked && later.bucket === 'elevated').toBe(true);
  });

  it('resolves at closest approach', () => {
    expect(stateAt(e, 100, 8).phase).toBe('resolved');
  });
});

describe('planOf', () => {
  const e = ev(2, 120, [[20, -3.5, 400], [40, -3.4, 380]], { coa: { '0': coa() } });

  it('sets the deadline at the first window over budget', () => {
    const s = stateAt(e, 24, 8);
    const p = planOf(e, s, 24, 10);
    expect(p?.key).toBe(0);
    expect(p?.dlAbs).toBe(20 + 18);
    expect(p?.left).toBe(14);
    expect(p?.overNow).toBe(false);
  });

  it('moves the deadline with the budget', () => {
    const s = stateAt(e, 24, 8);
    expect(planOf(e, s, 24, 5)?.dlAbs).toBe(20 + 12);
    expect(planOf(e, s, 24, 40)?.dlAbs).toBe(120 - 3);
  });

  it('reports a passed deadline', () => {
    const s = stateAt(e, 48, 8);
    const p = planOf(e, s, 48, 5);
    expect(p?.overNow).toBe(true);
    expect(p?.left).toBeLessThan(0);
  });

  it('treats a null window as over budget', () => {
    const e2 = ev(3, 120, [[20, -3.5, 400]], { coa: { '0': coa({ wait: [[0, 2], [6, null], [12, 3]] }) } });
    expect(planOf(e2, stateAt(e2, 24, 8), 24, 10)?.dlAbs).toBe(26);
  });

  it('has no plan below the action threshold', () => {
    const e3 = ev(4, 120, [[20, -5, 400]], { coa: { '0': coa() } });
    expect(planOf(e3, stateAt(e3, 24, 8), 24, 10)).toBeNull();
  });
});

describe('initialSelection', () => {
  it('opens on the first escalated event when its first plan arrives', () => {
    const rp = realReplay();
    const { run, sel } = initialSelection(rp.events, rp.runH, rp.runs);
    const e = rp.events.find((x) => x.id === sel)!;
    const k0 = Math.min(...Object.keys(e.coa).map(Number));
    expect(run).toBe(Math.ceil(e.m[k0][0] / rp.runH));
    expect(e.m[e.m.length - 1][1]).toBeGreaterThanOrEqual(-4);
  });

  it('falls back when nothing escalates', () => {
    expect(initialSelection([ev(1, 50, [[0, -7, 9000]])], 8, 64)).toEqual({ run: 12, sel: null });
  });
});
