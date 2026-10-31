import { describe, expect, it } from 'vitest';
import { coa, ev, forecastOf, realData, replayOf } from '../test/fixtures';
import { binOf, forecastAt, forecastCard, forecastLine, inTen, pcBandOf, pctTxt, rangeTxt } from './forecast';
import { buildNext } from './header';
import { buildQueue } from './queue';
import { initialSelection, isKnown, stateAt } from './replay';
import { DEFAULT_OPTION, NO_DECISIONS, runCtx, snapshot } from './run';
import { buildView } from './view';

describe('forecast lookup', () => {
  it('bins by lower edge, with an open last bin', () => {
    const edges = [0, 1, 2, 3, 5, null];
    expect([0, 0.99, 1, 4.9, 5, 40].map((v) => binOf(edges, v))).toEqual([0, 0, 1, 3, 4, 4]);
    expect(binOf([0, 1000, null], -5)).toBe(0);
  });

  it('scales the latest miss by the cell for its lead and miss', () => {
    const e = ev(1, 100, [[10, -7, 1500], [40, -7, 1500]]);
    const s = stateAt(e, 41, 8);
    if (!isKnown(s)) throw new Error('unreported');
    const fc = forecastAt(forecastOf(), e, s)!;
    expect(fc.leadDays).toBeCloseTo(2.5);
    expect(fc.cell.pCritical).toBe(0.5);
    expect([fc.q10M, fc.q50M, fc.q90M]).toEqual([900, 1500, 2700]);
  });

  it('gives no forecast once closest approach has passed, or without forecast.json', () => {
    const e = ev(1, 30, [[10, -7, 1500]]);
    const after = stateAt(e, 40, 8);
    if (!isKnown(after)) throw new Error('unreported');
    expect(forecastAt(forecastOf(), e, after)).toBeNull();
    const open = stateAt(e, 12, 8);
    if (!isKnown(open)) throw new Error('unreported');
    expect(forecastAt(null, e, open)).toBeNull();
  });

  it('writes the forecast line and its hover card', () => {
    const e = ev(1, 100, [[40, -7, 1500]]);
    const s = stateAt(e, 41, 8);
    if (!isKnown(s)) throw new Error('unreported');
    const line = forecastLine(forecastAt(forecastOf(), e, s)!);
    expect([line.median, line.range, line.cover, line.pUnder1km, line.pCritical]).toEqual(['1.5 km', '0.9–2.7 km', '8 in 10', '15%', '30%']);
    expect(line.tip[0]).toBe('8 in 10 similar events ended inside this band (checked on 2,529 held-out events); n = 100.');
  });

  it('conditions the chance of ending Critical on the latest Pc band', () => {
    const f = forecastOf();
    expect([-9, -6, -5, -4, -3].map((r) => pcBandOf(f, r))).toEqual([0, 1, 1, 2, 2]);
    const at = (risk: number, miss: number) => {
      const e = ev(1, 100, [[40, risk, miss]]);
      const s = stateAt(e, 41, 8);
      if (!isKnown(s)) throw new Error('unreported');
      return forecastAt(f, e, s)!;
    };
    expect(at(-9, 1500).pCritical).toBe(0.3);
    expect(at(-3.3, 1500).pCritical).toBe(0.7);
    expect(at(-5, 3000).pCritical).toBeNull();
    expect(forecastLine(at(-5, 3000)).pCritical).toBe('not enough history');
  });

  it('lays out the range card on a log axis with the 1 km line', () => {
    const e = ev(1, 100, [[40, -3.3, 1500]]);
    const s = stateAt(e, 41, 8);
    if (!isKnown(s)) throw new Error('unreported');
    const c = forecastCard(forecastAt(forecastOf(), e, s)!);
    const pos = (x: string) => Number(x.replace('%', ''));
    expect(c.lead).toBe('Predicted from today’s message, 2d 12h before closest approach');
    expect(pos(c.band.left)).toBeLessThan(pos(c.oneKm));
    expect(pos(c.now.left)).toBeGreaterThan(pos(c.oneKm));
    expect(c.risk).not.toBeNull();
    expect([c.pUnder1km, c.pCritical]).toEqual(['15%', '70%']);
    expect(c.pUnder1kmBasis).toBe('100 similar events');
    expect(c.pCriticalBasis).toBe('50 similar events at Pc ≥ 1e-4');
    expect(c.footnote).toMatch(/The band held 8 times in 10 on 2,529 held-out events\./);
  });

  it('formats ranges and shares', () => {
    expect(rangeTxt(640, 980)).toBe('640–980 m');
    expect(rangeTxt(640, 1200)).toBe('0.6–1.2 km');
    expect(rangeTxt(40, 1200)).toBe('40 m–1.2 km');
    expect(pctTxt(0.003)).toBe('under 1%');
    expect(inTen(0.799)).toBe('8 in 10');
  });
});

describe('forecast in the console', () => {
  const data = realData();
  const rp = data.replay;
  const start = initialSelection(rp.events, rp.runH, rp.runs);
  const ui = { run: start.run, tab: 'needs' as const, sel: start.sel, opt: DEFAULT_OPTION, budget: 10, dec: NO_DECISIONS };

  it('fans the miss chart and puts the forecast card first for an open event', () => {
    const v = buildView(data, ui);
    if (v.ws.kind !== 'event') throw new Error('expected an event');
    expect(v.ws.hist.fan?.label).toMatch(/^forecast · likely final /);
    expect(v.ws.forecast?.kind).toBe('open');
  });

  it('gives #37 at run 5 the Pc-conditioned chance, not the Pc-blind one', () => {
    const v = buildView(data, { ...ui, run: 4, sel: 37 });
    if (v.ws.kind !== 'event' || v.ws.forecast?.kind !== 'open') throw new Error('expected an open forecast');
    expect(v.ws.header.pc).toBe('5.0e-4');
    expect(v.ws.forecast.card.lead).toBe('Predicted from today’s message, 5d 22h before closest approach');
    expect(v.ws.forecast.card.pCritical).toBe('20%');
    expect(v.ws.forecast.card.pCriticalBasis).toBe('20 similar events at Pc ≥ 1e-4');
  });

  it('shows no fan or line for a passed event', () => {
    const last = rp.runs - 1;
    const passed = buildView(data, { ...ui, run: last, tab: 'passed', sel: null }).queue.rows[0].id;
    const v = buildView(data, { ...ui, run: last, tab: 'passed', sel: passed });
    expect(v.ws.kind === 'event' && v.ws.hist.fan === null && v.ws.forecast?.kind === 'passed').toBe(true);
  });

  it('ranks the Watch tab by the forecast chance of ending Critical', () => {
    const ctx = runCtx(rp, 30, 10, NO_DECISIONS);
    const q = buildQueue(ctx, snapshot(ctx), 'watch', null, new Set(), data.forecast!);
    const ps = q.rows.map((r) => (r.col1 === 'no history' ? -1 : r.col1 === 'under 1%' ? 0 : Number(r.col1.replace('%', ''))));
    expect(ps).toEqual([...ps].sort((a, b) => b - a));
    expect(q.col).toBe('P(final Crit.)');
  });
});

describe('robust burn option', () => {
  const robust = coa({
    robustMissM: 1330,
    opts: [
      { key: 'coa1', feasible: true, dv: 1, alpha: 180, beta: 0, leadH: 60, pcAfter: 5e-5, missAfter: 1100, dR: 0, dT: 800, dN: 0, burnS: 1, propG: 0.5, dA: -2, m2After: [0, 1100] },
      { key: 'coa2', feasible: true, dv: 3, alpha: 180, beta: 0, leadH: 60, pcAfter: 5e-7, missAfter: 2200, dR: 0, dT: 2000, dN: 0, burnS: 3, propG: 1.4, dA: -6, m2After: [0, 2200] },
      { key: 'coa4', feasible: true, dv: 2, alpha: 180, beta: 0, leadH: 60, pcAfter: 2e-5, missAfter: 1400, dR: 0, dT: 1200, dN: 0, burnS: 2, propG: 0.9, dA: -4, m2After: [0, 1400] },
    ],
  });
  const data = { fleet: realData().fleet, replay: replayOf([ev(1, 300, [[0, -3.5, 400]], { coa: { '0': robust } })]), metrics: null };
  const ui = { run: 0, tab: 'needs' as const, sel: 1, opt: DEFAULT_OPTION, budget: 10, dec: NO_DECISIONS };

  it('lists the robust option first, by default, with its target', () => {
    const v = buildView(data, ui);
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    expect(v.ws.planner.opts.rows.map((r) => [r.name, r.on])).toEqual([
      ['Recommended (robust)', true],
      ['Minimum Δv', false],
      ['More margin', false],
    ]);
    expect(v.ws.planner.opts.rows[0].dir).toBe('keeps ≥ 1 km at the pessimistic end (target 1,330 m)');
    expect(v.dock.lanes.flatMap((l) => l.marks).map((m) => m.text)).toEqual(['2.0 mm/s']);
    expect(buildNext(snapshot(runCtx(data.replay, 0, 10, NO_DECISIONS)), 10).text).toMatch(/Recommended burn: 2\.0 mm\/s \(robust\)\.$/);
  });

  it('says when the minimum-Δv burn is already robust', () => {
    const same = { ...robust, opts: robust.opts.map((o) => (o.key === 'coa4' ? { ...o, dv: 1 } : o)) };
    const d2 = { ...data, replay: replayOf([ev(1, 300, [[0, -3.5, 400]], { coa: { '0': same } })]) };
    const v = buildView(d2, ui);
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    expect(v.ws.planner.opts.rows[1].dir).toBe('Retrograde · same burn: already robust');
  });

  it('falls back to minimum Δv when there is no robust option', () => {
    const v = buildView(data, { ...ui, sel: 1 });
    const noRobust = { ...robust, opts: robust.opts.filter((o) => o.key !== 'coa4') };
    const v2 = buildView({ ...data, replay: replayOf([ev(1, 300, [[0, -3.5, 400]], { coa: { '0': noRobust } })]) }, ui);
    expect(v.ws.kind === 'event' && v.ws.planner?.opt.key).toBe('coa4');
    expect(v2.ws.kind === 'event' && v2.ws.planner?.opt.key).toBe('coa1');
  });
});
