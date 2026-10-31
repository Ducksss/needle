import type { KeyboardEvent } from 'react';
import type { PlanKey } from '../model/options';
import type { ForecastCardView, MsgRow, OptionsView, OtherView, WorkspaceView } from '../model/workspace';
import { CostOfWaiting, EncounterPlane, MessageHistory } from './Charts';
import { Chip } from './Chip';
import { CRIT_NAME } from '../model/forecast';
import { Hover } from './Hover';

interface WorkspaceProps {
  ws: WorkspaceView;
  budget: number;
  onOpt: (k: PlanKey) => void;
  onReview: () => void;
  onDefer: () => void;
}

export function Workspace({ ws, budget, onOpt, onReview, onDefer }: WorkspaceProps) {
  if (ws.kind === 'empty') {
    return (
      <section aria-label="Workspace" className="card workspace" id="workspace">
        <p className="ws-empty">{ws.text}</p>
      </section>
    );
  }
  const h = ws.header;
  return (
    <section aria-label="Workspace" className="card workspace" id="workspace">
      <div className="ws-head">
        <div className="ws-title">
          <span className="meta">
            {h.sat}
            {h.orbit && <span className="mono"> · {h.orbit}</span>} · vs {h.obj}
          </span>
          <div className="ws-title-row">
            <h2>
              Event <span className="mono">#{h.id}</span>
            </h2>
            <Hover className="help ws-chip" title={h.chip.label} lines={[h.chip.tip]}>
              <Chip label={h.chip.label} tone={h.chip.tone} />
            </Hover>
          </div>
          <span className="ws-status">{h.status}</span>
        </div>
        <dl className="ws-stats">
          <div>
            <dt>{h.pcLabel}</dt>
            <dd style={{ color: h.color }}>{h.pc}</dd>
            {h.odds && <dd className="odds">{h.odds}</dd>}
          </div>
          <div>
            <dt>Miss</dt>
            <dd style={{ color: h.missColor }}>{h.miss}</dd>
          </div>
          <div>
            <dt>{h.tcaLabel}</dt>
            <dd>{h.tcaTxt}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{h.msgs}</dd>
          </div>
        </dl>
      </div>
      <div className="ws-grid">
        {ws.forecast && <ForecastPanel f={ws.forecast} />}
        <MessageHistory h={ws.hist} />
        {ws.planner && (
          <>
            <EncounterPlane bp={ws.planner.bp} />
            <CostOfWaiting wc={ws.planner.wc} budget={budget} />
            <Options opts={ws.planner.opts} onOpt={onOpt} onReview={onReview} onDefer={onDefer} />
          </>
        )}
        {ws.other && <Other other={ws.other} />}
        {ws.other && <MessagesReceived rows={ws.msgRows} />}
      </div>
    </section>
  );
}

function Options({ opts, onOpt, onReview, onDefer }: { opts: OptionsView; onOpt: (k: PlanKey) => void; onReview: () => void; onDefer: () => void }) {
  const off = (o: OptionsView['rows'][number]) => (opts.locked || o.passed) && !o.on;
  const live = opts.rows.filter((o) => !off(o));
  const tabKey = (opts.rows.find((o) => o.on) ?? live[0])?.key;
  // Radio group pattern: one tab stop; arrow keys move focus and the choice together, skipping disabled options.
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const d = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d || live.length < 2) return;
    ev.preventDefault();
    const cur = Math.max(0, live.findIndex((o) => o.key === tabKey));
    const next = live[(cur + d + live.length) % live.length];
    ev.currentTarget.querySelector<HTMLButtonElement>('[data-key="' + next.key + '"]')?.focus();
    onOpt(next.key);
  };
  return (
    <div className="ws-cell" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="ws-cell-title">Options</span>
        <span className="meta">{opts.basis}</span>
      </div>
      <div role="radiogroup" aria-label="Burn options" className="options" onKeyDown={onKey}>
        <div className="opt-grid opt-head" aria-hidden="true">
          <span>Option</span>
          <span>Δv</span>
          <span>Pc after</span>
          <span>Miss after</span>
        </div>
        {opts.rows.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={o.on}
            data-key={o.key}
            tabIndex={o.key === tabKey ? 0 : -1}
            className="opt-grid opt"
            disabled={off(o)}
            title={opts.locked && !o.on ? 'The approved option is fixed.' : o.passed && !o.on ? 'This option’s burn time has passed.' : undefined}
            onClick={() => onOpt(o.key)}
          >
            <span className="opt-name">
              <span>
                {o.name}
                {o.rec && <b className="opt-rec">Recommended</b>}
              </span>
              <span>{o.dir}</span>
            </span>
            <span className="mono">{o.dvTxt}</span>
            <span className="mono" title={o.pcAfterTitle}>
              {o.pcAfter}
            </span>
            <span className="mono">{o.missAfter}</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className={'btn ' + (opts.approved ? 'btn-ok' : 'btn-action')} onClick={onReview}>
          {opts.reviewLabel}
        </button>
        {opts.canDefer && (
          <button type="button" className="btn btn-quiet" onClick={onDefer}>
            Defer to next run
          </button>
        )}
        <span className="meta">{opts.decision}</span>
      </div>
    </div>
  );
}

function Other({ other }: { other: OtherView }) {
  return (
    <div className="ws-cell" style={{ gap: 8 }}>
      <span className="ws-cell-title">{other.title}</span>
      <span className="ws-status">{other.text}</span>
      <dl className="facts">
        {other.facts.map((f) => (
          <div key={f.k} style={{ display: 'contents' }}>
            <dt>{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MessagesReceived({ rows }: { rows: MsgRow[] }) {
  return (
    <div className="ws-cell span-all b-top">
      <div className="card-head">
        <span className="ws-cell-title">Messages received</span>
        <span className="meta">newest first · brief tier against Needle queue</span>
      </div>
      <div role="table" aria-label="Messages received for this event" className="msgs">
        <div role="row" className="msg-row msg-head">
          <span role="columnheader">Msg</span>
          <span role="columnheader">Before TCA</span>
          <span role="columnheader">Pc</span>
          <span role="columnheader">Miss</span>
          <span role="columnheader">Brief tier</span>
          <span role="columnheader">Needle queue</span>
        </div>
        {rows.map((r) => (
          <div role="row" key={r.n} className="msg-row">
            <span role="cell" style={{ color: 'var(--muted)' }}>
              {r.n}
            </span>
            <span role="cell">{r.before}</span>
            <span role="cell" style={{ color: r.pcColor }} title={r.pcTitle}>
              {r.pc}
            </span>
            <span role="cell" style={{ color: r.missColor }}>
              {r.miss}
            </span>
            <span role="cell">
              <Chip label={r.tier} tone={r.tierTone} title={r.tierTip} />
            </span>
            <span role="cell" className="sans">
              {r.queue}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The forecast at closest approach, first in the workspace: where the miss is likely to end and how risky that is. */
function ForecastPanel({ f }: { f: ForecastCardView }) {
  if (f.kind === 'passed') {
    return (
      <section className="ws-cell span-all b-bottom fc" aria-label="Forecast at closest approach">
        <span className="ws-cell-title">Forecast at closest approach</span>
        <span className="meta">{f.text}</span>
      </section>
    );
  }
  const c = f.card;
  return (
    <section className="ws-cell span-all b-bottom fc" aria-label="Forecast at closest approach">
      <div className="card-head">
        <span className="ws-cell-title">Forecast at closest approach</span>
        <span className="meta">{c.lead}</span>
      </div>
      <div className="fc-body">
        <div className="fc-range" role="img" aria-label={`Miss distance: ${c.now.label}, ${c.pred.label}. ${c.band.label}. Log scale with the 1 km line.`}>
          <div className="fc-bar">
            <span className="fc-track" />
            <span className="fc-band" style={{ left: c.band.left, width: c.band.width }} />
            {c.risk && <span className="fc-band-risk" style={{ left: c.risk.left, width: c.risk.width }} />}
            <span className="fc-1km" style={{ left: c.oneKm }}>
              <i>1 km</i>
            </span>
            <span className="fc-now" style={{ left: c.now.left }}>
              <i className={'fc-' + c.now.align}>{c.now.label}</i>
            </span>
            <span className="fc-pred" style={{ left: c.pred.left }}>
              <i className={'fc-' + c.pred.align}>{c.pred.label}</i>
            </span>
          </div>
          <div className="fc-axis" aria-hidden="true">
            {c.ticks.map((t) => (
              <span key={t.label} style={{ left: t.left }}>
                {t.label}
              </span>
            ))}
          </div>
          <span className="fc-band-key">
            <i /> {c.band.label}
          </span>
        </div>
        <dl className="fc-numbers">
          <div>
            <dt>
              <Hover className="help" title="Chance it ends under 1 km" lines={c.pUnder1kmTip}>
                <span className="dotted">Chance it ends under 1 km</span>
              </Hover>
              <small>{c.pUnder1kmBasis}</small>
            </dt>
            <dd className="mono" style={{ color: c.pUnder1kmColor }}>
              {c.pUnder1km}
            </dd>
          </div>
          <div>
            <dt>
              <Hover className="help" title={CRIT_NAME} lines={c.pCriticalTip} side={{ edge: 'right', px: 0 }}>
                <span className="dotted">{CRIT_NAME}</span>
              </Hover>
              <small>{c.pCriticalBasis}</small>
            </dt>
            <dd className={'mono' + (c.pCriticalMissing ? ' fc-missing' : '')} style={{ color: c.pCriticalColor }}>
              {c.pCritical}
            </dd>
          </div>
        </dl>
      </div>
      <span className="fc-foot">{c.footnote}</span>
    </section>
  );
}
