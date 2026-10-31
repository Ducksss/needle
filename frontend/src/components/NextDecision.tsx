import type { NextDecision as Next } from '../model/header';

export function NextDecision({ next, loading, onOpen }: { next: Next; loading?: string; onOpen: (id: number) => void }) {
  if (loading) {
    return (
      <section aria-label="Next decision" className="next next-neutral">
        <span className="next-label">{loading === 'error' ? 'Data error' : 'Loading'}</span>
        <span className="next-text">{loading === 'error' ? 'Could not load the replay data.' : 'Loading the replay data.'}</span>
      </section>
    );
  }
  return (
    <section aria-label="Next decision" className={'next next-' + next.tone}>
      <span className="next-label">{next.label}</span>
      <span className="next-text">{next.text}</span>
      {next.eventId != null && (
        <button type="button" className="btn btn-dark" onClick={() => onOpen(next.eventId!)}>
          Open in workspace
        </button>
      )}
    </section>
  );
}
