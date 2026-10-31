import { type KeyboardEvent, useEffect, useRef } from 'react';
import type { ModalView } from '../model/workspace';

interface ApprovalModalProps {
  m: ModalView;
  clock: string;
  onClose: () => void;
  onApprove: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ApprovalModal({ m, clock, onClose, onApprove }: ApprovalModalProps) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="coa-title" tabIndex={-1} className="dialog" onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="dialog-kicker">Approve manoeuvre · {clock}</span>
            <h2 id="coa-title">
              Event #{m.id} · {m.sat} vs {m.obj} · {m.optName}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={'pill ' + (m.approved ? 'pill-ok' : 'pill-wait')}>{m.status}</span>
            <button type="button" className="close" aria-label="Close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14" stroke="#F1F5F9" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="12" y2="12" />
                <line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="dialog-body">
          <div className="dialog-col">
            <span className="caps-8">Burn plan</span>
            <div className="plan-row">
              <div className="attitude">
                <svg viewBox="0 0 220 220" className="fill" role="img" aria-label="Thruster attitude relative to the velocity and radial axes">
                  <circle cx="110" cy="110" r="84" fill="#F8FAFB" stroke="#CBD5E1" />
                  <line x1="20" x2="200" y1="110" y2="110" stroke="#CBD5E1" />
                  <line x1="110" x2="110" y1="20" y2="200" stroke="#CBD5E1" />
                  <g fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#64748B">
                    <text x="204" y="106" textAnchor="end">
                      VELOCITY
                    </text>
                    <text x="16" y="106">
                      ANTI-VEL.
                    </text>
                    <text x="114" y="18">
                      RADIAL OUT
                    </text>
                    <text x="114" y="212">
                      RADIAL IN
                    </text>
                  </g>
                  <line x1="110" y1="110" x2="186" y2="110" stroke="#0F766E" strokeWidth="2" strokeDasharray="4 3" />
                  <path d={m.att.arc} fill="none" stroke="#6D28D9" strokeWidth="1.5" />
                  <line x1="110" y1="110" x2={m.att.x} y2={m.att.y} stroke="#6D28D9" strokeWidth="4" strokeLinecap="round" />
                  <path d={m.att.head} fill="#6D28D9" />
                  <rect x="100" y="104" width="20" height="12" rx="2" fill="#0F172A" />
                  <rect x="84" y="107" width="14" height="6" fill="#FFFFFF" stroke="#0F172A" />
                  <rect x="122" y="107" width="14" height="6" fill="#FFFFFF" stroke="#0F172A" />
                </svg>
              </div>
              <dl className="plan-facts">
                <dt>Planned for</dt>
                <dd style={{ fontWeight: 600 }}>{m.when}</dd>
                <dt>Δv</dt>
                <dd className="mono" style={{ fontSize: 17 }}>
                  {m.dv}
                </dd>
                <dt>Thrust direction</dt>
                <dd>{m.dirLong}</dd>
                <dt>Out of plane</dt>
                <dd>{m.beta}°</dd>
                <dt>Burn duration</dt>
                <dd>{m.burn}</dd>
                <dt>Propellant</dt>
                <dd>{m.prop}</dd>
                <dt>Orbit change</dt>
                <dd>{m.dA}</dd>
              </dl>
            </div>
            <p className="why">
              <span style={{ fontWeight: 700 }}>Why this works. </span>
              {m.rationale}
            </p>
          </div>
          <div className="dialog-col">
            <span className="caps-8">Predicted outcome at closest approach</span>
            <div className="outcome">
              <div>
                <span className="meta">Miss distance</span>
                <span className="mono">
                  <span style={{ color: 'var(--risk)' }}>{m.missNow}</span> → <span style={{ color: 'var(--action)', fontSize: 16 }}>{m.missAfter}</span>
                </span>
              </div>
              <div>
                <span className="meta">Collision probability</span>
                <span className="mono">
                  <span style={{ color: 'var(--risk)' }}>{m.pcNow}</span> → <span style={{ color: 'var(--action)', fontSize: 16 }}>{m.pcAfter}</span>
                </span>
                <span className="odds">
                  {m.pcNowOdds ?? 'at the floor'} → {m.pcAfterOdds ?? 'at the floor'}
                </span>
              </div>
            </div>
            <span className="caps-8" style={{ marginTop: 4 }}>
              Gate checks
            </span>
            <ul className="checks">
              {m.checks.map((c) => (
                <li key={c.title}>
                  <span className="check-icon" role="img" style={{ background: c.ok ? 'var(--ok)' : 'var(--hidden)' }} aria-label={c.ok ? 'Passed' : 'Caution'}>
                    {c.ok ? '✓' : '!'}
                  </span>
                  <span>
                    <span style={{ fontWeight: 600 }}>{c.title}</span> <span style={{ color: 'var(--muted)' }}>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="dialog-foot">
          <span className="meta">The planner proposes; the gate checks are deterministic; the operator approves. The gate reuses the planner’s model, so flight dynamics must still verify.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={'btn ' + (m.approved ? 'btn-ok' : 'btn-action')} onClick={onApprove} disabled={m.approved}>
              {m.approveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
