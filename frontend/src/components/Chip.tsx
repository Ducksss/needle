import type { Tone } from '../model/theme';

interface ChipProps {
  label: string;
  tone: Tone;
  /** Native tooltip, for chips inside dense lists. */
  title?: string;
  className?: string;
}

export function Chip({ label, tone, title, className }: ChipProps) {
  return (
    <span className={'chip ' + (className ?? '')} style={{ background: tone.bg, color: tone.fg }} title={title}>
      {label}
    </span>
  );
}
