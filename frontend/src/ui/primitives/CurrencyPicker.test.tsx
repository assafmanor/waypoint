// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { CurrencyPicker, currencyLabel } from './CurrencyPicker';
import { t } from '../../i18n/he';

Element.prototype.scrollIntoView = vi.fn();

describe('currencyLabel', () => {
  it('reads name · symbol · code', () => {
    expect(currencyLabel('JPY')).toMatch(/ · ¥ · JPY$/);
  });

  // `Intl` hands back the CODE for a currency with no distinct symbol, so an
  // unconditional label printed it twice ("לק אלבני · ALL · ALL").
  it('drops the symbol slot when the runtime has no symbol for it', () => {
    expect(currencyLabel('ALL')).toMatch(/ · ALL$/);
    expect(currencyLabel('ALL')).not.toMatch(/ALL · ALL/);
  });
});

describe('CurrencyPicker', () => {
  afterEach(() => cleanup());

  const open = (props: Partial<Parameters<typeof CurrencyPicker>[0]> = {}) =>
    render(wrapNav(<CurrencyPicker onChange={() => {}} onClose={() => {}} {...props} />));

  it('surfaces suggested currencies (+ the current value) first', () => {
    open({ value: 'JPY', suggested: ['ILS'] });
    expect(screen.getByText(t.currencyPicker.suggested)).toBeTruthy();
    expect(screen.getByRole('button', { name: /JPY/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ILS/ })).toBeTruthy();
  });

  it('searches the full ISO-4217 set by code', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: 'kwd' },
    });
    expect(screen.getByRole('button', { name: /KWD/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /JPY/ })).toBeNull();
  });

  it('searches by the currency’s own name, in the app locale', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: 'ין יפני' },
    });
    expect(screen.getByRole('button', { name: /JPY/ })).toBeTruthy();
  });

  it('searches by symbol', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: '₪' },
    });
    expect(screen.getByRole('button', { name: /ILS/ })).toBeTruthy();
  });

  it('fires onChange with the picked code', () => {
    const onChange = vi.fn();
    open({ value: 'JPY', onChange });
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: 'ils' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ILS/ }));
    expect(onChange).toHaveBeenCalledWith('ILS');
  });

  it('shows the no-results empty state for an unmatched query', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(t.currencyPicker.searchPlaceholder), {
      target: { value: 'zzzznotacurrency' },
    });
    expect(screen.getByText(t.currencyPicker.noResults)).toBeTruthy();
  });

  // The variant the reuse costs (ADR-0180 §6): a currency's long name must not
  // push its 3-char code out of the row, which is the zone instance's rule
  // reversed. Asserted at the attribute the CSS keys off, since jsdom has no
  // layout — the geometry itself was settled by rendering the mockup.
  it('marks the sheet as the currency instance, so the row swaps which column flexes', () => {
    open();
    // `document`, not the render container: `Modal` portals to `document.body`
    // (ADR-0090), so nothing it renders is a descendant of what `render` returns.
    expect(document.querySelector('.cp-sheet')?.getAttribute('data-kind')).toBe('currency');
  });
});
