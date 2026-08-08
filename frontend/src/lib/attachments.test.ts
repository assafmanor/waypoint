// ADR-0173's derivations, which are the client half of #26: the silent cascade (§7), the
// context union it borrows whole from ADR-0172 (§2), and the resolution that makes an
// attachment a pointer rather than a permission (§6).
import { describe, expect, it } from 'vitest';
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  type DocumentAttachment,
  type DocumentSummary,
} from '@waypoint/shared';
import {
  attachmentCountFor,
  attachmentCountsByHost,
  attachmentHostInput,
  attachmentsForContext,
  attachmentsForHost,
  documentsForAttachments,
  dropAttachmentsForHostChange,
  isAttachedTo,
} from './attachments';
import { buildHostContextIndex, resolveHostContext } from './host-context';
import type { Booking, TripEvent } from '@waypoint/shared';

const link = (id: string, over: Partial<DocumentAttachment> = {}): DocumentAttachment => ({
  id,
  tripId: 't1',
  documentId: `doc-${id}`,
  createdBy: 'u1',
  createdAt: '2026-08-08T10:00:00.000Z',
  ...over,
});

const doc = (id: string, title = `מסמך ${id}`): DocumentSummary =>
  ({
    id,
    tripId: 't1',
    type: 'other',
    title,
    mimeType: 'application/pdf',
    sizeBytes: 10,
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T09:00:00.000Z',
    updatedBy: 'u1',
  }) as DocumentSummary;

const ev = (id: string, over: Partial<TripEvent> = {}) => ({ id, ...over }) as TripEvent;
const bk = (id: string, over: Partial<Booking> = {}) => ({ id, ...over }) as Booking;

describe('which host a link hangs on', () => {
  it('answers for the two hosts it has', () => {
    const onBooking = link('a1', { bookingId: 'b1' });
    expect(isAttachedTo(onBooking, ENTITY_TYPE.BOOKING, 'b1')).toBe(true);
    expect(isAttachedTo(onBooking, ENTITY_TYPE.EVENT, 'b1')).toBe(false);
  });

  // §4, from the storage side: there is no `placeId` FK, so a place can never match.
  it('never matches a place — it displays, it does not originate', () => {
    expect(isAttachedTo(link('a1', { bookingId: 'b1' }), ENTITY_TYPE.PLACE, 'b1')).toBe(false);
  });

  it('names the FK for a host so no call site spells it', () => {
    expect(attachmentHostInput(ENTITY_TYPE.BOOKING, 'b1')).toEqual({ bookingId: 'b1' });
    expect(attachmentHostInput(ENTITY_TYPE.EVENT, 'e1')).toEqual({ eventId: 'e1' });
  });
});

// The reason this derivation exists at all: a database cascade removes the rows and writes
// NO `Change`, so a peer holding the trip would keep rendering chips for a booking that is
// gone (§7). The backend spec pins the silence; this pins what the client owes because of it.
describe('the silent host cascade', () => {
  const links = [
    link('a1', { bookingId: 'b1' }),
    link('a2', { eventId: 'e1' }),
    link('a3', { bookingId: 'b2' }),
  ];

  it('drops the links a deleted host was carrying', () => {
    const next = dropAttachmentsForHostChange(links, {
      entityType: ENTITY_TYPE.BOOKING,
      entityId: 'b1',
      action: CHANGE_ACTION.DELETE,
    });
    expect(next.map((a) => a.id)).toEqual(['a2', 'a3']);
  });

  // The other end of the row, and the one `ATTACHMENT_HOST_FIELD` cannot name.
  it('drops the links of a deleted DOCUMENT', () => {
    const next = dropAttachmentsForHostChange(links, {
      entityType: ENTITY_TYPE.DOCUMENT,
      entityId: 'doc-a2',
      action: CHANGE_ACTION.DELETE,
    });
    expect(next.map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('ignores anything that is not a delete', () => {
    const next = dropAttachmentsForHostChange(links, {
      entityType: ENTITY_TYPE.BOOKING,
      entityId: 'b1',
      action: CHANGE_ACTION.UPDATE,
    });
    expect(next).toBe(links);
  });

  // Same reference back, so the common case — every change that is not a host delete —
  // cannot cause a re-render.
  it('returns the SAME array when nothing was dropped', () => {
    const next = dropAttachmentsForHostChange(links, {
      entityType: ENTITY_TYPE.PLACE,
      entityId: 'p1',
      action: CHANGE_ACTION.DELETE,
    });
    expect(next).toBe(links);
  });
});

describe('a host reads its whole context', () => {
  const events = [ev('e1', { bookingId: 'b1' })];
  const bookings = [bk('b1')];
  const context = (kind: 'event' | 'booking', id: string) =>
    resolveHostContext(buildHostContextIndex(events, bookings), { kind, id });

  const links = [
    link('a1', { bookingId: 'b1', documentId: 'd-voucher' }),
    link('a2', { eventId: 'e1', documentId: 'd-map' }),
    link('a3', { bookingId: 'b-other', documentId: 'd-other' }),
  ];

  it('unions the pair from either side', () => {
    expect(attachmentsForContext(links, context('booking', 'b1')).map((a) => a.id)).toEqual([
      'a1',
      'a2',
    ]);
    expect(attachmentsForContext(links, context('event', 'e1')).map((a) => a.id)).toEqual([
      'a1',
      'a2',
    ]);
  });

  it('reads one host alone as just its own', () => {
    expect(attachmentsForHost(links, ENTITY_TYPE.BOOKING, 'b1').map((a) => a.id)).toEqual(['a1']);
  });

  it('orders by when it was attached, with the id breaking a same-millisecond tie', () => {
    const same = [
      link('z', { bookingId: 'b1', createdAt: '2026-08-08T10:00:00.000Z' }),
      link('a', { bookingId: 'b1', createdAt: '2026-08-08T10:00:00.000Z' }),
      link('m', { bookingId: 'b1', createdAt: '2026-08-08T09:00:00.000Z' }),
    ];
    expect(attachmentsForHost(same, ENTITY_TYPE.BOOKING, 'b1').map((a) => a.id)).toEqual([
      'm',
      'a',
      'z',
    ]);
  });
});

// §6, and it is the rule that keeps this ADR a pointer rather than a permission.
describe('resolving a link to its document', () => {
  it('renders NOTHING for a document this reader cannot see — an absence, not a stub', () => {
    const links = [link('a1', { bookingId: 'b1', documentId: 'd-mine' })];
    expect(documentsForAttachments(links, [])).toEqual([]);
    expect(documentsForAttachments(links, [doc('d-mine')])).toHaveLength(1);
  });

  it('collapses two links to one document into one chip', () => {
    const links = [
      link('a1', { bookingId: 'b1', documentId: 'd-shared' }),
      link('a2', { eventId: 'e1', documentId: 'd-shared' }),
    ];
    const resolved = documentsForAttachments(links, [doc('d-shared')]);
    expect(resolved).toHaveLength(1);
    // The earliest link wins, so a detach removes the one that has been there longest.
    expect(resolved[0].attachment.id).toBe('a1');
  });

  it('carries the document, so the chip has a title to render', () => {
    const links = [link('a1', { bookingId: 'b1', documentId: 'd1' })];
    const [row] = documentsForAttachments(links, [doc('d1', 'אישור הזמנה')]);
    expect(row.document.title).toBe('אישור הזמנה');
  });
});

describe('per-host counts', () => {
  it('tallies each host once, keyed by kind and id', () => {
    const counts = attachmentCountsByHost([
      link('a1', { bookingId: 'b1' }),
      link('a2', { bookingId: 'b1' }),
      link('a3', { eventId: 'e1' }),
    ]);
    expect(attachmentCountFor(counts, ENTITY_TYPE.BOOKING, 'b1')).toBe(2);
    expect(attachmentCountFor(counts, ENTITY_TYPE.EVENT, 'e1')).toBe(1);
    expect(attachmentCountFor(counts, ENTITY_TYPE.EVENT, 'e-none')).toBe(0);
  });
});
