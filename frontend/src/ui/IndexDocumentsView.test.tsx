// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';

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

import { IndexDocumentsView } from './IndexDocumentsView';
import { t } from '../i18n/he';

describe('IndexDocumentsView (ADR-0098/ADR-0101)', () => {
  afterEach(() => cleanup());

  it('renders the back row titled "מסמכים" (ADR-0101) and the (unchanged) DocumentsSection content', () => {
    render(wrapNav(<IndexDocumentsView onClose={() => {}} />));
    expect(screen.getByRole('button', { name: t.index.backAria })).toBeTruthy();
    expect(screen.getByText(t.docs.title)).toBeTruthy();
    expect(screen.queryByText(t.index.back)).toBeNull();
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();
  });

  it('calls onClose when the back button is tapped', () => {
    const onClose = vi.fn();
    render(wrapNav(<IndexDocumentsView onClose={onClose} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
