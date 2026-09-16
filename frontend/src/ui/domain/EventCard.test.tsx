// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { EventCard, type EventCardProps } from './EventCard';
import { SyncBadge } from '../feedback';
import { ROUTE_TITLE_ARROW, routeTitle } from '../../lib/route-title';
import { t } from '../../i18n/he';

const TZ = 'Asia/Tokyo';

const base: EventCardProps = {
  icon: '🍜',
  title: <span>ראמן</span>,
  titleText: 'ראמן',
  kind: 'soft',
  phase: 'upcoming',
  isOpen: false,
  onToggle: () => {},
  tz: TZ,
  onNavigate: () => {},
  // The quick actions are scoped to today (ADR-0228's 2026-09-15 amendment), and the
  // fixture is the on-the-ground row every spec below is about. The amendment's own
  // "another day" cases pass `today={false}` explicitly.
  today: true,
};

describe('EventCard', () => {
  afterEach(() => cleanup());

  it('hard coding (ADR-0011): solid `now` card, the 🔒 קשיח tag, no stepper, hard-edit warning', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="now"
          isOpen
          code="WP-ABC123"
          onOnWay={() => {}}
          onDelay={() => {}}
        />,
      ),
    );
    const card = container.querySelector('.wp-event')!;
    expect(card.classList.contains('now')).toBe(true);
    expect(card.classList.contains('soft')).toBe(false);
    // `base` carries no `startsAt`, so this row has no when line to hang the lock on
    // and keeps the chip — the fallback ADR-0178 §4 leaves for an unplaced commitment.
    expect(container.querySelector('.wp-event-tag-hard')?.textContent).toContain(t.event.hard);
    expect(container.querySelector('.hard-lock')).toBeNull();
    // The nudge is the SAME control a soft row gets (ADR-0228 §1) — a hard event's
    // confirm gate lives in the verb, not in a different button.
    expect(container.querySelector('.wp-event-act.stepper')).toBeTruthy();
    // The edit-guard warning shows the code.
    expect(container.querySelector('.wp-event-hard-warn')?.textContent).toContain('WP-ABC123');
  });

  it('soft coding: dashed hatch card + the soft tag + the free verbs incl. the stepper', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          isOpen
          onDone={() => {}}
          onSkip={() => {}}
          onDelay={() => {}}
          onEarlier={() => {}}
        />,
      ),
    );
    const card = container.querySelector('.wp-event')!;
    // Soft is the dashed card and the ABSENCE of a lock (ADR-0178 §4) — the `גמיש`
    // chip is gone from an upcoming row, because the border already says it and the
    // chip was the only one of the three marks costing the title width.
    expect(card.classList.contains('soft')).toBe(true);
    expect(container.querySelector('.wp-event-tag-soft')).toBeNull();
    expect(container.querySelector('.hard-lock')).toBeNull();
    expect(container.querySelector('.wp-event-act.stepper')).toBeTruthy();
  });

  it('a timed hard row wears ONE lock, on the when line, and no kind chip (ADR-0178 §4)', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          startsAt="2026-09-11T01:00:00.000Z"
          endsAt="2026-09-11T04:00:00.000Z"
        />,
      ),
    );
    // The mark moved to where ADR-0011's commitment points: beside the time.
    expect(container.querySelector('.wp-event-time .hard-lock')).toBeTruthy();
    expect(container.querySelector('.wp-event-tag-hard')).toBeNull();
    // Exactly one — the whole point is that hard stopped being drawn three times.
    expect(container.querySelectorAll('.hard-lock')).toHaveLength(1);
  });

  it('a soft row keeps its chip only while it is NOW, since that is not the kind', () => {
    const now = render(wrapNav(<EventCard {...base} phase="now" />));
    expect(now.container.querySelector('.wp-event-tag-soft')?.textContent).toContain(
      t.event.softNow,
    );
    cleanup();
    const later = render(wrapNav(<EventCard {...base} phase="upcoming" />));
    expect(later.container.querySelector('.wp-event-tag-soft')).toBeNull();
  });

  it('renders the sync marker slot on the meta line, nothing when omitted (U-04/ADR-0091)', () => {
    const withBadge = render(wrapNav(<EventCard {...base} sync={<SyncBadge state="pending" />} />));
    // The marker lands on the meta line (below the title), never the title row.
    expect(withBadge.container.querySelector('.wp-event-m .sync-badge-pending')).toBeTruthy();
    expect(withBadge.container.querySelector('.wp-event-t .sync-badge')).toBeNull();
    cleanup();
    // Silent-when-synced is EntitySyncBadge's job: given no node, the card shows none.
    const none = render(wrapNav(<EventCard {...base} />));
    expect(none.container.querySelector('.sync-badge')).toBeNull();
  });

  it('fades the card while unsynced (provisional), full-opacity otherwise (ADR-0092)', () => {
    const on = render(wrapNav(<EventCard {...base} unsynced />));
    expect(on.container.querySelector('.wp-event.unsynced')).toBeTruthy();
    cleanup();
    const off = render(wrapNav(<EventCard {...base} />));
    expect(off.container.querySelector('.wp-event.unsynced')).toBeNull();
  });

  it('toggles open on the face and reports aria-expanded', () => {
    const onToggle = vi.fn();
    render(wrapNav(<EventCard {...base} onToggle={onToggle} />));
    const face = screen.getByRole('button', { expanded: false });
    fireEvent.click(face);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('passed event → the inline settle strip (we did this / skip), either kind', () => {
    for (const kind of ['soft', 'hard'] as const) {
      const onDone = vi.fn();
      const onSkip = vi.fn();
      const { container } = render(
        wrapNav(<EventCard {...base} kind={kind} phase="passed" onDone={onDone} onSkip={onSkip} />),
      );
      expect(container.querySelector('.wp-settle.prompt')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.actions.wasThere) }));
      expect(onDone).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  // ADR-0228 §3: the strip used to REPLACE the card, which is why a passed row's
  // documents, notes and tasks were unreachable — on a booking, its confirmation code
  // with them. It is a band on the card now, and the card still opens.
  it('a settle-strip card still expands, so its documents stay reachable', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="passed"
          isOpen
          code="WP-ABC123"
          onDone={() => {}}
          onSkip={() => {}}
          documentsSlot={<div className="docr-sec">docs</div>}
        />,
      ),
    );
    expect(container.querySelector('.wp-event-face.static')).toBeNull();
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
    expect(container.querySelector('.docr-sec')).toBeTruthy();
    expect(container.querySelector('.wp-event-hard-warn')?.textContent).toContain('WP-ABC123');
  });

  // The `לא סומן` chip is the STATUS slot, so it reads the status before the kind.
  it('a passed booking wears the same לא סומן chip a passed stop does', () => {
    const { container } = render(
      wrapNav(<EventCard {...base} kind="hard" startsAt="2026-07-20T02:00:00Z" phase="passed" />),
    );
    expect(container.querySelector('.wp-event-tag-phase')?.textContent).toBe(t.event.notMarked);
  });

  // ADR-0228 §1, read off the DOM rather than off the spec: the order is one list, so the
  // rendered rows have to come out identical too.
  it('the action row reads the same on a booking as on a stop', () => {
    const labels = (kind: 'hard' | 'soft') => {
      const { container } = render(
        wrapNav(
          <EventCard
            {...base}
            kind={kind}
            phase="upcoming"
            isOpen
            onDone={() => {}}
            onSkip={() => {}}
            onDelay={() => {}}
            onEarlier={() => {}}
            onOnWay={() => {}}
            onEdit={() => {}}
          />,
        ),
      );
      const row = [...container.querySelectorAll('.wp-event-act-row > *')].map(
        (n) => n.className + '|' + (n.textContent ?? '').trim(),
      );
      cleanup();
      return row;
    };
    expect(labels('hard')).toEqual(labels('soft'));
    // Ahead of you the row is moves and the way there — the record is not offered for a
    // thing that has not happened (ADR-0043 §2, restored by the amendment).
    expect(labels('soft').join('|')).toContain(t.actions.onWay);
    expect(labels('soft').join('|')).not.toContain(t.actions.done);
  });

  it('a booking can be marked done from its action row (ADR-0228 §2)', () => {
    const onDone = vi.fn();
    render(
      wrapNav(
        <EventCard {...base} kind="hard" phase="now" isOpen onDone={onDone} onSkip={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.done }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ADR-0230 §1 — ONE done mark, and it is the undo. The `היינו ✓` chip was the label of
  // three affordances for one verb; it is now the only one, and these four assertions are
  // what that sentence means: it restores, it says so, the other two are gone, and it goes
  // back to being a label where there is nothing to restore into.
  describe('a settled row (ADR-0230)', () => {
    const done = (over = {}) =>
      render(wrapNav(<EventCard {...base} phase="done" onRestore={() => {}} {...over} />));

    it('the `היינו ✓` chip IS the undo: tappable and keyboard-operable', () => {
      const onRestore = vi.fn();
      done({ onRestore });
      const chip = screen.getByRole('button', { name: t.actions.undoDone });
      expect(chip.className).toContain('wp-event-tag-done');
      expect(chip.textContent).toContain(t.event.didThis);
      fireEvent.keyDown(chip, { key: 'Enter' });
      expect(onRestore).toHaveBeenCalledTimes(1);
      fireEvent.click(chip);
      expect(onRestore).toHaveBeenCalledTimes(2);
    });

    // The tap must not also collapse the row it settles — the same two calls the `⋯` makes,
    // and the reason both are `role="button"` spans inside the face rather than buttons.
    it('undoes without toggling the card it sits on', () => {
      const onToggle = vi.fn();
      done({ onToggle });
      fireEvent.click(screen.getByRole('button', { name: t.actions.undoDone }));
      expect(onToggle).not.toHaveBeenCalled();
    });

    // The two the chip replaces: the face's ✓ circle and the band's `שחזור`. Asserted by
    // COUNT rather than by a stale class name, which an absence assertion would let rot.
    it('carries no second undo — no ✓ circle, no verb band', () => {
      const { container } = done({ isOpen: true });
      expect(screen.getAllByRole('button', { name: t.actions.undoDone })).toHaveLength(1);
      expect(container.querySelector('.wp-event-act-row')).toBeNull();
    });

    it('is a plain label, not a control, where nothing can restore it', () => {
      const { container } = done({ onRestore: undefined });
      expect(screen.queryByRole('button', { name: t.actions.undoDone })).toBeNull();
      expect(container.querySelector('.wp-event-tag-done')!.textContent).toContain(t.event.didThis);
    });
  });

  it('renders the conflict flag when a hard conflict is passed', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="upcoming"
          conflict={{ title: 'רכבת', startsAt: '2026-07-20T15:00:00+09:00' }}
        />,
      ),
    );
    expect(container.querySelector('.wp-event-conflict-flag')).toBeTruthy();
  });

  it("a conflicting flight's title reads as its shortened route, with the SVG arrow", () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          conflict={{
            title: routeTitle('נמל התעופה בן גוריון', 'נמל התעופה הבינלאומי קפלאוויק'),
            startsAt: '2026-07-20T15:00:00+09:00',
          }}
        />,
      ),
    );
    const flag = container.querySelector('.wp-event-conflict-flag')!;
    expect(flag.textContent).toContain('בן גוריון');
    expect(flag.textContent).toContain('קפלאוויק');
    // The reported bug: the stored title's FULL names and text arrow leaked here
    // while the row above showed the shortened SVG route.
    expect(flag.textContent).not.toContain('נמל התעופה');
    expect(flag.textContent).not.toContain(ROUTE_TITLE_ARROW);
    expect(flag.querySelector('.arr svg')).not.toBeNull();
  });

  it('the ⋯ menu opens the manage sheet; edit + delete fire their callbacks', () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      wrapNav(
        <EventCard
          {...base}
          isOpen
          onDone={() => {}}
          onSkip={() => {}}
          onEdit={onEdit}
          onRemove={onRemove}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
    fireEvent.click(screen.getByRole('button', { name: t.actions.edit }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  // **`החלף`** (ADR-0161 §6), which had no test at all — which is how it shipped as a `skip`
  // and a toast telling you to go looking for a replacement yourself. The row is a request to
  // the screen now (which owns the shelf and the slot chooser); what this pins is WHEN it is
  // offered, because both exclusions are rules rather than styling.
  describe('the החלף row', () => {
    // Two defaults the harness has to supply. `onEdit` so the sheet has something else in it:
    // with no actions at all the card drops the ⋯ button entirely, and "the menu is gone" would
    // pass for the wrong reason. And `startsAt`, because `base` is untimed and an untimed row is
    // now one of the exclusions below — the positive case needs a slot to replace.
    const menu = (props: Partial<Parameters<typeof EventCard>[0]>) => {
      cleanup();
      render(
        wrapNav(
          <EventCard
            {...base}
            isOpen
            startsAt="2026-07-20T05:00:00.000Z"
            onEdit={() => {}}
            onReplace={() => {}}
            {...props}
          />,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
    };

    it('is offered on a planned soft event', () => {
      menu({});
      expect(screen.getByRole('button', { name: t.actions.swap })).toBeTruthy();
    });

    it('is never offered on a hard event — a commitment is not displaced (ADR-0011)', () => {
      menu({ kind: 'hard' });
      expect(screen.queryByRole('button', { name: t.actions.swap })).toBeNull();
    });

    it('is not offered once the event is done — there is nothing left to replace', () => {
      menu({ phase: 'done' });
      expect(screen.getByRole('button', { name: t.actions.edit })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.actions.swap })).toBeNull();
    });

    // **The blank screen** (reported 2026-08-04). An untimed row has no slot to be replaced —
    // ADR-0161 §10 says so outright — and offering the verb anyway asked the shelf to be ranked
    // against a slot with no clock, which threw `Invalid time value` and took the day view down.
    it('is not offered on an untimed row — there is no slot to take it on', () => {
      menu({ startsAt: undefined });
      expect(screen.getByRole('button', { name: t.actions.edit })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.actions.swap })).toBeNull();
    });

    it('is absent when the screen passes no handler (a past day, ADR-0029)', () => {
      cleanup();
      render(wrapNav(<EventCard {...base} isOpen onEdit={() => {}} />));
      fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
      expect(screen.getByRole('button', { name: t.actions.edit })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.actions.swap })).toBeNull();
    });
  });

  // **THE EARLY MARK** (ADR-0228 §5c, built by its 2026-09-16 amendment). The band asks on a
  // `now` row and the strip on a passed one; ahead of the line the pair belongs to `⋯`, and the
  // sheet never had it — so a booking cancelled on you had only `מחיקה`, which throws away the
  // code. Owner, with the boat tour that was cancelled: "the app doesn't have a way to say that,
  // especially because it's a hard event."
  describe('the settle pair in the ⋯ sheet', () => {
    const menu = (props: Partial<Parameters<typeof EventCard>[0]>) => {
      cleanup();
      const onDone = vi.fn();
      const onSkip = vi.fn();
      render(
        wrapNav(
          <EventCard
            {...base}
            isOpen
            phase="upcoming"
            onEdit={() => {}}
            onDone={onDone}
            onSkip={onSkip}
            {...props}
          />,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
      const sheet = document.querySelector('.wp-row-actions') as HTMLElement;
      return { onDone, onSkip, sheet };
    };

    it('an upcoming HARD row offers סיימנו and דילוג, and דילוג fires the skip', () => {
      const { onSkip, sheet } = menu({ kind: 'hard' });
      expect(within(sheet).getByRole('button', { name: t.actions.done })).toBeTruthy();
      fireEvent.click(within(sheet).getByRole('button', { name: t.actions.skip }));
      expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('an upcoming soft row carries the identical pair — a kind is not a branch (ADR-0228)', () => {
      const { onDone, sheet } = menu({ kind: 'soft' });
      expect(within(sheet).getByRole('button', { name: t.actions.skip })).toBeTruthy();
      fireEvent.click(within(sheet).getByRole('button', { name: t.actions.done }));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('the pair leads the sheet: what happened, before what to do about the row', () => {
      const { sheet } = menu({ kind: 'soft', onReplace: () => {}, onPark: () => {} });
      const labels = within(sheet)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim());
      expect(labels.slice(0, 2)).toEqual([t.actions.done, t.actions.skip]);
    });

    it('is not in the sheet on a passed row — the strip is already asking, in words', () => {
      const { sheet } = menu({ phase: 'passed' });
      expect(within(sheet).queryByRole('button', { name: t.actions.done })).toBeNull();
      expect(within(sheet).queryByRole('button', { name: t.actions.skip })).toBeNull();
    });

    it('is not in the sheet on a now row — the band carries it there', () => {
      const { sheet } = menu({ phase: 'now', today: true });
      expect(within(sheet).queryByRole('button', { name: t.actions.done })).toBeNull();
      expect(within(sheet).queryByRole('button', { name: t.actions.skip })).toBeNull();
    });

    it('is not in the sheet once the row is done — the chip is the undo (ADR-0230)', () => {
      const { sheet } = menu({ phase: 'done' });
      expect(within(sheet).queryByRole('button', { name: t.actions.skip })).toBeNull();
    });

    it('needs BOTH handlers, like every other host of the pair', () => {
      const { sheet } = menu({ onSkip: undefined });
      expect(within(sheet).queryByRole('button', { name: t.actions.done })).toBeNull();
    });
  });

  // ADR-0029 hides create/edit on a past day; the amendment takes the live verbs with them,
  // because a day that is over has no "now" for a quick action to act in. What answers a
  // past row is the settle strip (ADR-0043 §4's retrospective job), and `מפה` on the badge.
  it('read-only past day: no quick actions at all and no ⋯ menu', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="passed"
          today={false}
          isOpen
          readOnly
          onNavigate={() => {}}
          onDone={() => {}}
          onSkip={() => {}}
          onEdit={() => {}}
        />,
      ),
    );
    expect(container.querySelector('.wp-event-menu')).toBeNull();
    expect(container.querySelector('.wp-event-act-row')).toBeNull();
    // The ask is still there, in the one place that asks in words.
    expect(container.querySelector('.wp-settle.prompt')).toBeTruthy();
  });

  // THE REPORT THE AMENDMENT ANSWERS: day 16 browsed on day 15, a waterfall at 06:30
  // offering `סיימנו`, `בדרך` and a ±30 nudge. `eventPhase` calls every future row
  // `upcoming`, exactly like this afternoon's — so the row asked what-now about a day
  // nobody is living yet.
  it('a future day carries no quick actions, and keeps its ⋯', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          phase="upcoming"
          today={false}
          isOpen
          startsAt="2026-07-20T02:00:00Z"
          onDone={() => {}}
          onSkip={() => {}}
          onDelay={() => {}}
          onEarlier={() => {}}
          onOnWay={() => {}}
          onEdit={() => {}}
        />,
      ),
    );
    expect(container.querySelector('.wp-event-act-row')).toBeNull();
    expect(screen.getByRole('button', { name: t.actions.more })).toBeTruthy();
  });

  // The `⋯` left the band for the face, so it is in one place on every card and reachable
  // without expanding — and it must not toggle the row on its way to the sheet.
  it('the ⋯ sits on the face, opens the sheet, and does not toggle the row', () => {
    const onToggle = vi.fn();
    const { container } = render(
      wrapNav(<EventCard {...base} onToggle={onToggle} onEdit={() => {}} />),
    );
    expect(container.querySelector('.wp-event-face .wp-event-menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t.actions.edit })).toBeTruthy();
  });

  it('no location → no ניווט / מפה buttons (handlers omitted, Phase 2)', () => {
    // A place-less event (or a coordless Place-lite) has no mappable location, so
    // the screen passes neither handler and the card drops both buttons.
    const { rerender } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="now"
          isOpen
          onNavigate={undefined}
          onShowOnMap={undefined}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: t.actions.navigate })).toBeNull();
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
    // With handlers both come back — navigate (directions) + מפה (view).
    rerender(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="now"
          isOpen
          onNavigate={() => {}}
          onShowOnMap={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: t.actions.navigate })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.actions.showOnMap })).toBeTruthy();
  });

  it('the מפה button fires its view-on-map handler', () => {
    const onShowOnMap = vi.fn();
    render(
      wrapNav(<EventCard {...base} phase="done" onRestore={() => {}} onShowOnMap={onShowOnMap} />),
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
  });

  // Multi-zone display (ADR-0107): the optional `zones` prop renders each end in
  // its own zone + an amber shift pill showing how far the clock jumps.
  it('renders no shift pill without `zones` (single-zone trips stay bare)', () => {
    const { container } = render(
      wrapNav(
        <EventCard {...base} startsAt="2026-07-07T10:00:00Z" endsAt="2026-07-07T11:00:00Z" />,
      ),
    );
    expect(container.querySelector('.wp-tzshift')).toBeNull();
  });

  it('renders each end in its own zone + a shift pill for a zone-crossing event', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          startsAt="2026-07-07T20:00:00Z" // 23:00 in Jerusalem
          endsAt="2026-07-08T09:00:00Z" // 18:00 next-day in Tokyo
          zones={{
            startZone: 'Asia/Jerusalem',
            endZone: 'Asia/Tokyo',
            deltaMinutes: 360, // Tokyo is 6h ahead of Jerusalem (summer)
          }}
        />,
      ),
    );
    const time = container.querySelector('.wp-event-time')!.textContent!;
    expect(time).toContain('23:00'); // start read in Jerusalem
    expect(time).toContain('18:00'); // end read in Tokyo
    expect(container.querySelector('.wp-event-xmid')).not.toBeNull(); // +1 across zones
    expect(container.querySelector('.wp-tzshift')?.textContent).toContain('+6');
  });

  it('shows no pill when the shift is zero even if zones are named', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          startsAt="2026-07-07T10:00:00Z"
          zones={{ startZone: 'Asia/Tokyo', endZone: 'Asia/Tokyo', deltaMinutes: undefined }}
        />,
      ),
    );
    expect(container.querySelector('.wp-tzshift')).toBeNull();
  });

  it('renders the duration label when the screen passes one', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          startsAt="2026-07-07T20:00:00Z"
          endsAt="2026-07-08T09:00:00Z"
          duration="6:45 שע׳"
        />,
      ),
    );
    expect(container.querySelector('.wp-event-dur')?.textContent).toBe('6:45 שע׳');
  });
});

// `מפה` moved off the expanded action row onto the badge (ADR-0121 §8 amendment),
// because the action row is `max-height: 0` until the card is opened — an unexpanded
// event had no way to its pin at all, and the settle variant returns before that row
// exists so it had none in any state.
describe('EventCard — the way to the map (ADR-0121 §8 amendment)', () => {
  afterEach(() => cleanup());

  it('offers מפה on the badge without expanding the card', () => {
    const onShowOnMap = vi.fn();
    render(wrapNav(<EventCard {...base} isOpen={false} onShowOnMap={onShowOnMap} />));
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
  });

  it('offers it on the passed-unmarked settle variant, which has no action row', () => {
    const onShowOnMap = vi.fn();
    render(
      wrapNav(
        <EventCard
          {...base}
          kind="soft"
          phase="passed"
          onShowOnMap={onShowOnMap}
          onDone={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    // The settle strip is what identifies this variant.
    expect(screen.getByText(t.day.settleAsk)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
  });

  it('drops it entirely when there is no place to focus', () => {
    render(wrapNav(<EventCard {...base} onShowOnMap={undefined} />));
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
  });

  // The badge sits inside the face button, so its tap must not also expand the card.
  it('does not toggle the card when the badge is tapped', () => {
    const onToggle = vi.fn();
    render(wrapNav(<EventCard {...base} onToggle={onToggle} onShowOnMap={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  // `ניווט` stayed in the action row: directions are a live on-the-ground verb,
  // while orientation is mode-neutral. So the two are no longer a fixed pair.
  it('keeps ניווט in the action row, separate from the badge', () => {
    render(wrapNav(<EventCard {...base} isOpen onNavigate={() => {}} onShowOnMap={() => {}} />));
    expect(screen.getByRole('button', { name: t.actions.navigate })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.actions.showOnMap })).toBeTruthy();
  });
});

// ADR-0152 §6c. Two of these three changes affect rows with NO notes at all, which is why
// the rule is a pure function and not an ellipsis deciding at one screen width.
describe('EventCard — the meta line and the note mark (ADR-0152 §6c)', () => {
  afterEach(cleanup);

  const meta = () => document.querySelector('.wp-event-m');
  const showCard = (props: Partial<EventCardProps>) =>
    render(wrapNav(<EventCard {...base} {...props} />));

  // ADR-0152 §6c's `eventMetaParts` is RETIRED (owner, 2026-08-09): the meta line carries
  // no text at all, so there is no longer a rule about what gives way when it is full. What
  // replaces those unit cases is the rendered assertion below — the row must not print a
  // place name or a confirmation code, whatever it is handed.
  describe('the rendered row', () => {
    it('renders no mark when the event has neither', () => {
      showCard({});
      expect(meta()?.querySelector('.note-mark')).toBeNull();
      expect(meta()?.querySelector('.doc-mark')).toBeNull();
    });

    // A `1` beside a glyph that already means "a note" is a digit that says nothing.
    it('shows the glyph alone for one note, and a count past one', () => {
      showCard({ notes: 1 });
      expect(meta()?.querySelector('.note-mark')?.textContent).toBe('');
      cleanup();
      showCard({ notes: 3 });
      expect(meta()?.querySelector('.note-mark')?.textContent).toBe('3');
    });

    it('names the mark for a screen reader rather than leaving a mystery glyph', () => {
      showCard({ notes: 2 });
      expect(screen.getByLabelText(t.notes.mark(2))).toBeTruthy();
    });

    // WHERE THE BODY LIVES (ADR-0152 §6's 2026-08-02 amendment). The mark says there are
    // notes; the card the row EXPANDS is where they are read and written. It was the `⋯`
    // sheet for one release, which put content inside a menu of verbs — the owner found it
    // there and said it did not belong, and a reader who never opens the menu never found
    // it at all.
    it('carries its notes in the expanded card, under the verbs', () => {
      showCard({
        notes: 2,
        notesSlot: <div data-testid="host-notes" />,
        onEdit: () => {},
        isOpen: true,
      });

      const slot = screen.getByTestId('host-notes');
      const strip = document.querySelector('.wp-event-actions-in');
      expect(strip?.contains(slot)).toBe(true);

      // Under the verbs, not above them: the row was opened to act on, and reading is the
      // longer errand.
      const acts = document.querySelector('.wp-event-act-row') as HTMLElement;
      expect(acts.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('leaves the ⋯ menu a list of verbs, with no notes in it', () => {
      showCard({
        notes: 2,
        notesSlot: <div data-testid="host-notes" />,
        onEdit: () => {},
        isOpen: true,
      });
      fireEvent.click(screen.getByRole('button', { name: t.actions.more }));
      const menu = document.querySelector('.wp-row-actions')?.parentElement as HTMLElement;
      expect(menu.querySelector('[data-testid="host-notes"]')).toBeNull();
    });

    // The strip is in the DOM at every height, so "closed" has to mean unmounted — the slot
    // is a connected component and a day holds a dozen cards.
    it('mounts no note section at all while the card is closed', () => {
      showCard({ notes: 2, notesSlot: <div data-testid="host-notes" /> });
      expect(screen.queryByTestId('host-notes')).toBeNull();
    });

    // **THE LINE CARRIES NO TEXT** (owner, 2026-08-09), which is what retired ADR-0152
    // §6c's whole composition rule: there is nothing left on it to give way. These three
    // replace the elementise / strand-no-separator / drop-the-name cases that rule owned.
    it('prints no place name and no confirmation code, whatever it is handed', () => {
      showCard({ code: 'MEGAZIP-T141215488', notes: 2 });
      expect(meta()?.querySelector('.wp-event-m-txt')).toBeNull();
      expect(meta()?.querySelector('.wp-event-m-code')).toBeNull();
      expect(meta()?.querySelector('.wp-event-m-sep')).toBeNull();
      expect(meta()?.textContent).not.toContain('MEGAZIP-T141215488');
    });

    it('keeps the glyphs, which are the whole of what the line now says', () => {
      showCard({ code: 'MN-4471', notes: 2, documents: 1 });
      expect(meta()?.querySelector('.note-mark')).toBeTruthy();
      expect(meta()?.querySelector('.doc-mark')).toBeTruthy();
    });

    // The line STAYS even when it carries nothing, and that is deliberate: `sync` is an
    // opaque node the screen passes (`<EntitySyncBadge/>`, silent when synced), so this
    // component cannot tell whether it will draw. Gating the line on "is there a glyph"
    // took the PENDING badge off with it — caught in e2e, not here. Empty, it is a flex box
    // with no children.
    it('leaves the line empty rather than gating it on a glyph', () => {
      showCard({ code: 'MN-4471' });
      expect(meta()).toBeTruthy();
      expect(meta()?.textContent).toBe('');
    });

    // The code is not lost — it is one tap away, and the expanded card still prints it.
    it('still prints the code in the hard-edit warning inside the card', () => {
      showCard({ code: 'MN-4471', kind: 'hard', isOpen: true });
      expect(screen.getByText(/MN-4471/)).toBeTruthy();
    });
  });

  // **THE BADGE IS THE THUMBNAIL'S FRAME** (ADR-0167 §1, extended to the day rows by
  // ADR-0219 §1). The card takes a URL and nothing else: whether the glyph beside it was
  // PICKED is the screen's question (`lib/place-photo`'s `rowPhoto`), not this layer's.
  describe('the badge photo (ADR-0219 §1)', () => {
    const photoImg = (c: HTMLElement) =>
      c.querySelector('.wp-event-badge .wp-placebadge-photo img') as HTMLImageElement | null;

    it('fills the badge with the photo it is given, on the expandable card', () => {
      const { container } = render(
        wrapNav(<EventCard {...base} photoUrl="/enrichment/images/enr_1" />),
      );
      expect(photoImg(container)?.getAttribute('src')).toBe('/enrichment/images/enr_1');
      expect(container.querySelector('.wp-event-badge')!.hasAttribute('data-photo')).toBe(true);
      // The glyph and the photo are alternatives, never stacked.
      expect(container.querySelector('.wp-event-badge')!.textContent).not.toContain('🍜');
    });

    // The settle variant returns before the expandable tree exists, which is exactly how it
    // came to be the one host with no way to the map (see `PlaceBadge`'s docblock). Both
    // call sites take the photo, so neither can drift again.
    it('fills it on the settle variant too', () => {
      const { container } = render(
        wrapNav(
          <EventCard
            {...base}
            phase="passed"
            onDone={() => {}}
            onSkip={() => {}}
            photoUrl="/enrichment/images/enr_2"
          />,
        ),
      );
      expect(container.querySelector('.wp-settle.prompt')).toBeTruthy();
      expect(photoImg(container)?.getAttribute('src')).toBe('/enrichment/images/enr_2');
    });

    it('renders the glyph and no image at all without one — most rows, unchanged', () => {
      const { container } = render(wrapNav(<EventCard {...base} />));
      expect(photoImg(container)).toBeNull();
      expect(container.querySelector('.wp-event-badge')!.hasAttribute('data-photo')).toBe(false);
      expect(container.querySelector('.wp-event-badge')!.textContent).toContain('🍜');
    });
  });
});
