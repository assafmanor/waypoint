import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import {
  clockLabel,
  taskAssignedPayload,
  taskDigestPayload,
  taskDuePayload,
  taskUrl,
} from './notify-copy';

const utc = (iso: string) => Date.parse(iso);

describe('clockLabel', () => {
  it('reads the wall clock in the named zone', () => {
    const at = utc('2026-08-21T15:00:00Z');
    expect(clockLabel(at, 'Asia/Jerusalem')).toBe('18:00');
    expect(clockLabel(at, 'Asia/Tokyo')).toBe('00:00');
  });

  it('is 24-hour, because a lock screen has no room for a meridiem', () => {
    expect(clockLabel(utc('2026-08-21T20:30:00Z'), 'UTC')).toBe('20:30');
  });
});

describe('the payload shape ADR-0198 §7 asks for', () => {
  // "The title is the kind of obligation, the body is the subject" — the reverse reads as an
  // advert. Asserted as a property of all three rather than as three sets of words, so the
  // wording can be tuned on a device without the tests fighting it.
  const payloads = [
    taskDuePayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      dueAtMs: utc('2026-08-21T15:00:00Z'),
      zone: 'Asia/Jerusalem',
    }),
    taskDigestPayload({ tripId: 't1', titles: ['צילום דרכונים'], tomorrowCount: 0 }),
    taskAssignedPayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      assignerName: 'דנה',
      dueLabel: '18:00',
    }),
  ];

  it.each(payloads.map((p) => [p.kind, p] as const))('%s carries a title and a body', (_k, p) => {
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.length).toBeGreaterThan(0);
  });

  it('never opens a screen off our own origin', () => {
    // The worker refuses anything else (`parsePushPayload`), so a payload that broke this
    // would draw the fallback instead of itself.
    for (const p of payloads) expect(p.url.startsWith('/') && !p.url.startsWith('//')).toBe(true);
  });

  it('uses `·` as the separator and never an em dash', () => {
    // Root CLAUDE.md, and it matters more here than anywhere: the OS draws these strings, so
    // ADR-0118's bidi machinery never reaches them.
    for (const p of payloads) expect(p.title + p.body).not.toContain('—');
  });

  it('goes to a surface that already exists, never to a second inbox', () => {
    // ADR-0004's rule reaching a channel it was not written about (ADR-0198 §6).
    expect(taskUrl('trip-japan-26')).toBe('/trips/trip-japan-26/index/tasks');
  });
});

describe('taskDuePayload', () => {
  it('names the subject and qualifies it with the hour', () => {
    const p = taskDuePayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      dueAtMs: utc('2026-08-21T15:00:00Z'),
      zone: 'Asia/Jerusalem',
    });
    expect(p.kind).toBe(NOTIFICATION_KIND.TASK_DUE);
    expect(p.body).toBe('צילום דרכונים · עד 18:00');
  });
});

describe('taskDigestPayload', () => {
  it('says "one thing" rather than "1 thing"', () => {
    // `1 דבר` is not what a person says.
    const p = taskDigestPayload({ tripId: 't1', titles: ['א'], tomorrowCount: 0 });
    expect(p.title).toBe('דבר אחד לסגור היום');
  });

  it('counts, once there is more than one', () => {
    const p = taskDigestPayload({ tripId: 't1', titles: ['א', 'ב', 'ג'], tomorrowCount: 0 });
    expect(p.title).toBe('3 דברים לסגור היום');
  });

  it('names at most TWO subjects and counts the rest', () => {
    // A lock screen truncates, and a list of five names ends mid-word — the count is the
    // part that survives the cut.
    const p = taskDigestPayload({ tripId: 't1', titles: ['א', 'ב', 'ג', 'ד'], tomorrowCount: 0 });
    expect(p.body).toBe('א, ב ועוד 2');
  });

  it('says "one more" rather than "1 more" for the tail as well', () => {
    const p = taskDigestPayload({ tripId: 't1', titles: ['א', 'ב', 'ג'], tomorrowCount: 0 });
    expect(p.body).toBe('א, ב ועוד אחד');
  });

  it('counts tomorrow in the TITLE and names it in the body', () => {
    // The one addition that closes "we don't want to miss any upcoming" without a second
    // send (ADR-0198 §2).
    const p = taskDigestPayload({ tripId: 't1', titles: ['א'], tomorrowCount: 2 });
    expect(p.title).toBe('3 דברים לסגור היום');
    expect(p.body).toBe('א · ועוד 2 למחר');
  });

  it('says "one more tomorrow" in the singular too', () => {
    const p = taskDigestPayload({ tripId: 't1', titles: ['א'], tomorrowCount: 1 });
    expect(p.body).toBe('א · ועוד אחד למחר');
  });
});

describe('taskAssignedPayload', () => {
  it('inflects NO verb from a name', () => {
    // The reason this test exists: ADR-0198 §7's table read `דנה הטילה עליך משימה` — a
    // feminine verb guessed from a name, about a real person, from a field the app does not
    // have and should not infer. Hebrew has no neutral form of that verb, so the fix is a
    // construction with no verb in it at all.
    const p = taskAssignedPayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      assignerName: 'דנה',
      dueLabel: '18:00',
    });
    expect(p.title).toBe('משימה חדשה בשבילך');
    expect(p.title + p.body).not.toMatch(/הטיל|ביקש|שלח/);
  });

  it('stays ADDRESSED — the title says it is yours, the body says who', () => {
    // What earns this send its place against ADR-0081's rejection of ambient awareness.
    const p = taskAssignedPayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      assignerName: 'דנה',
      dueLabel: '18:00',
    });
    expect(p.title).toContain('בשבילך');
    expect(p.body).toBe('צילום דרכונים · עד 18:00 · דנה');
  });

  it('drops the deadline clause when there is no deadline', () => {
    const p = taskAssignedPayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      assignerName: 'דנה',
      dueLabel: null,
    });
    expect(p.body).toBe('צילום דרכונים · דנה');
  });

  it('leaves no dangling separator when the name is unknown', () => {
    // A name can be missing: the row's `updatedBy` may point at an account that is gone.
    const p = taskAssignedPayload({
      tripId: 't1',
      title: 'צילום דרכונים',
      assignerName: '',
      dueLabel: null,
    });
    expect(p.body).toBe('צילום דרכונים');
  });
});
