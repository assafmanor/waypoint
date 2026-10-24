// @vitest-environment jsdom
// **Field report #32 — a peer's change reaches the app but doesn't repaint the open screen.**
//
// The whole point of this file is that it drives the REAL `lib/ws.ts` over a fake
// `WebSocket`, rather than stubbing `openTripStream` and calling `onChange` by hand the way
// the sibling `trip-state.*` tests do. Everything downstream of `onChange` was already
// sound; what threw the change away was the frame handler itself, and a harness that starts
// at `onChange` cannot see it.
//
// The mechanism, in one line: `Change.seq` is a **global** autoincrement, so an ordered
// frame for one trip routinely skips numbers, the client read the skip as lost frames, and
// it dropped a change it was holding in favour of a snapshot refetch that is allowed to
// fail silently. When that refetch failed the change was gone for good — `lastSeq` had
// already moved past it, so no later gap and no `changes?sinceSeq=` replay would ever
// mention it again, and the screen stayed stale until something remounted the provider.
// That is exactly "navigating away and back makes it appear": a tab switch remounts only
// the body and refetches nothing, so only a route change (which remounts `TripProvider`)
// can heal it.
//
// A day surface is mounted for real, so "it is in reducer state" and "it is on the screen"
// are not allowed to be the same assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CHANGE_ACTION, ENTITY_TYPE, type Change, type TripSnapshot } from '@waypoint/shared';
import { TRIP } from '../fixtures';
import { SHELF_POOL_CAP } from '../constants';
import { t } from '../i18n/he';

const h = vi.hoisted(() => ({ fetchSnapshot: vi.fn(), fetchChanges: vi.fn() }));

// Partial: `lib/ws` reads `API_BASE_URL` from here to build the socket URL, and the real
// ws.ts is the code under test.
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchSnapshot: h.fetchSnapshot,
  fetchChanges: h.fetchChanges,
  isHardEventConfirmError: () => false,
}));
vi.mock('../lib/cache', () => ({
  cacheSnapshot: vi.fn().mockResolvedValue(undefined),
  readCachedSnapshot: vi.fn().mockResolvedValue(null),
  cacheEnrichment: vi.fn().mockResolvedValue(undefined),
  applyChangeToCache: vi.fn().mockResolvedValue(undefined),
  clearTripCache: vi.fn(),
  coerceClearedFields: (x: unknown) => x,
  coerceTripPatch: (x: unknown) => x,
}));
vi.mock('../lib/outbox', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isOffline: () => true, // no mount-time catch-up: the socket is the only way in
  flushOutbox: vi.fn().mockResolvedValue(undefined),
  getSyncFailures: () => [],
  subscribeSyncFailures: () => () => {},
  restOrQueue: vi.fn(),
  // Nothing here has IndexedDB, and `isOffline` above sends every write to the queue —
  // so without this a local verb rolls itself back on a Dexie error and the assertion
  // reads as a render bug.
  enqueueOutbox: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./auth-state', () => ({ useAuth: () => ({ me: null }) }));

import { setSimulatedNow } from '../lib/useClock';
import { TripProvider } from './trip-state';
import { ModeProvider } from './mode-state';
import { MapScopeProvider } from './map-scope-state';
import { DragProvider } from './drag-state';
import { NavProvider } from './nav-state';
import { ToastProvider } from '../ui/Toast';
import { ConfirmProvider } from '../ui/ConfirmDialog';
import { DayView } from '../screens/DayView';
import { useVerbs } from './verbs';

// --- the socket, faked at the browser boundary so the real ws.ts runs -------
const sockets: FakeSocket[] = [];
class FakeSocket {
  static readonly OPEN = 1;
  readyState = 1;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  constructor(readonly url: string) {
    sockets.push(this);
    queueMicrotask(() => this.emit('open', {}));
  }
  addEventListener(type: string, fn: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, ev: unknown) {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
const live = () => sockets[sockets.length - 1];
const deliver = (frame: unknown) =>
  act(async () => {
    live().emit('message', { data: JSON.stringify(frame) });
    await Promise.resolve();
  });

const TRIP_TZ_DAY = '2026-07-08'; // in range, and the pinned clock's "today"
const NOW = Date.parse('2026-07-08T12:00:00+09:00');

const SNAPSHOT: TripSnapshot = {
  trip: TRIP, // 2026-07-05 .. 2026-07-14, Asia/Tokyo
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [],
  tasks: [],
  travelModeOverrides: [],
  documentAttachments: [],
  enrichments: {},
  fxRates: null,
  forecast: null,
  latestSeq: '100',
};

const EVENT_ID = 'ev-peer';
/** What the backend actually logs for an event create: `after: input`, the wire input —
 *  which carries `date`/`title`/`kind`/`startsAt`/`endsAt`, i.e. everything a day surface
 *  needs to place the row. Verified against a running server, not assumed. */
const change = (over: Partial<Change> = {}): Change =>
  ({
    id: `c-${String(over.seq ?? '101')}`,
    tripId: TRIP.id,
    seq: '101',
    entityType: ENTITY_TYPE.EVENT,
    entityId: EVENT_ID,
    action: CHANGE_ACTION.CREATE,
    actorUserId: 'u-noam',
    createdAt: '2026-07-08T02:00:00.000Z',
    after: {
      id: EVENT_ID,
      date: TRIP_TZ_DAY,
      title: 'PEEREVENT',
      kind: 'soft',
      startsAt: '2026-07-08T04:00:00.000Z',
      endsAt: '2026-07-08T05:00:00.000Z',
      source: 'manual',
      sortOrder: 0,
    },
    ...over,
  }) as Change;

/** A `change` frame as the gateway sends it. `prevSeq` is this trip's predecessor. */
const frame = (seq: string, prevSeq: string | undefined, c: Change) => ({
  type: 'change',
  seq,
  prevSeq,
  change: c,
});

const onScreen = (text: string) => Boolean(screen.queryByText(text));

const mount = (day = TRIP_TZ_DAY) =>
  render(
    <MemoryRouter initialEntries={[`/?tab=days&day=${day}`]}>
      <ToastProvider>
        <NavProvider>
          <ConfirmProvider>
            <TripProvider tripId={TRIP.id}>
              <ModeProvider>
                <MapScopeProvider>
                  <DragProvider>
                    <DayView />
                  </DragProvider>
                </MapScopeProvider>
              </ModeProvider>
            </TripProvider>
          </ConfirmProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

const booted = async (day?: string) => {
  mount(day);
  await act(async () => {});
  return screen;
};

beforeEach(() => {
  // jsdom has no layout, and the day surface scrolls its now-line into view on mount.
  Element.prototype.scrollIntoView = () => {};
  sockets.length = 0;
  h.fetchSnapshot.mockReset().mockResolvedValue(SNAPSHOT);
  h.fetchChanges.mockReset().mockResolvedValue([]);
  // A day surface silently reads the real system clock otherwise, so it would mean
  // something different every day it ran.
  setSimulatedNow(NOW);
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  cleanup();
  setSimulatedNow(null);
  vi.unstubAllGlobals();
});

describe('a peer change repaints the open screen (field report #32)', () => {
  it('paints an event created by a peer, with no remount and no route change', async () => {
    await booted();
    expect(onScreen('PEEREVENT')).toBe(false);

    await deliver(frame('101', '100', change()));

    expect(onScreen('PEEREVENT')).toBe(true);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1); // the boot read, and nothing else
  });

  // THE REGRESSION. `Change.seq` is global, so this is what an ordinary peer edit looks
  // like as soon as any other trip has been written to — which is every real database.
  it('paints when the global seq skipped, and does not mistake the skip for lost frames', async () => {
    await booted();

    await deliver(frame('140', '100', change({ seq: '140' })));

    expect(onScreen('PEEREVENT')).toBe(true);
    // `prevSeq` says nothing was missed, so no snapshot refetch was needed at all.
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  // The failure the report describes, reproduced at its root: frames really were missed
  // AND the recovery refetch fails. Pre-fix, the held change was discarded and this was
  // unrecoverable. It must now paint from the frame regardless.
  it('paints a genuinely gapped change even when the recovery refetch fails', async () => {
    await booted();
    h.fetchSnapshot.mockRejectedValue(new Error('offline blip'));

    await deliver(frame('140', '137', change({ seq: '140' })));
    await act(async () => {});

    expect(onScreen('PEEREVENT')).toBe(true);
  });

  // A gap leaves the incremental cursor where the contiguous run ended, so the replay
  // that eventually runs still covers what was skipped instead of resuming past it.
  it('holds the catch-up cursor at the last contiguous change across a gap', async () => {
    await booted();
    h.fetchSnapshot.mockRejectedValue(new Error('offline blip'));

    await deliver(frame('101', '100', change({ seq: '101', entityId: 'ev-a' })));
    await deliver(frame('140', '137', change({ seq: '140' })));
    await act(async () => {});

    // The `online` transition runs the incremental catch-up.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(h.fetchChanges).toHaveBeenCalledWith(TRIP.id, '101');
  });

  it('ignores a frame the mount-time reconnect delivers twice', async () => {
    await booted();

    await deliver(frame('101', '100', change()));
    await deliver(frame('101', '100', change()));

    expect(screen.queryAllByText('PEEREVENT')).toHaveLength(1);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1); // a repeat is not a gap
  });

  describe('update and delete travel the same path', () => {
    const seeded: TripSnapshot = {
      ...SNAPSHOT,
      events: [
        {
          id: EVENT_ID,
          tripId: TRIP.id,
          date: TRIP_TZ_DAY,
          title: 'PEEREVENT',
          kind: 'soft',
          startsAt: '2026-07-08T04:00:00.000Z',
          endsAt: '2026-07-08T05:00:00.000Z',
          status: 'planned',
          sortOrder: 0,
          source: 'manual',
          createdAt: '2026-07-08T02:00:00.000Z',
          updatedAt: '2026-07-08T02:00:00.000Z',
          updatedBy: 'u-noam',
        },
      ],
    };

    beforeEach(() => h.fetchSnapshot.mockResolvedValue(seeded));

    it('repaints a peer rename across a skipped seq', async () => {
      await booted();
      expect(onScreen('PEEREVENT')).toBe(true);

      await deliver(
        frame(
          '140',
          '100',
          change({
            seq: '140',
            action: CHANGE_ACTION.UPDATE,
            after: { title: 'RENAMEDBYPEER' },
          }),
        ),
      );

      expect(onScreen('RENAMEDBYPEER')).toBe(true);
      expect(onScreen('PEEREVENT')).toBe(false);
    });

    it('removes a peer delete across a skipped seq', async () => {
      await booted();
      expect(onScreen('PEEREVENT')).toBe(true);

      await deliver(
        frame('140', '100', change({ seq: '140', action: CHANGE_ACTION.DELETE, after: undefined })),
      );

      expect(onScreen('PEEREVENT')).toBe(false);
    });
  });

  // The Map and the Day view are genuinely different renders (frontend/CLAUDE.md), and an
  // ordering bug that only showed in all-days survived three sessions once. The day-scoped
  // assertions above are half the answer; this is the other half.
  it('paints on a day other than the one on screen, so all-days scopes see it too', async () => {
    await booted('2026-07-10');

    await deliver(
      frame('140', '100', change({ seq: '140', after: { ...change().after, date: '2026-07-10' } })),
    );

    expect(onScreen('PEEREVENT')).toBe(true);
  });
});

// **Field report #40 — the shelf's half of the same promise.** `maybeItem` had no memory
// channel at all, so a peer's idea was mirrored into Dexie and then dropped: the Maybe
// shelf, the Map's `אולי` facet and Plan's shelf all read one `maybeItems`, and all three
// stayed stale until a route remount refetched the snapshot. Every test here mounts the
// consumer BEFORE the frame arrives, so "it is in the reducer" cannot pass for "it is on
// the screen" — the assertion is the rendered tile.
describe("a peer's idea reaches the Maybe shelf (field report #40)", () => {
  const IDEA_ID = 'mb-peer';
  const idea = (over: Partial<Change> = {}): Change =>
    change({
      entityType: ENTITY_TYPE.MAYBE_ITEM,
      entityId: IDEA_ID,
      after: { id: IDEA_ID, title: 'PEERIDEA', icon: '📍', consumed: false },
      ...over,
    });

  it('paints an idea a peer added, with no remount and no route change', async () => {
    await booted();
    expect(onScreen('PEERIDEA')).toBe(false);

    await deliver(frame('101', '100', idea()));

    expect(onScreen('PEERIDEA')).toBe(true);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1); // the boot read, and nothing else
  });

  // The witness the report actually described is an add from the MAP, which creates an idea
  // with no `targetDate` — so it lands in the pool rather than the day's own group. Ranking
  // and grouping are the shelf's, but the idea has to arrive at all first.
  it('paints an undated idea, which is what a Map add creates', async () => {
    await booted();

    await deliver(frame('140', '100', idea({ seq: '140' })));

    expect(onScreen('PEERIDEA')).toBe(true);
  });

  it('paints on a day other than the one on screen — the pool is not day-scoped', async () => {
    await booted('2026-07-10');

    await deliver(frame('140', '100', idea({ seq: '140' })));

    expect(onScreen('PEERIDEA')).toBe(true);
  });

  describe('update and delete travel the same path', () => {
    beforeEach(() =>
      h.fetchSnapshot.mockResolvedValue({
        ...SNAPSHOT,
        maybeItems: [
          {
            id: IDEA_ID,
            tripId: TRIP.id,
            title: 'PEERIDEA',
            icon: '📍',
            consumed: false,
            createdBy: 'u-noam',
            createdAt: '2026-07-08T02:00:00.000Z',
            updatedAt: '2026-07-08T02:00:00.000Z',
            updatedBy: 'u-noam',
          },
        ],
      } satisfies TripSnapshot),
    );

    it('repaints a peer rename', async () => {
      await booted();
      expect(onScreen('PEERIDEA')).toBe(true);

      await deliver(
        frame(
          '140',
          '100',
          idea({ seq: '140', action: CHANGE_ACTION.UPDATE, after: { title: 'RENAMEDIDEA' } }),
        ),
      );

      expect(onScreen('RENAMEDIDEA')).toBe(true);
      expect(onScreen('PEERIDEA')).toBe(false);
    });

    // The other direction, and the one a stale shelf gets wrong most visibly: a peer
    // scheduled the idea, so it is spoken for and must leave the shelf here too.
    it('drops an idea a peer consumed', async () => {
      await booted();

      await deliver(
        frame(
          '140',
          '100',
          idea({ seq: '140', action: CHANGE_ACTION.UPDATE, after: { consumed: true } }),
        ),
      );

      expect(onScreen('PEERIDEA')).toBe(false);
    });

    it('removes a peer delete', async () => {
      await booted();
      expect(onScreen('PEERIDEA')).toBe(true);

      await deliver(
        frame('140', '100', idea({ seq: '140', action: CHANGE_ACTION.DELETE, after: undefined })),
      );

      expect(onScreen('PEERIDEA')).toBe(false);
    });
  });
});

// **Field report #40's second cause, at the render.** The sync half above is only half the
// report: with a healthy shelf and a pool bigger than `SHELF_POOL_CAP`, an idea the user
// just made can rank out of the visible five and the only thing that moves is the tail
// count — which reads as "it did not appear". The pin is asserted through the SCREEN and
// through the app's own verb, with the consumer mounted first, because "it is in
// `maybeItems`" was never the claim in doubt.
describe('an idea you just added is on the shelf (field report #40)', () => {
  /** Five located ideas nearer the day's stop than anything a Map add is likely to be. */
  const seeded: TripSnapshot = {
    ...SNAPSHOT,
    events: [
      {
        id: 'ev-stop',
        tripId: TRIP.id,
        date: TRIP_TZ_DAY,
        title: 'STOP',
        kind: 'soft',
        status: 'planned',
        source: 'manual',
        sortOrder: 0,
        placeId: 'p-stop',
        startsAt: '2026-07-08T04:00:00.000Z',
        endsAt: '2026-07-08T05:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        updatedBy: 'u-me',
      },
    ],
    places: [
      { id: 'p-stop', tripId: TRIP.id, name: 'STOP', lat: 35.6812, lng: 139.7671 },
      { id: 'p-near', tripId: TRIP.id, name: 'NEAR', lat: 35.6813, lng: 139.7671 },
    ].map((p) => ({
      ...p,
      createdAt: '',
      updatedAt: '',
      updatedBy: 'u-me',
    })) as TripSnapshot['places'],
    maybeItems: Array.from({ length: 5 }, (_, i) => ({
      id: `mb-${i}`,
      tripId: TRIP.id,
      title: `RANKED${i}`,
      placeId: 'p-near',
      consumed: false,
      createdBy: 'u-me',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      updatedBy: 'u-me',
    })) as TripSnapshot['maybeItems'],
  };

  /** The Map's add, reached through the real verb rather than a hand-built dispatch. */
  let add: (title: string) => void;
  function VerbProbe() {
    add = useVerbs().addMaybe;
    return null;
  }

  const mountWithProbe = () =>
    render(
      <MemoryRouter initialEntries={[`/?tab=days&day=${TRIP_TZ_DAY}`]}>
        <ToastProvider>
          <NavProvider>
            <ConfirmProvider>
              <TripProvider tripId={TRIP.id}>
                <ModeProvider>
                  <MapScopeProvider>
                    <DragProvider>
                      <DayView />
                      <VerbProbe />
                    </DragProvider>
                  </MapScopeProvider>
                </ModeProvider>
              </TripProvider>
            </ConfirmProvider>
          </NavProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

  beforeEach(() => h.fetchSnapshot.mockResolvedValue(seeded));

  it('shows it on the strip though five better-ranked ideas already fill the cap', async () => {
    mountWithProbe();
    await act(async () => {});
    expect(onScreen('RANKED0')).toBe(true); // the cap is genuinely full before the add

    await act(async () => {
      add('JUSTADDED');
      await Promise.resolve();
    });

    expect(onScreen('JUSTADDED')).toBe(true);
  });

  // The pin costs one ranked tile, once — it does not widen the strip, which is the whole
  // reason `SHELF_POOL_CAP` exists (ADR-0116 §5). `.more` is the tail affordance, which is
  // not a tile and is exactly what the displaced idea went behind.
  it('spends a ranked slot rather than growing the strip', async () => {
    const tiles = () => document.querySelectorAll('.shelf .wp-maybecard:not(.more)').length;
    mountWithProbe();
    await act(async () => {});
    expect(tiles()).toBe(SHELF_POOL_CAP);

    await act(async () => {
      add('JUSTADDED');
      await Promise.resolve();
    });

    expect(tiles()).toBe(SHELF_POOL_CAP);
    // …and the displaced one is behind the tail affordance rather than gone.
    expect(screen.getByText(t.day.shelfMore(1))).toBeTruthy();
  });
});

// Ordinary live delivery and reconnect catch-up funnel through the same `applyRemoteChange`
// and can pass for different reasons, so the replay path gets its own assertion.
describe('reconnect catch-up applies what the socket missed', () => {
  it('replays a peer change fetched by seq and paints it', async () => {
    await booted();
    h.fetchChanges.mockResolvedValueOnce([change({ seq: '140' })]);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });

    expect(onScreen('PEEREVENT')).toBe(true);
    expect(h.fetchChanges).toHaveBeenCalledWith(TRIP.id, '100');
  });
});

// The ephemeral trip-deletion frame is not in the change log and carries no cursor
// (`seq: '0'`). It must still be delivered — the cursor rules above must not swallow it.
describe('the cursor-less trip-deletion frame still lands', () => {
  it('tears the trip down on a seq-0 frame', async () => {
    await booted();

    await deliver(
      frame('0', undefined, {
        id: 'c-gone',
        tripId: TRIP.id,
        seq: '0',
        entityType: ENTITY_TYPE.TRIP,
        entityId: TRIP.id,
        action: CHANGE_ACTION.DELETE,
        actorUserId: 'u-noam',
        createdAt: '2026-07-08T02:00:00.000Z',
      } as Change),
    );

    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1); // not read as a gap either
  });
});
