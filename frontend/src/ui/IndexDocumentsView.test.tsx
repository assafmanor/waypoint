// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    documents: [],
  }),
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [], useIsOffline: () => false };
});

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { IndexDocumentsView } from './IndexDocumentsView';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('IndexDocumentsView (ADR-0098)', () => {
  afterEach(() => cleanup());

  it('renders the back row and the (unchanged) DocumentsSection content', () => {
    render(wrap(<IndexDocumentsView onClose={() => {}} />));
    expect(screen.getByRole('button', { name: t.index.backAria })).toBeTruthy();
    expect(screen.getByText(t.index.back)).toBeTruthy();
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();
  });

  it('calls onClose when the back button is tapped', () => {
    const onClose = vi.fn();
    render(wrap(<IndexDocumentsView onClose={onClose} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
