import { describe, expect, it } from 'vitest';
import { realData } from '../test/fixtures';
import { replayFacts } from './facts';
import { initialSelection } from './replay';
import { NO_DECISIONS } from './run';
import { DEFAULT_OPTION } from './options';
import { type UiState, approve, buildView, defer } from './view';

const data = realData();
const start = initialSelection(data.replay.events, data.replay.runH, data.replay.runs);
const ui0: UiState = { run: start.run, tab: 'needs', sel: start.sel, opt: DEFAULT_OPTION, budget: 10, dec: NO_DECISIONS };

describe('buildView', () => {
  it('opens on a Decide event with a burn plan', () => {
    const v = buildView(data, ui0);
    expect(v.ws.kind).toBe('event');
    if (v.ws.kind !== 'event') return;
    expect(v.ws.header.chip.label).toBe('DECIDE');
    expect(v.ws.planner).not.toBeNull();
    expect(v.next.eventId).not.toBeNull();
  });

  // Builds the whole console many times, so it gets a longer timeout on a busy machine.
  it('builds every run with every Decide event selected', () => {
    for (let run = 0; run < data.replay.runs; run++) {
      const base = buildView(data, { ...ui0, run, sel: null });
      expect(base.ws.kind).toBe('empty');
      for (const id of base.queue.rows.map((r) => r.id)) {
        const v = buildView(data, { ...ui0, run, sel: id });
        expect(v.ws.kind).toBe('event');
        if (v.ws.kind === 'event' && v.ws.planner) {
          expect(v.ws.planner.opts.rows.length).toBeGreaterThan(0);
          expect(v.ws.planner.modal.checks.length).toBe(6);
        }
      }
    }
  }, 30_000);

  it('shows the messages table for Watch and Passed events', () => {
    const last = data.replay.runs - 1;
    for (const tab of ['watch', 'passed'] as const) {
      const v0 = buildView(data, { ...ui0, run: last, tab });
      const id = v0.queue.rows[0].id;
      const v = buildView(data, { ...ui0, run: last, tab, sel: id });
      expect(v.ws.kind === 'event' && v.ws.planner == null && v.ws.msgRows.length > 0).toBe(true);
    }
  });

  it('explains an event that has not been reported yet', () => {
    const later = data.replay.events.reduce((a, b) => (b.m[0][0] > a.m[0][0] ? b : a));
    const v = buildView(data, { ...ui0, run: 0, sel: later.id });
    expect(v.ws.kind === 'empty' && v.ws.text.startsWith('Event #' + later.id + ' has not been reported yet')).toBe(true);
  });

  it('records approvals and deferrals in the decision log', () => {
    const v = buildView(data, ui0);
    const deferred = defer(ui0, v);
    expect(deferred.log[0].text).toMatch(/^Deferred #\d+ to the next run/);
    const ui1 = { ...ui0, dec: deferred };
    const approved = approve(ui1, buildView(data, ui1));
    expect(approved.approved[ui0.sel!]).toBe(ui0.run + 1);
    expect(approved.log[1].text).toMatch(/^Approved #\d+: robust, \d+\.\d mm\/s/);
    const after = buildView(data, { ...ui1, dec: approved });
    expect(after.ws.kind === 'event' && after.ws.header.chip.label).toBe('APPROVED');
    expect(after.kpis.find((k) => k.label === 'Approved')?.v).toBe('1');
    expect(approve({ ...ui1, dec: approved }, after)).toBe(approved);
  });

  it('moves the decision deadline with the Δv budget', () => {
    const left = (budget: number) => {
      const v = buildView(data, { ...ui0, budget });
      return v.ws.kind === 'event' && v.ws.planner ? v.ws.planner.plan.dlAbs : NaN;
    };
    expect(left(5)).toBeLessThanOrEqual(left(10));
    expect(left(10)).toBeLessThanOrEqual(left(40));
  });
});

describe('replayFacts', () => {
  it('reproduces the numbers quoted in the data notes', () => {
    const f = replayFacts(data.replay);
    expect(f.coaMessages).toBe(119);
    expect(f.pcModelWithin01).toBe(106);
    expect(f.medianWaitRatio24h?.toFixed(2)).toBe('1.25');
  });
});
