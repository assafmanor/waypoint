// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { SearchOverlay } from './SearchOverlay';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('SearchOverlay (ADR-0101)', () => {
  afterEach(() => cleanup());

  it('renders the top bar (back button, title, context label), the field, and children', () => {
    render(
      wrap(
        <SearchOverlay
          title="חיפוש הזמנות"
          mode="trip"
          contextLabel="לפלנד '26"
          query=""
          onQueryChange={() => {}}
          placeholder="חפשו..."
          clearLabel="נקה"
          backAria="סגירה"
          onClose={() => {}}
        >
          <div>result row</div>
        </SearchOverlay>,
      ),
    );
    expect(screen.getByText('חיפוש הזמנות')).toBeTruthy();
    expect(screen.getByText("לפלנד '26")).toBeTruthy();
    expect(screen.getByPlaceholderText('חפשו...')).toBeTruthy();
    expect(screen.getByText('result row')).toBeTruthy();
  });

  it('focuses the search field on open, not the dialog container', () => {
    render(
      wrap(
        <SearchOverlay
          title="t"
          mode="trip"
          query=""
          onQueryChange={() => {}}
          placeholder="חפשו..."
          clearLabel="נקה"
          backAria="סגירה"
          onClose={() => {}}
        >
          <div />
        </SearchOverlay>,
      ),
    );
    expect(document.activeElement).toBe(screen.getByPlaceholderText('חפשו...'));
  });

  it('calls onQueryChange as the user types, and onClose from the clear button and the back button', () => {
    const onQueryChange = vi.fn();
    const onClose = vi.fn();
    render(
      wrap(
        <SearchOverlay
          title="t"
          mode="trip"
          query="abc"
          onQueryChange={onQueryChange}
          placeholder="חפשו..."
          clearLabel="נקה"
          backAria="סגירה"
          onClose={onClose}
        >
          <div />
        </SearchOverlay>,
      ),
    );
    fireEvent.change(screen.getByPlaceholderText('חפשו...'), { target: { value: 'abcd' } });
    expect(onQueryChange).toHaveBeenCalledWith('abcd');

    fireEvent.click(screen.getByRole('button', { name: 'נקה' }));
    expect(onQueryChange).toHaveBeenCalledWith('');

    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('registers as an overlay so Escape closes it', () => {
    const onClose = vi.fn();
    render(
      wrap(
        <SearchOverlay
          title="t"
          mode="trip"
          query=""
          onQueryChange={() => {}}
          placeholder="חפשו..."
          clearLabel="נקה"
          backAria="סגירה"
          onClose={onClose}
        >
          <div />
        </SearchOverlay>,
      ),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a clear button when the query is empty', () => {
    render(
      wrap(
        <SearchOverlay
          title="t"
          mode="trip"
          query=""
          onQueryChange={() => {}}
          placeholder="חפשו..."
          clearLabel="נקה"
          backAria="סגירה"
          onClose={() => {}}
        >
          <div />
        </SearchOverlay>,
      ),
    );
    expect(screen.queryByRole('button', { name: 'נקה' })).toBeNull();
  });
});
