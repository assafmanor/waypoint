import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import {
  alignItems,
  cx,
  justifyContent,
  spaceVar,
  type Align,
  type Justify,
  type Space,
} from './shared';

type FlowProps = {
  as?: ElementType;
  /** Gap between children, a step on the `--space-*` ramp (default 3 = 12px). */
  gap?: Space;
  align?: Align;
  justify?: Justify;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'style'>;

// Stack — vertical, token-spaced flex column. Gap comes from `--space-*`, never
// a raw px, so vertical rhythm stays on the 4px grid (review §11).
export function Stack({
  as: Tag = 'div',
  gap = 3,
  align,
  justify,
  className,
  style,
  children,
  ...rest
}: FlowProps) {
  return (
    <Tag
      className={cx('wp-stack', className)}
      style={{
        gap: spaceVar(gap),
        alignItems: alignItems(align),
        justifyContent: justifyContent(justify),
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Inline — horizontal counterpart. Flex `row` already flips for RTL, so no
// left/right anywhere; `wrap` opts into multi-line rows.
export function Inline({
  as: Tag = 'div',
  gap = 2,
  align = 'center',
  justify,
  wrap = false,
  className,
  style,
  children,
  ...rest
}: FlowProps & { wrap?: boolean }) {
  return (
    <Tag
      className={cx('wp-inline', className)}
      style={{
        gap: spaceVar(gap),
        alignItems: alignItems(align),
        justifyContent: justifyContent(justify),
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
