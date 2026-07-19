// Skeleton — chrome-preserving loading placeholders (ADR-0078, U-10). Shape
// primitives (line/block/circle) with a subtle shimmer that collapses to static
// under prefers-reduced-motion (feedback.css). Purely decorative, so every
// skeleton is aria-hidden — the accompanying LoadingState carries the live label.
import type { CSSProperties } from 'react';

type SkeletonShape = 'line' | 'block' | 'circle';

function size(value?: string | number): string | undefined {
  if (value == null) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

export function Skeleton({
  shape = 'line',
  width,
  height,
  // For shape="line" only: render N stacked lines (the last one shorter, as text
  // wraps). Ignored for block/circle.
  lines = 1,
  className = '',
}: {
  shape?: SkeletonShape;
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
}) {
  const style: CSSProperties = {
    inlineSize: size(width),
    blockSize: size(height),
  };

  if (shape === 'line' && lines > 1) {
    return (
      <div className={`fb-skel-lines ${className}`.trim()} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="fb-skel fb-skel-line"
            style={{ inlineSize: i === lines - 1 ? '60%' : size(width) }}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={`fb-skel fb-skel-${shape} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}
