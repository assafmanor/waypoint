import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import {
  clockLabel,
  eventSoonPayload,
  spanEdgePayload,
  spanEdgeWord,
  taskAssignedPayload,
  taskDigestPayload,
  taskDuePayload,
  taskUrl,
  tripTomorrowPayload,
  untilLabel,
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
      taskId: 'task-1',
      title: 'צילום דרכונים',
      dueAtMs: utc('2026-08-21T15:00:00Z'),
      zone: 'Asia/Jerusalem',
    }),
    taskDigestPayload({ tripId: 't1', titles: ['צילום דרכונים'], tomorrowCount: 0 }),
    taskAssignedPayload({
      tripId: 't1',
      taskId: 'task-1',
      title: 'צילום דרכונים',
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
    expect(taskUrl('trip-japan-26')).toBe('/?trip=trip-japan-26&tab=index&focus=tasks');
  });

  it('names the TRIP, so a reminder cannot open the wrong one', () => {
    // The active trip lives in `localStorage`, so a URL without `?trip=` opens whichever
    // trip was last used — which for a notification is a wrong answer, not a default.
    for (const p of payloads) expect(p.url).toContain('trip=t1');
  });

  it('opens the ONE task a single-task kind is about', () => {
    expect(taskUrl('t1', 'task-9')).toBe('/?trip=t1&tab=index&focus=tasks&task=task-9');
  });

  it('opens NO task for a kind whose subject is a SET', () => {
    // The digest is about a morning's worth of deadlines; opening one arbitrary sheet over
    // it would pick a row out of the list the send was deliberately about as a whole.
    const digest = taskDigestPayload({ tripId: 't1', titles: ['a', 'b'], tomorrowCount: 1 });
    expect(digest.url).not.toContain('task=');
  });

  it('lands on a route the router actually has', () => {
    // The bug this replaces: `/trips/<id>/index/tasks` and `/trips/<id>/day/<date>` matched
    // NO route, fell through to `*`, and rendered the app home — so every notification ever
    // sent landed on home. The app is query-addressed (ADR-0098), not path-addressed.
    for (const p of payloads) expect(p.url.startsWith('/?')).toBe(true);
  });
});

describe('taskDuePayload', () => {
  it('names the subject and qualifies it with the hour', () => {
    const p = taskDuePayload({
      tripId: 't1',
      taskId: 'task-1',
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
      taskId: 'task-1',
      title: 'צילום דרכונים',
      dueLabel: '18:00',
    });
    expect(p.title).toBe('משימה חדשה בשבילך');
    expect(p.title + p.body).not.toMatch(/הטיל|ביקש|שלח/);
  });

  it('stays ADDRESSED through the TITLE alone, now that the name is gone', () => {
    // What earns this send its place against ADR-0081's rejection of ambient awareness used
    // to be split between the title and the name in the body. The owner dropped the name
    // (2026-08-21), so `בשבילך` carries the addressing by itself — and that is the assertion
    // worth holding, because losing it would make this an ambient change ping.
    const p = taskAssignedPayload({
      tripId: 't1',
      taskId: 'task-1',
      title: 'צילום דרכונים',
      dueLabel: '18:00',
    });
    expect(p.title).toContain('בשבילך');
    expect(p.body).toBe('צילום דרכונים · עד 18:00');
  });

  it('names NOBODY — no assigner, and no separator where one used to be', () => {
    const p = taskAssignedPayload({
      tripId: 't1',
      taskId: 'task-1',
      title: 'צילום דרכונים',
      dueLabel: '18:00',
    });
    expect(p.body).not.toContain('דנה');
    expect(p.body.endsWith('·')).toBe(false);
  });

  it('drops the deadline clause when there is no deadline', () => {
    const p = taskAssignedPayload({
      tripId: 't1',
      taskId: 'task-1',
      title: 'צילום דרכונים',
      dueLabel: null,
    });
    expect(p.body).toBe('צילום דרכונים');
  });
});

describe('untilLabel — Hebrew’s dual is not a rounding detail', () => {
  it('says the WORD for two hours, not the number', () => {
    // `2 שעות` is not what a person says, and on a lock screen at 03:30 it reads as a
    // translation rather than a sentence.
    expect(untilLabel(120)).toBe('בעוד שעתיים');
    expect(untilLabel(60)).toBe('בעוד שעה');
    expect(untilLabel(180)).toBe('בעוד 3 שעות');
  });

  it('stays in minutes below the hour', () => {
    expect(untilLabel(30)).toBe('בעוד 30 דק׳');
    expect(untilLabel(59)).toBe('בעוד 59 דק׳');
  });

  it('has something to say for right now', () => {
    expect(untilLabel(0)).toBe('עוד רגע');
  });
});

describe('the phase-B payloads', () => {
  const soon = eventSoonPayload({
    tripId: 't1',
    dateKey: '2026-08-21',
    title: 'טיסה TLV → NRT',
    leadMinutes: 120,
    startsAtMs: Date.parse('2026-08-21T03:20:00Z'),
    zone: 'Asia/Jerusalem',
  });

  it('leads with the COUNTDOWN, because that is what makes it urgent', () => {
    // The reverse of phase A, and deliberately: these two kinds are the catalogue's only
    // `timeCritical` rows, so the string has to work read half-asleep from a lock screen.
    expect(soon.title).toBe('טיסה TLV → NRT בעוד שעתיים');
    expect(soon.body).toBe('06:20');
    expect(soon.kind).toBe(NOTIFICATION_KIND.EVENT_HARD_SOON);
  });

  it('opens the DAY, not a second inbox', () => {
    expect(soon.url).toBe('/?trip=t1&tab=days&day=2026-08-21');
  });

  it('gives a span edge its own word and its deadline', () => {
    const edge = spanEdgePayload({
      tripId: 't1',
      dateKey: '2026-08-25',
      edgeWord: 'צ׳ק-אאוט',
      subject: 'Hotel Nikko',
      atMs: Date.parse('2026-08-25T08:00:00Z'),
      zone: 'Asia/Tokyo',
    });
    expect(edge.title).toBe('צ׳ק-אאוט עד 17:00');
    expect(edge.body).toBe('Hotel Nikko');
  });

  it('falls back to a NOUN rather than printing a key at somebody', () => {
    // A person seeing `checkOut` on a lock screen is worse than a person seeing a vague word.
    expect(spanEdgeWord(undefined)).toBe('שלב בטיול');
    expect(spanEdgeWord('nonsense')).toBe('שלב בטיול');
    expect(spanEdgeWord('carDropoff')).toBe('החזרת הרכב');
  });

  it('names the trip and its first timed thing the evening before', () => {
    const tomorrow = tripTomorrowPayload({
      tripId: 't1',
      dateKey: '2026-08-22',
      tripName: 'יפן ׳26',
      firstThing: {
        title: 'טיסה TLV → NRT',
        atMs: Date.parse('2026-08-22T03:20:00Z'),
        zone: 'Asia/Jerusalem',
      },
    });
    expect(tomorrow.title).toBe('נוסעים מחר');
    expect(tomorrow.body).toBe('יפן ׳26 · טיסה TLV → NRT ב-06:20');
  });

  it('says just the trip when day 1 has nothing on a clock', () => {
    const tomorrow = tripTomorrowPayload({
      tripId: 't1',
      dateKey: '2026-08-22',
      tripName: 'יפן ׳26',
      firstThing: null,
    });
    // Common rather than exceptional, so there is no dangling separator to trip over.
    expect(tomorrow.body).toBe('יפן ׳26');
  });

  it('spends no em dash anywhere', () => {
    // Root CLAUDE.md, and it matters most here: the OS draws these strings, so none of
    // ADR-0118's bidi machinery reaches them.
    for (const p of [
      soon,
      tripTomorrowPayload({ tripId: 't', dateKey: 'd', tripName: 'n', firstThing: null }),
    ]) {
      expect(p.title + p.body).not.toContain('—');
    }
  });
});
