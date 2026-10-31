import { type CSSProperties, type ReactNode, useId } from 'react';
import type { TipSide } from '../model/dock';

/** Keeps thresholds such as 1e-4 and 5 km on one line inside a hover card. */
export function noBreak(text: ReactNode): ReactNode {
  if (typeof text !== 'string') return text;
  const parts = text.split(/(\d+(?:\.\d+)?e-\d+|\d+(?:\.\d+)? (?:km|m|mm\/s|h)\b)/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="nb">
        {p}
      </span>
    ) : (
      p
    ),
  );
}

export const sideStyle = (side: TipSide = { edge: 'left', px: 0 }): CSSProperties => (side.edge === 'left' ? { left: side.px } : { right: side.px });

interface TipCardProps {
  id?: string;
  title: ReactNode;
  lines?: ReactNode[];
  side?: TipSide;
}

/** The dark hover card. Shown by CSS when its .tw parent is hovered or holds keyboard focus. */
export function TipCard({ id, title, lines = [], side }: TipCardProps) {
  return (
    <span className="tt" role="tooltip" id={id} style={sideStyle(side)}>
      <b>{noBreak(title)}</b>
      {lines.map((l, i) => (
        <span key={i}>{noBreak(l)}</span>
      ))}
    </span>
  );
}

interface HoverProps extends TipCardProps {
  className?: string;
  style?: CSSProperties;
  /** Adds a tab stop so keyboard users get the same card. */
  focusable?: boolean;
  children: ReactNode;
}

/** A trigger with a hover card. */
export function Hover({ className, style, focusable = true, title, lines, side, children }: HoverProps) {
  const id = useId();
  return (
    <span className={'tw ' + (className ?? '')} style={style} tabIndex={focusable ? 0 : undefined} aria-describedby={focusable ? id : undefined}>
      {children}
      <TipCard id={id} title={title} lines={lines} side={side} />
    </span>
  );
}
