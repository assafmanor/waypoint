import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPE, type DocumentSummary, type DocumentType } from '@waypoint/shared';
import {
  countDocumentsByType,
  countVisibleDocuments,
  groupDocuments,
  matchesDocumentQuery,
  matchesDocumentType,
  visibleDocumentGroups,
  DOCUMENT_TYPE_ALL,
} from './documents';

const ISO = '2026-07-01T00:00:00Z';
const doc = (id: string, type: DocumentType, title = id): DocumentSummary => ({
  id,
  tripId: 't1',
  type,
  title,
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

describe('groupDocuments', () => {
  it('groups by type in passport→insurance→visa→other order, dropping empties', () => {
    const groups = groupDocuments([
      doc('v1', DOCUMENT_TYPE.VISA),
      doc('p1', DOCUMENT_TYPE.PASSPORT),
      doc('p2', DOCUMENT_TYPE.PASSPORT),
    ]);
    expect(groups.map((g) => g.type)).toEqual([DOCUMENT_TYPE.PASSPORT, DOCUMENT_TYPE.VISA]);
    expect(groups[0].docs.map((d) => d.id)).toEqual(['p1', 'p2']);
  });

  it('returns [] for no documents', () => {
    expect(groupDocuments([])).toEqual([]);
  });
});

describe('countDocumentsByType', () => {
  it('counts every type, including the ones with none', () => {
    const counts = countDocumentsByType([
      doc('t1', DOCUMENT_TYPE.TICKET),
      doc('t2', DOCUMENT_TYPE.TICKET),
      doc('p1', DOCUMENT_TYPE.PASSPORT),
    ]);
    expect(counts[DOCUMENT_TYPE.TICKET]).toBe(2);
    expect(counts[DOCUMENT_TYPE.PASSPORT]).toBe(1);
    // Present and zero, not absent — the chip row asks every type whether it has any.
    expect(counts[DOCUMENT_TYPE.HEALTH]).toBe(0);
  });
});

describe('matchesDocumentType', () => {
  it('lets everything through on the "all" sentinel', () => {
    expect(matchesDocumentType(doc('d', DOCUMENT_TYPE.VISA), DOCUMENT_TYPE_ALL)).toBe(true);
  });

  it('matches one type only', () => {
    const d = doc('d', DOCUMENT_TYPE.VISA);
    expect(matchesDocumentType(d, DOCUMENT_TYPE.VISA)).toBe(true);
    expect(matchesDocumentType(d, DOCUMENT_TYPE.TICKET)).toBe(false);
  });
});

describe('matchesDocumentQuery (ADR-0052 §7)', () => {
  const ticket = doc('d1', DOCUMENT_TYPE.TICKET, 'הלוך · NRT');

  it('matches everything on a blank or whitespace query', () => {
    expect(matchesDocumentQuery(ticket, '')).toBe(true);
    expect(matchesDocumentQuery(ticket, '   ')).toBe(true);
  });

  it('matches the title', () => {
    expect(matchesDocumentQuery(ticket, 'NRT')).toBe(true);
    expect(matchesDocumentQuery(ticket, 'nrt')).toBe(true);
  });

  // **The half the owner asked for by name.** The title says nothing about the category, and
  // typing the category is how you look for "the tickets".
  it('matches the type label, singular and plural, on a title that contains neither', () => {
    expect(matchesDocumentQuery(ticket, 'כרטיס')).toBe(true);
    expect(matchesDocumentQuery(ticket, 'כרטיסים')).toBe(true);
  });

  it('matches a synonym — the word actually in your hand, not the word we filed it under', () => {
    expect(matchesDocumentQuery(ticket, 'בורדינג')).toBe(true);
    expect(matchesDocumentQuery(doc('d2', DOCUMENT_TYPE.RESERVATION, 'שינג׳וקו'), 'מלון')).toBe(
      true,
    );
  });

  it('does not match another type’s label', () => {
    expect(matchesDocumentQuery(ticket, 'דרכון')).toBe(false);
  });

  // The words the owner named when the table was widened (2026-08-13), each on the type whose
  // documents someone typing it actually wants.
  describe('the widened synonym table', () => {
    const hire = doc('h1', DOCUMENT_TYPE.RESERVATION, 'Toyota · שדה התעופה');
    const vaccines = doc('v1', DOCUMENT_TYPE.HEALTH, 'נועה');
    const policy = doc('i1', DOCUMENT_TYPE.INSURANCE, 'הראל');
    const idp = doc('l1', DOCUMENT_TYPE.LICENSE, 'אסף');

    it('reaches the car hire by רכב and אוטו', () => {
      expect(matchesDocumentQuery(hire, 'רכב')).toBe(true);
      expect(matchesDocumentQuery(hire, 'אוטו')).toBe(true);
      expect(matchesDocumentQuery(hire, 'השכרת רכב')).toBe(true);
    });

    it('reaches health cover by ביטוח בריאות, and the policy by פוליסה', () => {
      expect(matchesDocumentQuery(vaccines, 'ביטוח בריאות')).toBe(true);
      expect(matchesDocumentQuery(policy, 'פוליסה')).toBe(true);
    });

    it('reaches the licence by the spelling without the yod', () => {
      expect(matchesDocumentQuery(idp, 'רשיון')).toBe(true);
      expect(matchesDocumentQuery(idp, 'בינלאומי')).toBe(true);
    });

    // **A word may legitimately sit on two types**, and this is the test that distinguishes
    // that from the noise bookings warned about: both answers are ones the asker wants.
    it('lets ביטוח reach both the travel policy and the health cover', () => {
      expect(matchesDocumentQuery(policy, 'ביטוח')).toBe(true);
      expect(matchesDocumentQuery(vaccines, 'ביטוח')).toBe(true);
    });

    // Pinned as a KNOWN consequence, not asserted as desirable: `matchesAnyTerm` is
    // `term.includes(query)`, and `רכב` is a prefix of `רכבת`. Fixing it would mean
    // exact-word matching, which breaks partial typing on every other query.
    it('surfaces rail tickets on רכב too, because רכב is a prefix of רכבת', () => {
      expect(matchesDocumentQuery(doc('t2', DOCUMENT_TYPE.TICKET, 'JR'), 'רכב')).toBe(true);
      // The reverse does not hold, which is the half that keeps the table cheap: a longer
      // query only ever reaches a term that contains it.
      expect(matchesDocumentQuery(hire, 'רכבת')).toBe(false);
    });

    it('still refuses a word that belongs to no type — `other` carries none by definition', () => {
      expect(matchesDocumentQuery(doc('o1', DOCUMENT_TYPE.OTHER, 'סריקה'), 'מלון')).toBe(false);
    });
  });
});

describe('visibleDocumentGroups (ADR-0052 §7 / ADR-0120)', () => {
  const docs = [
    doc('p1', DOCUMENT_TYPE.PASSPORT, 'דרכון של דנה'),
    doc('p2', DOCUMENT_TYPE.PASSPORT, 'דרכון של אסף'),
    doc('t1', DOCUMENT_TYPE.TICKET, 'הלוך · NRT'),
  ];

  it('marks everything visible with no filter and no query', () => {
    const groups = visibleDocumentGroups(docs, DOCUMENT_TYPE_ALL, '');
    expect(groups.map((g) => g.type)).toEqual([DOCUMENT_TYPE.PASSPORT, DOCUMENT_TYPE.TICKET]);
    expect(countVisibleDocuments(groups)).toBe(3);
  });

  // The point of the whole shape: a filtered-out group is still HERE, so the caller can
  // collapse it. `groups.filter(...)` is what ADR-0120 exists to prevent.
  it('keeps a group whose documents all fail the predicate, with visible 0', () => {
    const groups = visibleDocumentGroups(docs, DOCUMENT_TYPE.TICKET, '');
    expect(groups.map((g) => g.type)).toEqual([DOCUMENT_TYPE.PASSPORT, DOCUMENT_TYPE.TICKET]);
    const passports = groups[0];
    expect(passports.visible).toBe(0);
    // Every row still mounted, so each one can animate out.
    expect(passports.rows).toHaveLength(2);
    expect(passports.rows.every((r) => !r.visible)).toBe(true);
    expect(countVisibleDocuments(groups)).toBe(1);
  });

  it('applies the chip and the query together', () => {
    const groups = visibleDocumentGroups(docs, DOCUMENT_TYPE.PASSPORT, 'דנה');
    expect(countVisibleDocuments(groups)).toBe(1);
  });

  // `revealRows`'s startIndex/nextIndex chaining: eight groups reveal as ONE staggered list,
  // not eight lists each restarting the delay at zero.
  it('staggers continuously across groups', () => {
    const groups = visibleDocumentGroups(docs, DOCUMENT_TYPE_ALL, '');
    const delays = groups.flatMap((g) => g.rows.map((r) => r.delayMs));
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeGreaterThan(0);
    // The first row of the SECOND group continues the count rather than resetting.
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it('gives a hidden row no stagger at all', () => {
    const groups = visibleDocumentGroups(docs, DOCUMENT_TYPE.TICKET, '');
    expect(groups[0].rows.every((r) => r.delayMs === 0)).toBe(true);
  });
});
