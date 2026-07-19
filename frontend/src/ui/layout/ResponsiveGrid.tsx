import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx, spaceVar, type Space } from './shared';

export type ResponsiveGridProps = {
  /** Minimum column width before the grid wraps to fewer columns. */
  min?: string;
  /** Gap between cells, a step on the `--space-*` ramp (default 4 = 16px). */
  gap?: Space;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children' | 'style'>;

// ResponsiveGrid — an auto-fit grid that reflows by available width, no media
// queries per use. `min(min, 100%)` keeps a single column from overflowing a
// narrow phone. This is what unblocks the tablet two-column Plan builder
// (review §11) once screens adopt it.
export function ResponsiveGrid({
  min = '240px',
  gap = 4,
  className,
  style,
  children,
  ...rest
}: ResponsiveGridProps) {
  return (
    <div
      className={cx('wp-grid', className)}
      style={{
        gap: spaceVar(gap),
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
