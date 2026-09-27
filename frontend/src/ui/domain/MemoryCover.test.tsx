// @vitest-environment jsdom
//
// **A finished trip's cover** (ADR-0240 §4). The parts that are conditional are the ones worth a
// test: no picture means no band (never a placeholder, ADR-0219 §3), a one-city trip draws no
// route, and the footer exists only while something is still unmarked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { t } from '../../i18n/he';
import { MemoryCover, type MemoryCoverProps } from './MemoryCover';

const people: MemoryCoverProps['people'] = [
  { id: 'u1', displayName: 'Assaf', avatarHue: 'plum' },
  { id: 'u2', displayName: 'Noam', avatarHue: 'moss' },
];

const base: MemoryCoverProps = { name: 'Japan 26', when: '23.9–2.10', people };

describe('MemoryCover', () => {
  afterEach(() => cleanup());

  it('names the trip, its dates and its people, with no band when there is no picture', () => {
    const { container } = render(<MemoryCover {...base} />);
    // The name is bidi-isolated, so it is matched by content rather than by exact name.
    expect(screen.getByRole('heading').textContent).toContain('Japan 26');
    expect(screen.getByText('23.9–2.10')).toBeTruthy();
    expect(container.querySelectorAll('.mem-faces-row > .wp-av')).toHaveLength(2);
    expect(container.querySelector('.mem-faces-names')?.textContent).toContain('Assaf');
    expect(container.querySelector('.wp-photoband')).toBeNull();
    expect(container.querySelector('.wp-dayhead-foot')).toBeNull();
  });

  it('puts the cover picture at its own density, with its credit', () => {
    const { container } = render(
      <MemoryCover {...base} shot={{ url: '/a.jpg', of: 'Senso-ji', credit: 'CC BY-SA' }} />,
    );
    expect(container.querySelector('.wp-photoband.is-cover')).toBeTruthy();
    expect(container.querySelector('.wp-photoband figcaption')?.textContent).toContain('CC BY-SA');
  });

  it('draws the route only when there are two cities to draw', () => {
    const { container, rerender } = render(<MemoryCover {...base} route={['Reykjavík']} />);
    expect(container.querySelector('.mem-route')).toBeNull();
    rerender(<MemoryCover {...base} route={['Reykjavík', 'Vík', 'Höfn']} />);
    expect(container.querySelectorAll('.mem-route-arrow')).toHaveLength(2);
  });

  it('keeps the stragglers in the footer band while any are unmarked', () => {
    const { container, rerender } = render(
      <MemoryCover {...base} stragglers={{ count: 0, titles: [] }} />,
    );
    expect(container.querySelector('.wp-dayhead-foot')).toBeNull();
    rerender(<MemoryCover {...base} stragglers={{ count: 2, titles: ['Ginza', 'Ueno'] }} />);
    const foot = container.querySelector('.wp-dayhead-foot')!;
    expect(foot.textContent).toContain(t.planHome.past.unresolved(2));
    expect(foot.textContent).toContain('Ginza');
  });

  it('gives the footer its one action, which opens the sheet', () => {
    const onSettle = vi.fn();
    render(
      <MemoryCover {...base} stragglers={{ count: 1, titles: ['Ginza'] }} onSettle={onSettle} />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.planHome.past.settle.action }));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });
});
