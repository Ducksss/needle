// Everything the console renders for one UI state. The React components only lay this out.

import type { ConsoleData, OptionKey } from '../data/types';
import { type DigestView, type LogRow, buildDigest, buildLog } from './digest';
import { type DockView, type LegendItem, buildDock, buildLegend } from './dock';
import { type ReplayFacts, replayFacts } from './facts';
import { dirShort, dh } from './format';
import { type GlobeScene, buildGlobeScene } from './globe';
import { type Kpi, type NextDecision, buildKpis, buildNext } from './header';
import { type QueueTab, type QueueView, buildQueue } from './queue';
import { type Decisions, type LogEntry, OPTION_NAMES, changedSincePrev, runCtx, snapshot } from './run';
import { type WarningsView, buildWarnings } from './warnings';
import { type WorkspaceView, buildWorkspace } from './workspace';

export interface UiState {
  run: number;
  tab: QueueTab;
  sel: number | null;
  opt: OptionKey;
  budget: number;
  dec: Decisions;
}

export interface ConsoleView {
  run: number;
  runs: number;
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
  const ws = buildWorkspace(ctx, selRow?.e ?? null, ui.opt, facts, selRow ? fleet.missions[selRow.e.mi] : undefined);
  const opt = ws.kind === 'event' && ws.planner ? ws.planner.opt : null;
  const day = Math.floor(ctx.T / 24) + 1;
  const hh = String(ctx.T % 24).padStart(2, '0');
  return {
    run: ui.run,
    runs: replay.runs,
    clock: 'Run ' + (ui.run + 1) + ' of ' + replay.runs + ' · Day ' + day + ', ' + hh + ':00',
    budget: ui.budget,
    kpis: buildKpis(snap),
    next: buildNext(snap, ui.budget, ui.sel),
    queue: buildQueue(ctx, snap, ui.tab, ui.sel, changed),
    ws,
    globe: buildGlobeScene({ missions: fleet.missions, open: snap.open, sel: selRow, opt }),
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
  const entry: LogEntry = { run: run1, text: 'Approved #' + id + ': ' + OPTION_NAMES[o.key].toLowerCase() + ', ' + o.dv.toFixed(1) + ' mm/s ' + dirShort(o.alpha).toLowerCase() + '.' };
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
