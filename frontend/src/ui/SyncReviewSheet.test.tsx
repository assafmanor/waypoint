// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { db } from '../db';
import { EVENTS } from '../fixtures';
import {
  enqueueOutbox,
  flushOutbox,
  getSyncFailures,
  initOutboxCount,
  type OutboxOp,
} from '../lib/outbox';
import { SyncReviewSheet } from './SyncReviewSheet';
import { t } from '../i18n/he';

const TRIP_ID = EVENTS[0].tripId;

// SyncReviewSheet → Sheet → Modal → useOverlay needs the router + toast + nav
// providers, the same nesting App.tsx uses (see Modal.test.tsx).
function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const bookingOp = (id: string): OutboxOp =>
  ({ verb: 'createBooking', input: { id, type: 'restaurant', title: 'מסעדה' } }) as OutboxOp;

/** Drive a queued booking write to a recorded sync failure (a non-allowlisted 4xx). */
async function recordFailure(id: string): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'BOOKING_INVALID' } }), { status: 400 }),
      ),
    ),
  );
  await enqueueOutbox(TRIP_ID, bookingOp(id));
  await flushOutbox(TRIP_ID);
  vi.unstubAllGlobals();
}

beforeEach(async () => {
  await db.outbox.clear();
  await initOutboxCount();
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await db.outbox.clear();
  await initOutboxCount();
});

describe('SyncReviewSheet (U-04 dead-letter)', () => {
  it('lists each failed write with its reason code', async () => {
    await recordFailure('bk-list');
    render(wrap(<SyncReviewSheet onClose={() => {}} />));
    expect(screen.getByText(t.sync.verb.createBooking)).toBeTruthy();
    expect(screen.getByText('BOOKING_INVALID')).toBeTruthy();
  });

  it('retry re-enqueues the op and removes the failure', async () => {
    await recordFailure('bk-retry');
    expect(await db.outbox.count()).toBe(0);
    // Offline so retry re-queues without an immediate flush draining it.
    vi.stubGlobal('navigator', { onLine: false });

    render(wrap(<SyncReviewSheet onClose={() => {}} />));
    fireEvent.click(screen.getByText(t.sync.review.retry));

    // The store clears the failure → the sheet re-renders to its empty state.
    expect(await screen.findByText(t.sync.review.empty)).toBeTruthy();
    expect(getSyncFailures()).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1);
  });

  it('does not auto-clear on a timer', async () => {
    await recordFailure('bk-timer');
    vi.useFakeTimers();
    render(wrap(<SyncReviewSheet onClose={() => {}} />));
    expect(screen.getByText(t.sync.verb.createBooking)).toBeTruthy();
    vi.advanceTimersByTime(30_000);
    expect(screen.getByText(t.sync.verb.createBooking)).toBeTruthy();
    vi.useRealTimers();
  });
});
