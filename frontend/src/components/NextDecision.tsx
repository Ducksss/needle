import type { NextDecision as Next } from '../model/header';

interface NextDecisionProps {
  next: Next;
  loading?: 'loading' | 'error';
  onOpen: (id: number) => void;
  onRetry?: () => void;
}

export function NextDecision({ next, loading, onOpen, onRetry }: NextDecisionProps) {
  if (loading) {
    return (
      <section aria-label="Next decision" className="next next-neutral">
        <span className="next-label">{loading === 'error' ? 'Data error' : 'Loading'}</span>
        <span className="next-text">{loading === 'error' ? 'Could not load the replay data.' : 'Loading the replay data.'}</span>
        {loading === 'error' && onRetry && (
          <button type="button" className="btn btn-dark" onClick={onRetry}>
            Retry
          </button>
        )}
      </section>
    );
  }
  return (
    <section aria-label="Next decision" className={'next next-' + next.tone}>
      <span className="next-label">{next.label}</span>
      <span className="next-text">{next.text}</span>
      {next.eventId != null &&
        (next.showing ? (
          <span className="next-showing">Showing in workspace</span>
        ) : (
          <button type="button" className="btn btn-dark" onClick={() => onOpen(next.eventId!)}>
            Open in workspace
          </button>
        ))}
    </section>
  );
}
