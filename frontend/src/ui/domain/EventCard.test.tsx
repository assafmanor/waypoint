// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { EventCard, eventMetaParts, type EventCardProps } from './EventCard';
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
    // Triple-coding: `now` amber ring class + the hard tag, NOT the soft tag.
    expect(card.classList.contains('now')).toBe(true);
    expect(card.classList.contains('soft')).toBe(false);
    expect(container.querySelector('.wp-event-tag-hard')?.textContent).toContain(t.event.hard);
    // Hard events have no ±nudge stepper.
    expect(container.querySelector('.wp-event-act.stepper')).toBeNull();
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
    expect(card.classList.contains('soft')).toBe(true);
    expect(container.querySelector('.wp-event-tag-soft')).toBeTruthy();
    expect(container.querySelector('.wp-event-act.stepper')).toBeTruthy();
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

  it('passed soft event → the inline settle strip (we did this / skip)', () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      wrapNav(<EventCard {...base} phase="passed" onDone={onDone} onSkip={onSkip} />),
    );
    expect(container.querySelector('.wp-settle.prompt')).toBeTruthy();
    // The settle card doesn't expand (no toggle button face).
    expect(container.querySelector('.wp-event-face.static')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.actions.wasThere) }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('done event: the ✓ doubles as one-tap undo (keyboard-operable, restores)', () => {
    const onRestore = vi.fn();
    render(wrapNav(<EventCard {...base} phase="done" onRestore={onRestore} />));
    const undo = screen.getByRole('button', { name: t.actions.undoDone });
    fireEvent.keyDown(undo, { key: 'Enter' });
    expect(onRestore).toHaveBeenCalledTimes(1);
    fireEvent.click(undo);
    expect(onRestore).toHaveBeenCalledTimes(2);
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

  it('read-only past day: forward verbs hidden, no ⋯ menu (settle/navigate still allowed)', () => {
    const { container } = render(
      wrapNav(
        <EventCard
          {...base}
          kind="hard"
          phase="now"
          isOpen
          readOnly
          onNavigate={() => {}}
          onEdit={() => {}}
        />,
      ),
    );
    // navigate stays; the more menu is gone (create/edit gated, ADR-0029).
    expect(container.querySelector('.wp-event-act.more')).toBeNull();
    expect(screen.getByRole('button', { name: t.actions.navigate })).toBeTruthy();
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

  describe('the composition rule', () => {
    it('keeps the place name when there is a code but no mark', () => {
      const parts = eventMetaParts({ placeName: 'שיבויה', code: 'הזמנה MN-4471' });
      expect(parts.placeName).toBe('שיבויה');
      expect(parts.separator).toBe(true);
    });

    it('keeps the place name when there is a mark but no code', () => {
      const parts = eventMetaParts({ placeName: 'שיבויה', notes: 2 });
      expect(parts.placeName).toBe('שיבויה');
      // No code, so nothing to separate it from.
      expect(parts.separator).toBe(false);
    });

    // The line is exactly full at 390px, so something has to go — and a two-character
    // stub is noise, not information.
    it('DROPS the place name when a row carries both a code and a mark', () => {
      const parts = eventMetaParts({ placeName: 'שיבויה', code: 'הזמנה MN-4471', notes: 2 });
      expect(parts.placeName).toBeUndefined();
      // …and the separator leaves with it, rather than stranding a leading `·`.
      expect(parts.separator).toBe(false);
      // The code is what the row was opened for, so it always survives.
      expect(parts.code).toBe('הזמנה MN-4471');
    });

    it('treats a zero count as no mark at all', () => {
      const parts = eventMetaParts({ placeName: 'שיבויה', code: 'הזמנה MN-4471', notes: 0 });
      expect(parts.placeName).toBe('שיבויה');
    });
  });

  describe('the rendered row', () => {
    it('renders no mark when the event has no notes', () => {
      showCard({ placeName: 'שיבויה' });
      expect(meta()?.querySelector('.note-mark')).toBeNull();
    });

    // A `1` beside a glyph that already means "a note" is a digit that says nothing.
    it('shows the glyph alone for one note, and a count past one', () => {
      showCard({ placeName: 'שיבויה', notes: 1 });
      expect(meta()?.querySelector('.note-mark')?.textContent).toBe('');
      cleanup();
      showCard({ placeName: 'שיבויה', notes: 3 });
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

    it('elementises the meta so the code can be protected from the ellipsis', () => {
      showCard({ placeName: 'שיבויה', code: 'MN-4471' });
      // The code is its OWN item — flex cannot protect part of a text node.
      expect(meta()?.querySelector('.wp-event-m-code')).toBeTruthy();
      expect(meta()?.querySelector('.wp-event-m-txt')?.textContent).toBe('שיבויה');
      expect(meta()?.querySelector('.wp-event-m-sep')).toBeTruthy();
    });

    it('strands no separator on a code-only row', () => {
      showCard({ code: 'MN-4471' });
      expect(meta()?.querySelector('.wp-event-m-sep')).toBeNull();
    });

    it('drops the place name in the DOM on a coded, noted row', () => {
      showCard({ placeName: 'שיבויה', code: 'MN-4471', notes: 2 });
      expect(meta()?.querySelector('.wp-event-m-txt')).toBeNull();
      expect(meta()?.querySelector('.wp-event-m-code')?.textContent).toContain('MN-4471');
      expect(meta()?.querySelector('.note-mark')).toBeTruthy();
    });
  });
});
