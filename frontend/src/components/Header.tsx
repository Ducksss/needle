import { useId } from 'react';
import { useTween } from '../hooks';
import markUrl from '../assets/needle-mark.svg';
import type { ReplayFacts } from '../model/facts';
import type { Kpi } from '../model/header';
import { Hover, TipCard } from './Hover';

/** Budget values the stepper moves through, mm/s. */
export const BUDGET_STEPS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40];
export const BUDGET_MIN = BUDGET_STEPS[0];
export const BUDGET_MAX = BUDGET_STEPS[BUDGET_STEPS.length - 1];

interface HeaderProps {
  kpis: Kpi[];
  budget: number;
  onBudget: (v: number) => void;
  facts?: ReplayFacts;
}

export function Header({ kpis, budget, onBudget, facts }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <img src={markUrl} width={28} height={28} alt="" />
        <span className="brand-name">Needle</span>
        <span style={{ color: 'var(--muted)' }}>Conjunction triage · 19 ESA satellites</span>
      </div>
      <dl className="kpis">
        {kpis.map((k) => (
          <KpiItem key={k.label} k={k} />
        ))}
      </dl>
      <div className="header-right">
        <BudgetControl budget={budget} onBudget={onBudget} />
        <Hover
          className="help badge"
          title="Demo replay"
          side={{ edge: 'right', px: 0 }}
          lines={[
            'Real ESA training-set CDM histories, with message timing kept relative to closest approach, on a simulated 21-day calendar of 8 h screening runs; the last run falls at its close, Day 22 00:00.',
            (facts ? facts.escalated + ' of ' + facts.events + ' replay events' : 'Replay events') + ' reach Pc ≥ 1e-4, against about 1.2% of events in ESA’s training data, so high-risk events are over-sampled about 7×.',
          ]}
        >
          <span className="dotted">Demo replay · high-risk 7× over-sampled</span>
        </Hover>
      </div>
    </header>
  );
}

function KpiItem({ k }: { k: Kpi }) {
  const id = useId();
  // Counts to the new value with the time-lapse.
  const n = Math.round(useTween(Number(k.v)));
  return (
    <div className="tw kpi" tabIndex={0} aria-describedby={id}>
      <dt>{k.label}</dt>
      <dd style={{ color: k.color }}>
        <span aria-hidden="true">{n}</span>
        <span className="sr-only">{k.v}</span>{' '}
        <span className="kpi-delta" style={{ color: k.dColor }}>
          {k.d}
        </span>
      </dd>
      <TipCard id={id} title={k.label} lines={[k.tip]} />
    </div>
  );
}

function BudgetControl({ budget, onBudget }: { budget: number; onBudget: (v: number) => void }) {
  const lower = [...BUDGET_STEPS].reverse().find((v) => v < budget) ?? BUDGET_MIN;
  const higher = BUDGET_STEPS.find((v) => v > budget) ?? BUDGET_MAX;
  return (
    <div className="budget" role="group" aria-label="Δv budget">
      <Hover className="help budget-label" title="Δv budget" lines={['The largest burn the operator will accept without escalation. It sets every decision deadline: after it, the cheapest burn needs more than this.', 'Kept in this browser only.']}>
        <span className="dotted">Δv budget</span>
      </Hover>
      <button type="button" aria-label="Lower the Δv budget" disabled={budget <= BUDGET_MIN} onClick={() => onBudget(lower)}>
        −
      </button>
      <output aria-live="polite">{budget} mm/s</output>
      <button type="button" aria-label="Raise the Δv budget" disabled={budget >= BUDGET_MAX} onClick={() => onBudget(higher)}>
        +
      </button>
    </div>
  );
}
