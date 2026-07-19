import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './shared';

export type SectionProps = {
  /** Section title — rendered as a real heading for landmark/outline a11y. */
  title?: ReactNode;
  /** Heading level for the title (default `h2`). */
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4';
  /** Optional trailing controls in the title row (e.g. a "＋" action). */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'title'>;

// Section — a titled content block (review §11: "owns the `sec-title` pattern").
// The title is a genuine heading element (not a styled div like the shipped
// `.sec-title`), so screen readers get a real document outline.
export function Section({
  title,
  titleAs: Heading = 'h2',
  actions,
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section className={cx('wp-section', className)} {...rest}>
      {(title != null || actions != null) && (
        <div className="wp-section-head">
          {title != null && <Heading className="wp-section-title">{title}</Heading>}
          {actions != null && <div className="wp-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
