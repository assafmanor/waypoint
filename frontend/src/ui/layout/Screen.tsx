import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './shared';

export type ScreenProps = {
  as?: ElementType;
  /** `default` = reading column; `wide` opens up on tablet for the Plan builder. */
  size?: 'default' | 'wide';
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

// Screen — the breakpoint-aware content container that retires the blanket
// `max-width: 430px` (design-language "Responsive"): phone identical, a graceful
// wider column on tablet (~768–1024) and a centered max-width on desktop. Screens
// wrap their content in this instead of inheriting a fixed phone width.
export function Screen({
  as: Tag = 'div',
  size = 'default',
  className,
  children,
  ...rest
}: ScreenProps) {
  return (
    <Tag className={cx('wp-screen', className)} data-size={size} {...rest}>
      {children}
    </Tag>
  );
}
