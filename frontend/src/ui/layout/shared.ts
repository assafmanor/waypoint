// Shared helpers for the layout primitives (ui/layout). Kept tiny and
// dependency-free: these compose token-driven flex/grid layouts so screens
// never hard-code px gaps or invent breakpoints (review §11 "Layout primitives").

/** A step on the spacing ramp (`--space-1..6`, the 4px grid). */
export type Space = 1 | 2 | 3 | 4 | 5 | 6;

/** Resolve a spacing step to its CSS custom-property reference. */
export function spaceVar(step: Space): string {
  return `var(--space-${step})`;
}

export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type Justify = 'start' | 'center' | 'end' | 'between' | 'around';

const ALIGN: Record<Align, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY: Record<Justify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
};

export const alignItems = (a?: Align): string | undefined => (a ? ALIGN[a] : undefined);
export const justifyContent = (j?: Justify): string | undefined => (j ? JUSTIFY[j] : undefined);

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
