import { describe, expect, it } from 'vitest';
import { at, dh, dirLong, dirShort, mTxt, odds, pcOdds, pcTxt, pcWithOdds, sci, sgn } from './format';

describe('format', () => {
  it('truncates Pc to one decimal in scientific notation', () => {
    expect(sci(1.39e-4)).toBe('1.3e-4');
    expect(sci(6.81e-5)).toBe('6.8e-5');
    expect(pcTxt(-4)).toBe('1.0e-4');
    expect(pcTxt(-3.6)).toBe('2.5e-4');
  });

  it('floors Pc at 1e-30', () => {
    expect(pcTxt(-30)).toBe('≤1e-30');
    expect(sci(0)).toBe('≤1e-30');
    expect(sci(Number.NaN)).toBe('≤1e-30');
  });

  it('formats distances in m below 1 km and km above', () => {
    expect(mTxt(334.4)).toBe('334 m');
    expect(mTxt(-334.4)).toBe('334 m');
    expect(mTxt(1140)).toBe('1.14 km');
  });

  it('formats durations as days and hours', () => {
    expect(dh(29.6)).toBe('1d 06h');
    expect(dh(-5)).toBe('0d 05h');
    expect(dh(0)).toBe('0d 00h');
  });

  it('formats replay time as a calendar stamp', () => {
    expect(at(0)).toBe('Day 1 00:00');
    expect(at(25.5)).toBe('Day 2 01:30');
    expect(at(-0.1)).toBe('before Day 1');
  });

  it('signs changes', () => {
    expect([sgn(3), sgn(-2), sgn(0)]).toEqual(['+3', '-2', '±0']);
  });

  it('names thrust directions from alpha', () => {
    expect([0, 180, 30, 150, 210, 330].map(dirShort)).toEqual(['Prograde', 'Retrograde', 'Prograde 30° up', 'Retrograde 30° up', 'Retrograde 30° down', 'Prograde 30° down']);
    expect(dirLong(180)).toBe('Retrograde, against the velocity vector');
    expect(dirLong(330)).toBe('30° below the velocity vector, toward radial-in');
  });

  it('writes Pc as odds to two significant figures', () => {
    expect(odds(2.5e-4)).toBe('1 in 4,000');
    expect(odds(1.3e-5)).toBe('1 in 77,000');
    expect(odds(3.9e-4)).toBe('1 in 2,600');
    expect(odds(1.2e-3)).toBe('1 in 830');
    expect(odds(4.1e-7)).toBe('1 in 2.4 million');
    expect(odds(1e-9)).toBe('1 in a billion');
    expect(odds(3.9e-16)).toBe('under 1 in a billion');
  });

  it('takes the odds from the value the e-notation shows', () => {
    expect(sci(1.39e-5)).toBe('1.3e-5');
    expect(odds(1.39e-5)).toBe('1 in 77,000');
    expect(pcOdds(-3.6)).toBe('1 in 4,000');
  });

  it('gives no odds at the 1e-30 floor', () => {
    expect(pcOdds(-30)).toBeNull();
    expect(pcWithOdds(-30)).toBe('≤1e-30');
    expect(pcWithOdds(-3.6)).toBe('2.5e-4 (1 in 4,000)');
  });
});
