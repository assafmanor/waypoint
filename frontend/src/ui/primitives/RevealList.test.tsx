// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RevealList, RevealRow } from './RevealList';
import { revealRows } from '../../lib/filter-reveal';
import { FILTER_STAGGER_MS } from '../../constants';

describe('RevealList (ADR-0120)', () => {
  afterEach(() => cleanup());

  const rowFor = (name: string) => screen.getByText(name).closest('.wp-reveal') as HTMLElement;

  it('keeps filtered-out rows mounted, hidden, inert, and undelayed', () => {
    const { rows } = revealRows(['keep', 'drop', 'keep2'], (i) => i !== 'drop');
    render(
      <RevealList
        className="listcard"
        rows={rows}
        getKey={(i) => i}
        renderRow={(i) => <span>{i}</span>}
      />,
    );

    expect(rowFor('drop').className).toContain('hidden');
    expect(rowFor('drop').hasAttribute('inert')).toBe(true);
    expect(rowFor('drop').style.transitionDelay).toBe('0ms');

    expect(rowFor('keep').className).not.toContain('hidden');
    expect(rowFor('keep').hasAttribute('inert')).toBe(false);
    // Only a visible row can be watched moving, so only it carries the move key.
    expect(rowFor('keep').getAttribute('data-flip-key')).toBe('keep');
    expect(rowFor('drop').getAttribute('data-flip-key')).toBeNull();
    // The stagger counts visible rows only, so the second match follows the first.
    expect(rowFor('keep2').style.transitionDelay).toBe(`${FILTER_STAGGER_MS}ms`);
  });

  it('emits `renderBefore` content outside the collapsing wrapper', () => {
    const { rows } = revealRows(['a', 'b'], () => true);
    render(
      <RevealList
        rows={rows}
        getKey={(i) => i}
        renderRow={(i) => <span>{i}</span>}
        renderBefore={(i) => i === 'a' && <h3>head</h3>}
      />,
    );
    const head = screen.getByRole('heading', { name: 'head' });
    expect(head.closest('.wp-reveal')).toBeNull();
    expect(head.nextElementSibling?.className).toContain('wp-reveal');
  });

  it('exposes the row on its own, for a list that assembles its own container', () => {
    render(
      <RevealRow visible={false} delayMs={40} className="extra">
        <span>solo</span>
      </RevealRow>,
    );
    expect(rowFor('solo').className).toBe('wp-reveal hidden extra');
  });
});
