import { describe, expect, it } from 'vitest';
import { coa, ev, realData, realReplay, replayOf } from '../test/fixtures';
import { EMPTY_LANE_H, buildDock, decideCounts, densityCounts } from './dock';
import { buildNext } from './header';
import { buildQueue } from './queue';
import { initialSelection, isKnown, rtnAt, stateAt } from './replay';
import { NO_DECISIONS, changedSincePrev, runCtx, snapshot } from './run';
import { approve, buildView } from './view';
import { buildRtn, scaleBarM } from './workspace';

describe('Decide tab', () => {
  const rp = replayOf([
    ev(1, 200, [[0, -3.5, 400]], { coa: { '0': coa() } }),
    ev(2, 300, [[0, -3.5, 400]], { coa: { '0': coa({ wait: [[0, 2], [6, 3], [12, 4], [18, 5], [24, 6], [30, 7], [36, 8], [42, 9], [48, 9], [54, 9], [60, 20]] }) } }),
  ]);

  it('drops the DECIDE chip but keeps DEFERRED', () => {
    const ctx = runCtx(rp, 0, 10, { ...NO_DECISIONS, deferred: { 2: 1 } });
    const rows = buildQueue(ctx, snapshot(ctx), 'needs', null).rows;
    expect(rows.find((r) => r.id === 1)?.chip).toBeNull();
    expect(rows.find((r) => r.id === 2)?.chip?.label).toBe('DEFERRED');
  });

  it('draws time left to the deadline on a 48 h scale', () => {
    const ctx = runCtx(rp, 0, 10, NO_DECISIONS);
    const rows = buildQueue(ctx, snapshot(ctx), 'needs', null).rows;
    expect(rows.find((r) => r.id === 1)?.urgency).toEqual({ w: '37.5%', tone: 'soon' });
    expect(rows.find((r) => r.id === 2)?.urgency).toEqual({ w: '100.0%', tone: 'calm' });
    const late = runCtx(rp, 3, 10, NO_DECISIONS);
    expect(buildQueue(late, snapshot(late), 'needs', null).rows.find((r) => r.id === 1)?.urgency).toEqual({ w: '100%', tone: 'over' });
  });

  it('says when the next decision is already in the workspace', () => {
    const ctx = runCtx(rp, 0, 10, NO_DECISIONS);
    expect(buildNext(snapshot(ctx), 10, 1).showing).toBe(true);
    expect(buildNext(snapshot(ctx), 10, 2).showing).toBe(false);
  });
});

describe('timeline', () => {
  it('counts to-decide events per run, removing approvals from their run on', () => {
    const rp = realReplay();
    const plain = decideCounts(runCtx(rp, 0, 10, NO_DECISIONS));
    expect(plain).toEqual(densityCounts(rp).map((c) => c[1]));
    const data = realData();
    const start = initialSelection(rp.events, rp.runH, rp.runs);
    const approved = decideCounts(runCtx(rp, 0, 10, { ...NO_DECISIONS, approved: { [start.sel!]: start.run + 1 } }));
    expect(approved[start.run]).toBe(plain[start.run] - 1);
    expect(approved[start.run - 1]).toBe(plain[start.run - 1]);
    expect(data.replay.runs).toBe(approved.length);
  });

  it('collapses lanes with nothing reported yet instead of hiding them', () => {
    const rp = realReplay();
    const lanes = buildDock(runCtx(rp, 0, 10, NO_DECISIONS), null, null, 'coa1').lanes;
    const last = buildDock(runCtx(rp, rp.runs - 1, 10, NO_DECISIONS), null, null, 'coa1').lanes;
    expect(lanes.map((l) => l.sat)).toEqual(last.map((l) => l.sat));
    for (const l of lanes) expect(l.empty ? l.h === EMPTY_LANE_H && l.bars.length === 0 : l.h > EMPTY_LANE_H).toBe(true);
  });

  it('fades passed events and flags the ones that changed this run', () => {
    const rp = realReplay();
    for (let run = 1; run < rp.runs; run++) {
      const ctx = runCtx(rp, run, 10, NO_DECISIONS);
      const changed = changedSincePrev(ctx, snapshot(ctx));
      const bars = buildDock(ctx, null, null, 'coa1', changed).lanes.flatMap((l) => l.bars);
      for (const b of bars) {
        expect(b.passed).toBe(!b.future);
        expect(b.changed).toBe(changed.has(b.id));
      }
    }
  });
});

describe('changedSincePrev', () => {
  it('flags new, escalated and passed events, and nothing on the first run', () => {
    const rp = replayOf([ev(1, 30, [[10, -7, 9000], [20, -3.5, 400]]), ev(2, 100, [[0, -8, 9000]])]);
    expect(changedSincePrev(runCtx(rp, 0, 10, NO_DECISIONS), snapshot(runCtx(rp, 0, 10, NO_DECISIONS))).size).toBe(0);
    const at = (run: number) => [...changedSincePrev(runCtx(rp, run, 10, NO_DECISIONS), snapshot(runCtx(rp, run, 10, NO_DECISIONS)))];
    expect(at(2)).toEqual([1]);
    expect(at(3)).toEqual([1]);
    expect(at(4)).toEqual([1]);
    expect(at(5)).toEqual([]);
  });
});

describe('charts', () => {
  it('picks a round scale bar near a quarter of the plot', () => {
    expect(scaleBarM(780)).toBe(1000);
    expect(scaleBarM(330)).toBe(250);
    expect(scaleBarM(1600)).toBe(2000);
    expect(scaleBarM(3600)).toBe(5000);
  });

  it('ticks the cost-of-waiting axis every 24 h and labels the deadline', () => {
    const data = realData();
    const start = initialSelection(data.replay.events, data.replay.runH, data.replay.runs);
    const v = buildView(data, { run: start.run, tab: 'needs', sel: start.sel, opt: 'coa1', budget: 10, dec: NO_DECISIONS });
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    const { wc } = v.ws.planner;
    expect(wc.ticks.map((t) => t.label).slice(0, 2)).toEqual(['+24 h', '+48 h']);
    expect(wc.deadline.label).toMatch(/^deadline Day \d+ \d\d:\d\d$/);
    expect(v.ws.header.orbit).toMatch(/^\d+ km · \d+\.\d°$/);
    expect(v.ws.header.odds).toMatch(/^1 in /);
  });
});

describe('relative position (brief update, 31 Oct)', () => {
  const msgs = (): [number, number, number, [number, number, number]][] => [
    [0, -5, 1200, [30, -1100, 400]],
    [8, -4.5, 900, [20, -800, 350]],
  ];

  it('reads r, t, n from each message or from an event-level array', () => {
    const a = ev(1, 100, msgs());
    expect(rtnAt(a, 1)).toEqual([20, -800, 350]);
    const b = ev(2, 100, [[0, -5, 1200], [8, -4.5, 900]], { rtn: [[1, 2, 3], [4, 5, 6]] });
    expect(rtnAt(b, 0)).toEqual([1, 2, 3]);
    expect(rtnAt(ev(3, 100, [[0, -5, 1200]]), 0)).toBeNull();
  });

  it('draws the three components on a symmetric round axis', () => {
    const e = ev(1, 100, msgs());
    const s = stateAt(e, 10, 8);
    if (!isKnown(s)) throw new Error('unreported');
    const v = buildRtn(e, s, (hb) => 316 - hb);
    expect(v?.maxTxt).toBe('2 km');
    expect(v?.t.split(' ')).toHaveLength(2);
  });

  it('shows the empty state on the committed replay, which has no r, t, n yet', () => {
    const data = realData();
    const start = initialSelection(data.replay.events, data.replay.runH, data.replay.runs);
    const v = buildView(data, { run: start.run, tab: 'needs', sel: start.sel, opt: 'coa1', budget: 10, dec: NO_DECISIONS });
    expect(v.ws.kind === 'event' && v.ws.hist.rtn).toBeNull();
  });
});

describe('review fixes', () => {
  it('keeps an approved burn on the plan it was approved on', () => {
    const later = coa({ opts: coa().opts.map((o) => ({ ...o, dv: o.dv * 3 })) });
    const e = ev(1, 300, [[0, -3.5, 400], [16, -3.4, 380]], { coa: { '0': coa(), '1': later } });
    const data = { fleet: realData().fleet, replay: replayOf([e]), metrics: null };
    const ui = { run: 0, tab: 'needs' as const, sel: 1, opt: 'coa2' as const, budget: 40, dec: NO_DECISIONS };
    const dec = approve(ui, buildView(data, ui));
    expect(dec.approvedPlan[1]).toEqual({ key: 0, opt: 'coa2' });
    const v = buildView(data, { ...ui, run: 3, opt: 'coa1', dec });
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    expect(v.ws.planner.plan.key).toBe(0);
    expect(v.ws.planner.opt.key).toBe('coa2');
    expect(v.ws.planner.opts.locked).toBe(true);
    const fresh = buildView(data, { ...ui, run: 3, dec: NO_DECISIONS });
    expect(fresh.ws.kind === 'event' && fresh.ws.planner?.plan.key).toBe(1);
  });

  it('proposes only feasible options on the timeline', () => {
    const c = coa();
    c.opts[0] = { ...c.opts[0], feasible: false };
    const e = ev(1, 300, [[0, -3.5, 400]], { coa: { '0': c } });
    const marks = buildDock(runCtx(replayOf([e]), 0, 10, NO_DECISIONS), null, null, 'coa1').lanes.flatMap((l) => l.marks);
    expect(marks.map((m) => m.text)).toEqual(['Proposed burn · 5.0 mm/s']);
  });

  it('names an over-80 window a day later, not an impossible one', () => {
    const e = ev(1, 300, [[0, -3.5, 400]], { coa: { '0': coa({ wait: [[0, 2], [6, 3], [12, 4], [18, 5], [24, null], [30, 9]] }) } });
    const data = { fleet: realData().fleet, replay: replayOf([e]), metrics: null };
    const v = buildView(data, { run: 0, tab: 'needs', sel: 1, opt: 'coa1', budget: 40, dec: NO_DECISIONS });
    expect(v.ws.kind === 'event' && v.ws.planner?.wc.caption).toMatch(/One day later: over 80 mm\/s\./);
  });

  it('keeps a Decide event without a plan in the Next decision bar', () => {
    const e = ev(1, 50, [[20, -3.5, 400], [46, -3.4, 380]], { coa: { '0': coa() } });
    const ctx = runCtx(replayOf([e]), 6, 10, NO_DECISIONS);
    const next = buildNext(snapshot(ctx), 10, null);
    expect(next.tone).toBe('decide');
    expect(next.eventId).toBe(1);
    expect(next.text).toMatch(/hand over to flight dynamics\.$/);
  });

  it('lists every passed event', () => {
    const rp = realReplay();
    const ctx = runCtx(rp, rp.runs - 1, 10, NO_DECISIONS);
    const q = buildQueue(ctx, snapshot(ctx), 'passed', null);
    expect(q.rows.length).toBe(q.tabs.find((t) => t.key === 'passed')!.count);
    expect(q.rows.length).toBeGreaterThan(80);
  });
});
