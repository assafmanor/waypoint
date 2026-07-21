// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Collapsible, CollapseToggle } from './Collapsible';

describe('CollapseToggle', () => {
  afterEach(() => cleanup());

  it('shows the expand label (with count) while collapsed, and reports aria-expanded=false', () => {
    render(
      <CollapseToggle
        expanded={false}
        onToggle={() => {}}
        expandLabel="הצג הזמנות מהעבר (5)"
        collapseLabel="הסתר הזמנות מהעבר"
      />,
    );
    const btn = screen.getByRole('button', { name: 'הצג הזמנות מהעבר (5)' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the collapse label while expanded, and reports aria-expanded=true', () => {
    render(
      <CollapseToggle
        expanded
        onToggle={() => {}}
        expandLabel="הצג הזמנות מהעבר (5)"
        collapseLabel="הסתר הזמנות מהעבר"
      />,
    );
    const btn = screen.getByRole('button', { name: 'הסתר הזמנות מהעבר' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onToggle on click', () => {
    const onToggle = vi.fn();
    render(
      <CollapseToggle
        expanded={false}
        onToggle={onToggle}
        expandLabel="show"
        collapseLabel="hide"
      />,
    );
    screen.getByRole('button', { name: 'show' }).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Collapsible', () => {
  afterEach(() => cleanup());

  it('always renders its children, toggling the "on" class rather than unmounting', () => {
    const { container, rerender } = render(
      <Collapsible expanded={false}>
        <div>content</div>
      </Collapsible>,
    );
    expect(screen.getByText('content')).toBeTruthy();
    expect(container.querySelector('.wp-collapsible')?.classList.contains('on')).toBe(false);

    rerender(
      <Collapsible expanded>
        <div>content</div>
      </Collapsible>,
    );
    expect(container.querySelector('.wp-collapsible')?.classList.contains('on')).toBe(true);
  });
});
