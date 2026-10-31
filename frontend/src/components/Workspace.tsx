import type { OptionKey } from '../data/types';
import type { MsgRow, OptionsView, OtherView, WorkspaceView } from '../model/workspace';
import { CostOfWaiting, EncounterPlane, MessageHistory } from './Charts';
import { Chip } from './Chip';
import { Hover } from './Hover';

interface WorkspaceProps {
  ws: WorkspaceView;
  budget: number;
  onOpt: (k: OptionKey) => void;
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
            {h.sat} vs {h.obj}
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
          </div>
          <div>
            <dt>Miss</dt>
            <dd>{h.miss}</dd>
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

function Options({ opts, onOpt, onReview, onDefer }: { opts: OptionsView; onOpt: (k: OptionKey) => void; onReview: () => void; onDefer: () => void }) {
  return (
    <div className="ws-cell" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="ws-cell-title">Options</span>
        <span className="meta">{opts.basis}</span>
      </div>
      <div role="radiogroup" aria-label="Burn options" className="options">
        <div className="opt-grid opt-head" aria-hidden="true">
          <span>Option</span>
          <span>Δv</span>
          <span>Pc after</span>
          <span>Miss after</span>
        </div>
        {opts.rows.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={o.on} className="opt-grid opt" onClick={() => onOpt(o.key)}>
            <span className="opt-name">
              <span>{o.name}</span>
              <span>{o.dir}</span>
            </span>
            <span className="mono">{o.dvTxt}</span>
            <span className="mono">{o.pcAfter}</span>
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
            <span role="cell" style={{ color: r.pcColor }}>
              {r.pc}
            </span>
            <span role="cell">{r.miss}</span>
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
