// Regression tests for the QA report on the live console (B1, M1 to M5, minors).

import { describe, expect, it } from 'vitest';
import { coa, ev, realData, replayOf } from '../test/fixtures';
import { buildLog } from './digest';
import { buildDock } from './dock';
import { buildKpis, buildNext } from './header';
import { buildQueue } from './queue';
import { burnAt, burnPassed, isKnown, planOf, stateAt } from './replay';
import { DEFAULT_OPTION, NO_DECISIONS, chipFor, runCtx, snapshot } from './run';
import { approve, buildView, defer, queueTabFor } from './view';
import { buildDigest } from './digest';

const data = realData();
const rp = data.replay;
const ui = (run: number, sel: number | null, over = {}) => ({ run, tab: 'needs' as const, sel, opt: DEFAULT_OPTION, budget: 10, dec: NO_DECISIONS, ...over });

describe('B1: lane pills', () => {
  it('give every pill a key unique in its lane, even when two proposals share a run', () => {
    for (const run of [22, 23, 25, 30, 31, 32]) {
      for (const lane of buildDock(runCtx(rp, run, 10, NO_DECISIONS), null, null, 'coa4').lanes) {
        const keys = lane.marks.map((m) => m.id + ':' + m.kind);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});

describe('M1: a Decide event with no plan', () => {
  const far = ev(1, 200, [[10, -3.5, 400]]);
  const near = ev(2, 18, [[10, -3.5, 400]]);
  const r = replayOf([far, near]);

  it('reads "no plan" days out and "too late" only inside 3 h', () => {
    const ctx = runCtx(r, 2, 10, NO_DECISIONS);
    const rows = buildQueue(ctx, snapshot(ctx), 'needs', null).rows;
    expect(rows.find((x) => x.id === 1)?.col1).toBe('no plan');
    expect(rows.find((x) => x.id === 1)?.urgency?.tone).toBe('none');
    expect(rows.find((x) => x.id === 2)?.col1).toBe('too late');
  });

  it('explains it in the Next decision bar and the workspace', () => {
    const ctx = runCtx(replayOf([far]), 2, 10, NO_DECISIONS);
    expect(buildNext(snapshot(ctx), 10, null, ctx).text).toMatch(/No burn plan for this message \(the planner did not run\)/);
    const v = buildView({ ...data, replay: replayOf([far]) }, ui(2, 1));
    expect(v.ws.kind === 'event' && v.ws.header.status).toMatch(/planner gave no burn plan/);
    expect(v.ws.kind === 'event' && v.ws.other?.title).toBe('No burn plan for this message');
  });
});

describe('M2: a planned burn time that has passed', () => {
  it('is marked, fails the gate, cannot be approved, and the pill sits at its burn time', () => {
    const v = buildView(data, ui(22, 8783));
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    const { planner } = v.ws;
    const e = rp.events.find((x) => x.id === 8783)!;
    const s = stateAt(e, 22 * rp.runH, rp.runH);
    if (!isKnown(s)) throw new Error('unreported');
    const plan = planOf(e, s, 22 * rp.runH, 10)!;
    expect(planner.plan.age).toBeGreaterThanOrEqual(6);
    // A burn still ahead (Wait 24 h) is preferred over the stale ones.
    expect(burnPassed(e, plan, planner.opt)).toBe(false);
    const stale = planner.opts.rows.filter((r) => r.passed);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.every((r) => r.dir.endsWith('burn time passed'))).toBe(true);
    const staleOpt = e.coa[String(plan.key)].opts.find((o) => o.key === stale[0].key)!;
    const forced = buildView(data, { ...ui(22, 8783), opt: staleOpt.key });
    if (forced.ws.kind !== 'event' || !forced.ws.planner) throw new Error('expected a planner');
    expect(forced.ws.planner.opt.key).not.toBe(staleOpt.key);
    const mark = v.dock.lanes.flatMap((l) => l.marks).find((m) => m.id === 8783)!;
    expect(parseFloat(mark.left)).toBeCloseTo((burnAt(e, planner.opt) / (rp.windowH + 24)) * 100, 2);
  });

  it('blocks approval when every option has passed', () => {
    // Burns planned at the message itself (lead = 300 h), seen 16 h later: both windows have gone by.
    const e = ev(1, 300, [[0, -3.5, 400]], { coa: { '0': { ...coa(), opts: coa().opts.filter((o) => o.key !== 'coa3').map((o) => ({ ...o, leadH: 300 })) } } });
    const d = { ...data, replay: replayOf([e]) };
    const u = ui(2, 1);
    const v = buildView(d, u);
    if (v.ws.kind !== 'event' || !v.ws.planner) throw new Error('expected a planner');
    expect(v.ws.planner.opts.burnPassed).toBe(true);
    expect(v.ws.planner.modal.burnPassed).toBe(true);
    expect(v.ws.planner.modal.checks.find((c) => !c.ok && c.title.startsWith('Planned burn time passed'))).toBeTruthy();
    expect(approve(u, v)).toBe(u.dec);
  });
});

describe('M3: picking from elsewhere', () => {
  it('names the queue tab that lists the event', () => {
    expect(queueTabFor(data, ui(22, null), 8783)).toBe('needs');
    expect(queueTabFor(data, ui(22, null), 3211)).toBe('passed');
    const watch = snapshot(runCtx(rp, 22, 10, NO_DECISIONS)).watching[0].e.id;
    expect(queueTabFor(data, ui(22, null), watch)).toBe('watch');
  });
});

describe('M5: deferral', () => {
  it('moves the Next decision bar to the next event and is recorded once per run', () => {
    const before = buildView(data, ui(4, null));
    const first = before.next.eventId!;
    const u = ui(4, first);
    const dec = defer(u, buildView(data, u));
    expect(defer({ ...u, dec }, buildView(data, { ...u, dec }))).toBe(dec);
    const after = buildView(data, { ...u, dec });
    expect(after.next.eventId).not.toBe(first);
    expect(after.ws.kind === 'event' && after.ws.header.status).toMatch(/^Deferred at this run/);
    expect(after.ws.kind === 'event' && after.ws.planner?.opts.canDefer).toBe(false);
  });
});

describe('minor fixes', () => {
  it('m1: a quiet event reads QUIET, not WATCH', () => {
    const e = rp.events.find((x) => x.id === 3687)!;
    const s = stateAt(e, 22 * rp.runH, rp.runH);
    if (!isKnown(s)) throw new Error('unreported');
    expect(chipFor(runCtx(rp, 22, 10, NO_DECISIONS), e, s).label).toBe('QUIET');
  });

  it('m2: the dock shows no event before its escalation is known', () => {
    const ids = (run: number) => buildDock(runCtx(rp, run, 10, NO_DECISIONS), null, null, 'coa4').lanes.flatMap((l) => l.bars.map((b) => b.id));
    expect(ids(22)).not.toContain(3687);
    for (const run of [5, 22, 40]) {
      const T = run * rp.runH;
      for (const id of ids(run)) expect(rp.events.find((x) => x.id === id)!.m.some((m) => m[0] <= T && m[1] >= -4)).toBe(true);
    }
  });

  it('m3: the log shows decisions up to the run on screen, newest run first', () => {
    const log = [
      { run: 23, id: 1, kind: 'approve' as const, text: 'a' },
      { run: 5, id: 2, kind: 'defer' as const, text: 'b' },
      { run: 9, id: 3, kind: 'approve' as const, text: 'c' },
    ];
    expect(buildLog(log, 10).map((l) => l.text)).toEqual(['c', 'b']);
    const u = ui(4, 37);
    const at5 = approve({ ...u, run: 5 }, buildView(data, { ...u, run: 5 }));
    const again = approve({ ...u, dec: at5 }, buildView(data, { ...u, dec: { ...at5, approved: {} } }));
    expect(again.log.filter((l) => l.id === 37)).toHaveLength(1);
    expect(again.log[0].run).toBe(5);
  });

  it('m8: a cheap current window is not over budget because an earlier one was', () => {
    const e = ev(1, 300, [[0, -3.5, 400]], { coa: { '0': coa({ wait: [[0, 2], [6, 9], [12, 1.5], [18, 1.5], [24, 9]] }) } });
    const s = stateAt(e, 13, 8);
    const p = planOf(e, s, 13, 2)!;
    expect(p.overNow).toBe(false);
    expect(p.dlAbs).toBe(24);
  });

  it('m10: run 1 shows no deltas and says it is the first run', () => {
    const snap = snapshot(runCtx(rp, 0, 10, NO_DECISIONS));
    expect(buildKpis(snap, 0).map((k) => k.d)).toEqual(['', '', '', '']);
    expect(buildDigest(snap, 0)).toMatchObject({ first: true, groups: [] });
  });
});
