// Δv budget preference, kept in this browser only. Storage can be missing or blocked, so every access is guarded.

import { BUDGET_MAX, BUDGET_MIN } from './components/Header';

const KEY = 'needle.dvBudgetMmS';
export const DEFAULT_BUDGET = 10;

export function readBudget(): number {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= BUDGET_MIN && v <= BUDGET_MAX ? v : DEFAULT_BUDGET;
  } catch {
    return DEFAULT_BUDGET;
  }
}

export function writeBudget(v: number): void {
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    // Private windows and blocked storage: the budget still applies for this session.
  }
}
