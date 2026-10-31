import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { readBudget, writeBudget } from './budget';
import { useHoverCardFit } from './hooks';
import { ApprovalModal } from './components/ApprovalModal';
import { DecisionLog, OrbitContext, SinceLastRun } from './components/Context';
import { Header } from './components/Header';
import { NextDecision } from './components/NextDecision';
import { Queue } from './components/Queue';
import { Timeline } from './components/Timeline';
import { Warnings24h } from './components/Warnings24h';
import { Workspace } from './components/Workspace';
import { loadConsoleData } from './data/source';
import type { ConsoleData, OptionKey } from './data/types';
import type { QueueTab } from './model/queue';
import { initialSelection } from './model/replay';
import { DEFAULT_OPTION, type Decisions, NO_DECISIONS } from './model/run';
import { type UiState, approve, buildView, defer, queueTabFor } from './model/view';

const PLAY_MS = 1200;

interface State {
  status: 'loading' | 'error' | 'ready';
  data: ConsoleData | null;
  ui: UiState;
  playing: boolean;
  modal: boolean;
  /** The run changed by stepping, scrubbing or playback, so changed rows get a short highlight. */
  flash: boolean;
  /** Bumped by Retry to load the data again. */
  attempt: number;
}

type Action =
  | { type: 'loaded'; data: ConsoleData }
  | { type: 'failed' }
  | { type: 'retry' }
  | { type: 'run'; run: number }
  | { type: 'tick' }
  | { type: 'play' }
  | { type: 'tab'; tab: QueueTab }
  | { type: 'pick'; id: number; tab?: QueueTab }
  | { type: 'opt'; opt: OptionKey }
  | { type: 'modal'; open: boolean }
  | { type: 'decide'; dec: Decisions }
  | { type: 'budget'; budget: number };

const lastRun = (s: State) => (s.data ? s.data.replay.runs - 1 : 0);

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'loaded': {
      const rp = a.data.replay;
      const start = initialSelection(rp.events, rp.runH, rp.runs);
      return { ...s, status: 'ready', data: a.data, flash: false, ui: { ...s.ui, run: start.run, sel: start.sel } };
    }
    case 'failed':
      return { ...s, status: 'error' };
    case 'retry':
      return { ...s, status: 'loading', attempt: s.attempt + 1 };
    case 'run': {
      const run = Math.max(0, Math.min(lastRun(s), a.run));
      if (run === s.ui.run) return { ...s, playing: false };
      return { ...s, playing: false, flash: true, ui: { ...s.ui, fromRun: s.ui.run, run } };
    }
    case 'tick':
      if (!s.playing) return s;
      if (s.ui.run >= lastRun(s)) return { ...s, playing: false };
      return { ...s, flash: true, ui: { ...s.ui, fromRun: s.ui.run, run: s.ui.run + 1 } };
    case 'play':
      // At the last run, Play starts the replay again from run 1.
      if (!s.playing && s.ui.run >= lastRun(s)) return { ...s, playing: true, flash: true, ui: { ...s.ui, fromRun: s.ui.run, run: 0 } };
      return { ...s, playing: !s.playing };
    case 'tab':
      return { ...s, flash: false, ui: { ...s.ui, tab: a.tab } };
    case 'pick': {
      // Show the event in the queue tab that lists it; keep the chosen option when it is already selected.
      const tab = a.tab ?? (s.data ? queueTabFor(s.data, s.ui, a.id) : null) ?? s.ui.tab;
      const opt = a.id === s.ui.sel ? s.ui.opt : DEFAULT_OPTION;
      return { ...s, modal: false, flash: false, ui: { ...s.ui, sel: a.id, opt, tab } };
    }
    case 'opt':
      return { ...s, ui: { ...s.ui, opt: a.opt } };
    case 'modal':
      // Playback would move the run, and the plan under review, while the dialog is open.
      return { ...s, modal: a.open, playing: a.open ? false : s.playing };
    case 'decide':
      return { ...s, modal: false, ui: { ...s.ui, dec: a.dec } };
    case 'budget':
      return { ...s, ui: { ...s.ui, budget: a.budget } };
  }
}

function initState(): State {
  return { status: 'loading', data: null, playing: false, modal: false, flash: false, attempt: 0, ui: { run: 0, tab: 'needs', sel: null, opt: DEFAULT_OPTION, budget: readBudget(), dec: NO_DECISIONS } };
}

/** Brings the workspace into view when a selection is made from further down the page. */
function revealWorkspace() {
  const el = document.getElementById('workspace');
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

export function App() {
  const [s, dispatch] = useReducer(reducer, undefined, initState);
  useHoverCardFit();

  useEffect(() => {
    let live = true;
    loadConsoleData()
      .then((data) => live && dispatch({ type: 'loaded', data }))
      .catch(() => live && dispatch({ type: 'failed' }));
    return () => {
      live = false;
    };
  }, [s.attempt]);

  useEffect(() => {
    if (!s.playing) return;
    const t = window.setInterval(() => dispatch({ type: 'tick' }), PLAY_MS);
    return () => window.clearInterval(t);
  }, [s.playing]);

  useEffect(() => writeBudget(s.ui.budget), [s.ui.budget]);

  const view = useMemo(() => (s.data ? buildView(s.data, s.ui) : null), [s.data, s.ui]);
  const pick = useCallback((id: number) => dispatch({ type: 'pick', id }), []);
  const pickAndReveal = useCallback((id: number, tab?: QueueTab) => {
    dispatch({ type: 'pick', id, tab });
    requestAnimationFrame(revealWorkspace);
  }, []);

  if (!view) {
    return (
      <div className="page">
        <Header kpis={[]} budget={s.ui.budget} onBudget={(budget) => dispatch({ type: 'budget', budget })} />
        <NextDecision
          next={{ tone: 'neutral', label: '', text: '', eventId: null, showing: false }}
          loading={s.status === 'error' ? 'error' : 'loading'}
          onOpen={pick}
          onRetry={() => dispatch({ type: 'retry' })}
        />
      </div>
    );
  }

  const planner = view.ws.kind === 'event' ? view.ws.planner : null;
  const notes = view.facts;
  return (
    <>
      <div className="page">
        <Header kpis={view.kpis} budget={view.budget} facts={view.facts} satellites={view.satellites} onBudget={(budget) => dispatch({ type: 'budget', budget })} />
        <NextDecision next={view.next} onOpen={(id) => pickAndReveal(id, 'needs')} />
        <div className="main">
          <div className="col col-left">
            <Queue q={view.queue} flash={s.flash} run={view.run} onTab={(tab) => dispatch({ type: 'tab', tab })} onPick={pick} />
            <SinceLastRun d={view.digest} onPick={(id) => pickAndReveal(id)} />
            <DecisionLog rows={view.log} />
          </div>
          <Workspace
            ws={view.ws}
            budget={view.budget}
            onOpt={(opt) => dispatch({ type: 'opt', opt })}
            onReview={() => dispatch({ type: 'modal', open: true })}
            onDefer={() => dispatch({ type: 'decide', dec: defer(s.ui, view) })}
          />
          <aside aria-label="Outlook" className="col col-right">
            <Warnings24h w={view.warnings} onPick={(id) => pickAndReveal(id)} />
            <OrbitContext g={view.globe} lapse={view.lapse} />
          </aside>
        </div>
        <Timeline
          dock={view.dock}
          T={view.T}
          runH={view.runH}
          lapse={view.lapse}
          flash={s.flash}
          legend={view.legend}
          clock={view.clock}
          run={view.run}
          runs={view.runs}
          playing={s.playing}
          onPlay={() => dispatch({ type: 'play' })}
          onStep={(d) => dispatch({ type: 'run', run: s.ui.run + d })}
          onRun={(run) => dispatch({ type: 'run', run })}
          onPick={(id) => pickAndReveal(id)}
        />
        <p className="notes">
          Data notes: each message is a real ESA training-set CDM, with timing kept relative to closest approach; the 21-day calendar is simulated, with 64 runs 8 h apart; the last run falls at its close, Day 22 00:00. Pc model: encounter plane from the CDM’s
          relative state, both covariances and object sizes; it reproduces ESA’s Pc within 0.1 orders of magnitude for {notes.pcModelWithin01} of {notes.coaMessages} escalation messages. Burn
          response: Clohessy-Wiltshire, checked against two-body propagation. Not modelled: drag, J2, burn execution error, re-screening against the full catalogue. Spacecraft: 1,000 kg, 1 N, Isp
          220 s assumed. Δv budget is a tweak (now {view.budget} mm/s).
        </p>
      </div>
      {s.modal && planner && (
        <ApprovalModal
          m={planner.modal}
          clock={view.clock}
          onClose={() => dispatch({ type: 'modal', open: false })}
          onApprove={() => dispatch({ type: 'decide', dec: approve(s.ui, view) })}
        />
      )}
    </>
  );
}
