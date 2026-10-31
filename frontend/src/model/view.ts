// Everything the console renders for one UI state. The React components only lay this out.

import type { ConsoleData, OptionKey } from '../data/types';
import { type DigestView, type LogRow, buildDigest, buildLog } from './digest';
import { type DockView, type LegendItem, buildDock, buildLegend } from './dock';
import { type ReplayFacts, replayFacts } from './facts';
import { dirShort, dh } from './format';
import { type GlobeScene, buildGlobeScene } from './globe';
import { type Lapse, lapseBetween } from './lapse';
import { type Kpi, type NextDecision, buildKpis, buildNext } from './header';
import { type QueueTab, type QueueView, buildQueue } from './queue';
import { type Decisions, type LogEntry, OPTION_NAMES, changedSincePrev, runCtx, snapshot } from './run';
import { type WarningsView, buildWarnings } from './warnings';
import { type WorkspaceView, buildWorkspace } from './workspace';

export interface UiState {
  run: number;
  /** The run shown before the latest run change, for the fast-forward between them. */
  fromRun?: number;
  tab: QueueTab;
  sel: number | null;
  opt: OptionKey;
  budget: number;
  dec: Decisions;
}

export interface ConsoleView {
  run: number;
  runs: number;
  /** Replay time of this run, hours. */
  T: number;
  /** The fast-forward from the previous run, or null on first load. */
  lapse: Lapse | null;
  clock: string;
  budget: number;
  kpis: Kpi[];
  next: NextDecision;
  queue: QueueView;
  ws: WorkspaceView;
  globe: GlobeScene;
  digest: DigestView;
  log: LogRow[];
  dock: DockView;
  legend: LegendItem[];
  warnings: WarningsView;
  facts: ReplayFacts;
}

const factsCache = new WeakMap<ConsoleData, ReplayFacts>();

function factsOf(data: ConsoleData): ReplayFacts {
  let f = factsCache.get(data);
  if (!f) {
    f = replayFacts(data.replay);
    factsCache.set(data, f);
  }
  return f;
}

export function buildView(data: ConsoleData, ui: UiState): ConsoleView {
  const { replay, fleet } = data;
  const ctx = runCtx(replay, ui.run, ui.budget, ui.dec);
  const snap = snapshot(ctx);
  const facts = factsOf(data);
  const selRow = snap.rows.find((r) => r.e.id === ui.sel) ?? null;
  const changed = changedSincePrev(ctx, snap);
  const ws = buildWorkspace(ctx, selRow?.e ?? null, ui.opt, facts, selRow ? fleet.missions[selRow.e.mi] : undefined, data.forecast);
  const opt = ws.kind === 'event' && ws.planner ? ws.planner.opt : null;
  const lapse = ui.fromRun != null && ui.fromRun !== ui.run ? lapseBetween(ctx, ui.fromRun) : null;
  const day = Math.floor(ctx.T / 24) + 1;
  const hh = String(ctx.T % 24).padStart(2, '0');
  return {
    run: ui.run,
    runs: replay.runs,
    T: ctx.T,
    lapse,
    clock: 'Run ' + (ui.run + 1) + ' of ' + replay.runs + ' · Day ' + day + ', ' + hh + ':00',
    budget: ui.budget,
    kpis: buildKpis(snap),
    next: buildNext(snap, ui.budget, ui.sel),
    queue: buildQueue(ctx, snap, ui.tab, ui.sel, changed, data.forecast ?? null),
    ws,
    globe: buildGlobeScene({ missions: fleet.missions, events: replay.events, T: ctx.T, lapse, open: snap.open, sel: selRow, opt }),
    digest: buildDigest(snap),
    log: buildLog(ui.dec.log),
    dock: buildDock(ctx, ui.sel, selRow?.e.sat ?? null, ui.opt, changed),
    legend: buildLegend(ui.budget),
    warnings: buildWarnings(ctx, snap, ui.sel),
    facts,
  };
}

/** Records an approval of the selected option at the current run. */
export function approve(ui: UiState, view: ConsoleView): Decisions {
  if (view.ws.kind !== 'event' || !view.ws.planner || view.ws.planner.opts.approved) return ui.dec;
  const id = view.ws.header.id;
  const o = view.ws.planner.opt;
  const run1 = ui.run + 1;
  const what = OPTION_NAMES[o.key] + ', ' + o.dv.toFixed(1) + ' mm/s ' + dirShort(o.alpha).toLowerCase() + '.';
  // Lower-case only the first letter: "Minimum Δv" must not become "minimum δv".
  const name = OPTION_NAMES[o.key].charAt(0).toLowerCase() + OPTION_NAMES[o.key].slice(1);
  const entry: LogEntry = { run: run1, text: 'Approved #' + id + ': ' + name + ', ' + o.dv.toFixed(1) + ' mm/s ' + dirShort(o.alpha).toLowerCase() + '.' };
  return {
    ...ui.dec,
    approved: { ...ui.dec.approved, [id]: run1 },
    approvedTxt: { ...ui.dec.approvedTxt, [id]: what },
    approvedPlan: { ...ui.dec.approvedPlan, [id]: { key: view.ws.planner.plan.key, opt: o.key } },
    log: [...ui.dec.log, entry],
  };
}

/** Records a deferral of the selected event to the next run. */
export function defer(ui: UiState, view: ConsoleView): Decisions {
  if (view.ws.kind !== 'event' || !view.ws.planner) return ui.dec;
  const id = view.ws.header.id;
  const plan = view.ws.planner.plan;
  const run1 = ui.run + 1;
  const entry: LogEntry = { run: run1, text: 'Deferred #' + id + ' to the next run' + (!plan.overNow ? ' (deadline in ' + dh(plan.left) + ')' : '') + '.' };
  return { ...ui.dec, deferred: { ...ui.dec.deferred, [id]: run1 }, log: [...ui.dec.log, entry] };
}
