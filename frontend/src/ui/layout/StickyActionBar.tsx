import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './shared';

export type StickyActionBarProps = {
  children?: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>;

// StickyActionBar — pins primary actions to the bottom of a scroll area for
// thumb reach (review §11), clearing the home-indicator via `--safe-bottom`.
// Deliberately a plain container with role="group": it does NOT manage focus,
// so tab order flows straight through and it can never trap the keyboard —
// unlike a modal, a sticky bar is part of the page.
export function StickyActionBar({ children, className, ...rest }: StickyActionBarProps) {
  return (
    <div className={cx('wp-sticky-actions', className)} role="group" {...rest}>
      {children}
    </div>
  );
}
