import { describe, expect, it } from 'vitest';
import { ev, realReplay, replayOf } from '../test/fixtures';
import { easeOut, lapseBetween, spanTxt, visibleTurn } from './lapse';
import { NO_DECISIONS, runCtx } from './run';

describe('time-lapse', () => {
  it('labels the skipped span', () => {
    expect([8, 76, 24, 0, -16].map(spanTxt)).toEqual(['+8 h', '+3 d 4 h', '+1 d', '0 h', '−16 h']);
  });

  it('caps a long spin but ends at the same angle', () => {
    const turn = 2 * Math.PI;
    const total = 7.3 * turn;
    const v = visibleTurn(total);
    expect(Math.abs(v)).toBeLessThan(2 * turn);
    expect(((total - v) / turn) % 1).toBeCloseTo(0);
    expect(visibleTurn(-0.5)).toBeCloseTo(-0.5);
    expect(visibleTurn(2 * Math.PI / 3)).toBeCloseTo(2 * Math.PI / 3);
  });

  it('eases out and stops at 1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(2)).toBe(1);
  });

  it('finds events first reported and events that passed in the window', () => {
    const rp = replayOf([
      ev(1, 100, [[10, -7, 9000]]),
      ev(2, 20, [[2, -3.5, 400]]),
      ev(3, 22, [[3, -7, 9000]]),
      ev(4, 30, [[12, -7, 9000]]),
      ev(5, 22, [[12, -3.5, 400]]),
    ]);
    const l = lapseBetween(runCtx(rp, 3, 10, NO_DECISIONS), 1);
    expect(l.dH).toBe(16);
    expect(l.label).toBe('+16 h');
    expect(l.arrived.map((a) => a.id)).toEqual([1, 4]);
    expect(l.passed).toEqual([
      { id: 2, unmitigated: true },
      { id: 3, unmitigated: false },
      { id: 5, unmitigated: true },
    ]);
    const approved = lapseBetween(runCtx(rp, 3, 10, { ...NO_DECISIONS, approved: { 2: 2 } }), 1);
    expect(approved.passed[0]).toEqual({ id: 2, unmitigated: false });
  });

  it('has no effects when stepping back, and a key per change', () => {
    const rp = realReplay();
    const back = lapseBetween(runCtx(rp, 4, 10, NO_DECISIONS), 9);
    expect([back.dH, back.arrived.length, back.passed.length, back.label]).toEqual([-40, 0, 0, '−1 d 16 h']);
    expect(back.key).not.toBe(lapseBetween(runCtx(rp, 9, 10, NO_DECISIONS), 4).key);
  });

  it('caps the effects on a long jump', () => {
    const rp = realReplay();
    const l = lapseBetween(runCtx(rp, rp.runs - 1, 10, NO_DECISIONS), 0);
    expect(l.arrived.length).toBeLessThanOrEqual(40);
    expect(l.passed.length).toBe(40);
  });
});
