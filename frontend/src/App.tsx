import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { readBudget, writeBudget } from './budget';
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
import { type Decisions, NO_DECISIONS } from './model/run';
import { type UiState, approve, buildView, defer } from './model/view';

const PLAY_MS = 1200;

interface State {
  status: 'loading' | 'error' | 'ready';
  data: ConsoleData | null;
  ui: UiState;
  playing: boolean;
  modal: boolean;
  /** The run changed by stepping, scrubbing or playback, so changed rows get a short highlight. */
  flash: boolean;
}

type Action =
  | { type: 'loaded'; data: ConsoleData }
  | { type: 'failed' }
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
    case 'run':
      return { ...s, playing: false, flash: true, ui: { ...s.ui, run: Math.max(0, Math.min(lastRun(s), a.run)) } };
    case 'tick':
      if (!s.playing) return s;
      if (s.ui.run >= lastRun(s)) return { ...s, playing: false };
      return { ...s, flash: true, ui: { ...s.ui, run: s.ui.run + 1 } };
    case 'play':
      return { ...s, playing: !s.playing };
    case 'tab':
      return { ...s, ui: { ...s.ui, tab: a.tab } };
    case 'pick':
      return { ...s, modal: false, ui: { ...s.ui, sel: a.id, opt: 'coa1', tab: a.tab ?? s.ui.tab } };
    case 'opt':
      return { ...s, ui: { ...s.ui, opt: a.opt } };
    case 'modal':
      return { ...s, modal: a.open };
    case 'decide':
      return { ...s, modal: false, ui: { ...s.ui, dec: a.dec } };
    case 'budget':
      return { ...s, ui: { ...s.ui, budget: a.budget } };
  }
}

function initState(): State {
  return { status: 'loading', data: null, playing: false, modal: false, flash: false, ui: { run: 0, tab: 'needs', sel: null, opt: 'coa1', budget: readBudget(), dec: NO_DECISIONS } };
}

/** Brings the workspace into view when a selection is made from further down the page. */
function revealWorkspace() {
  const el = document.getElementById('workspace');
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function App() {
  const [s, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    let live = true;
    loadConsoleData()
      .then((data) => live && dispatch({ type: 'loaded', data }))
      .catch(() => live && dispatch({ type: 'failed' }));
    return () => {
      live = false;
    };
  }, []);

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
        <NextDecision next={{ tone: 'neutral', label: '', text: '', eventId: null, showing: false }} loading={s.status === 'error' ? 'error' : 'loading'} onOpen={pick} />
      </div>
    );
  }

  const planner = view.ws.kind === 'event' ? view.ws.planner : null;
  const notes = view.facts;
  return (
    <>
      <div className="page">
        <Header kpis={view.kpis} budget={view.budget} facts={view.facts} onBudget={(budget) => dispatch({ type: 'budget', budget })} />
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
            <OrbitContext g={view.globe} />
          </aside>
        </div>
        <Timeline
          dock={view.dock}
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
          Data notes: each message is a real ESA training-set CDM, with timing kept relative to closest approach; the 21-day calendar is simulated. Pc model: encounter plane from the CDM’s
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
