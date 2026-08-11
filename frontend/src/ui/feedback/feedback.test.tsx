// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { StatusBanner } from './StatusBanner';
import { Skeleton } from './Skeleton';
import { LoadingState } from './LoadingState';
import { t } from '../../i18n/he';

describe('EmptyState', () => {
  afterEach(() => cleanup());

  it('renders title and body', () => {
    render(<EmptyState title="אין הזמנות" body="עוד לא הוספתם כלום" />);
    expect(screen.getByText('אין הזמנות')).toBeTruthy();
    expect(screen.getByText('עוד לא הוספתם כלום')).toBeTruthy();
  });

  it('fires the action onClick', () => {
    const onClick = vi.fn();
    render(<EmptyState title="ריק" action={{ label: 'הוספה', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'הוספה' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders no button when no action is given', () => {
    render(<EmptyState title="ריק" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides a decorative icon from the a11y tree', () => {
    const { container } = render(<EmptyState icon={<span>📭</span>} title="ריק" />);
    expect(container.querySelector('.fb-empty-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  // `size="pane"` for an empty state that owns a region rather than sitting in a
  // list's flow (ADR-0138's 2026-08-02 amendment). Only the icon grows, so the
  // marker has to be on the SHELL — a per-icon class would not let CSS scale it.
  it('marks a pane-sized empty state on the shell, and leaves the default alone', () => {
    const { container } = render(<EmptyState size="pane" icon={<span />} title="ריק" />);
    expect(container.querySelector('.fb-empty')?.className).toContain('fb-empty-pane');

    cleanup();
    const plain = render(<EmptyState icon={<span />} title="ריק" />);
    expect(plain.container.querySelector('.fb-empty')?.className).not.toContain('fb-empty-pane');
  });
});

describe('ErrorState', () => {
  afterEach(() => cleanup());

  it('renders the title with an alert role so it is announced', () => {
    render(<ErrorState title="לא הצלחנו לטעון" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('לא הצלחנו לטעון');
  });

  it('calls onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="שגיאה" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.feedback.retry) }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no onRetry is given', () => {
    render(<ErrorState title="שגיאה" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses a custom retry label when provided', () => {
    render(<ErrorState title="שגיאה" onRetry={() => {}} retryLabel="טעינה מחדש" />);
    expect(screen.getByRole('button', { name: /טעינה מחדש/ })).toBeTruthy();
  });

  // `size="pane"` for an error state that owns a region rather than sitting in a list's
  // flow — `EmptyState`'s own variant (ADR-0138's 2026-08-02 amendment), one sibling over;
  // the Map's canvas slot (field report #28) is the first caller.
  it('marks a pane-sized error state on the shell, and leaves the default alone', () => {
    const { container } = render(<ErrorState size="pane" title="שגיאה" />);
    expect(container.querySelector('.fb-error')?.className).toContain('fb-error-pane');

    cleanup();
    const plain = render(<ErrorState title="שגיאה" />);
    expect(plain.container.querySelector('.fb-error')?.className).not.toContain('fb-error-pane');
  });
});

describe('StatusBanner', () => {
  afterEach(() => cleanup());

  it('renders children inside a polite live region', () => {
    render(<StatusBanner tone="offline">אופליין</StatusBanner>);
    const region = screen.getByText('אופליין').closest('.fb-banner');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('applies the tone class', () => {
    render(<StatusBanner tone="warn">שימו לב</StatusBanner>);
    expect(
      screen.getByText('שימו לב').closest('.fb-banner')?.classList.contains('fb-banner-warn'),
    ).toBe(true);
  });

  it('defaults to the neutral tone', () => {
    render(<StatusBanner>הודעה</StatusBanner>);
    expect(
      screen.getByText('הודעה').closest('.fb-banner')?.classList.contains('fb-banner-neutral'),
    ).toBe(true);
  });

  it('fires the action and shows the verb only when provided', () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatusBanner>גרסה חדשה</StatusBanner>);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<StatusBanner action={{ label: 'רענון', onClick }}>גרסה חדשה</StatusBanner>);
    fireEvent.click(screen.getByRole('button', { name: 'רענון' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss and shows the dismiss control only when provided', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<StatusBanner tone="ok">נשמר</StatusBanner>);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <StatusBanner tone="ok" onDismiss={onDismiss}>
        נשמר
      </StatusBanner>,
    );
    fireEvent.click(screen.getByRole('button', { name: t.feedback.dismiss }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Skeleton', () => {
  afterEach(() => cleanup());

  it('renders a shape and is hidden from the a11y tree', () => {
    const { container } = render(<Skeleton shape="block" />);
    const el = container.querySelector('.fb-skel-block');
    expect(el).toBeTruthy();
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the requested number of lines, all decorative', () => {
    const { container } = render(<Skeleton shape="line" lines={3} />);
    expect(container.querySelectorAll('.fb-skel-line').length).toBe(3);
    expect(container.querySelector('.fb-skel-lines')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('LoadingState', () => {
  afterEach(() => cleanup());

  it('renders a labelled live-region spinner', () => {
    render(<LoadingState label="טוען יומן" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('טוען יומן');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('falls back to the default loading label and can host a skeleton', () => {
    const { container } = render(<LoadingState skeleton={<Skeleton shape="line" lines={2} />} />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(t.feedback.loading);
    expect(container.querySelectorAll('.fb-skel-line').length).toBe(2);
  });
});
