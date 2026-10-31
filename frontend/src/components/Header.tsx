import type { Kpi } from '../model/header';
import { useId } from 'react';
import { Hover, TipCard } from './Hover';

/** Budget values the stepper moves through, mm/s. */
export const BUDGET_STEPS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40];
export const BUDGET_MIN = BUDGET_STEPS[0];
export const BUDGET_MAX = BUDGET_STEPS[BUDGET_STEPS.length - 1];

interface HeaderProps {
  kpis: Kpi[];
  budget: number;
  onBudget: (v: number) => void;
}

export function Header({ kpis, budget, onBudget }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 26 26" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="13" cy="13" r="10.5" />
          <line x1="6.5" y1="19.5" x2="19.5" y2="6.5" />
        </svg>
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
        <span className="badge">Demo replay · real CDMs · simulated calendar · high-risk events about 7× over-sampled</span>
      </div>
    </header>
  );
}

function KpiItem({ k }: { k: Kpi }) {
  const id = useId();
  return (
    <div className="tw kpi" tabIndex={0} aria-describedby={id}>
      <dt>{k.label}</dt>
      <dd style={{ color: k.color }}>
        {k.v}{' '}
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
