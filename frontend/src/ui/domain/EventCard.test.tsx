// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { EventCard, type EventCardProps } from './EventCard';
import { SyncBadge } from '../feedback';
import { t } from '../../i18n/he';

const TZ = 'Asia/Tokyo';

// The Tier-2 menu opens a Sheet → Modal (nav + toast context).
function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

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
      wrap(
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
      wrap(
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
    const withBadge = render(wrap(<EventCard {...base} sync={<SyncBadge state="pending" />} />));
    // The marker lands on the meta line (below the title), never the title row.
    expect(withBadge.container.querySelector('.wp-event-m .sync-badge-pending')).toBeTruthy();
    expect(withBadge.container.querySelector('.wp-event-t .sync-badge')).toBeNull();
    cleanup();
    // Silent-when-synced is EntitySyncBadge's job: given no node, the card shows none.
    const none = render(wrap(<EventCard {...base} />));
    expect(none.container.querySelector('.sync-badge')).toBeNull();
  });

  it('fades the card while unsynced (provisional), full-opacity otherwise (ADR-0092)', () => {
    const on = render(wrap(<EventCard {...base} unsynced />));
    expect(on.container.querySelector('.wp-event.unsynced')).toBeTruthy();
    cleanup();
    const off = render(wrap(<EventCard {...base} />));
    expect(off.container.querySelector('.wp-event.unsynced')).toBeNull();
  });

  it('toggles open on the face and reports aria-expanded', () => {
    const onToggle = vi.fn();
    render(wrap(<EventCard {...base} onToggle={onToggle} />));
    const face = screen.getByRole('button', { expanded: false });
    fireEvent.click(face);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('passed soft event → the inline settle strip (we did this / skip)', () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      wrap(<EventCard {...base} phase="passed" onDone={onDone} onSkip={onSkip} />),
    );
    expect(container.querySelector('.wp-event-settle')).toBeTruthy();
    // The settle card doesn't expand (no toggle button face).
    expect(container.querySelector('.wp-event-face.static')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.actions.wasThere) }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('done event: the ✓ doubles as one-tap undo (keyboard-operable, restores)', () => {
    const onRestore = vi.fn();
    render(wrap(<EventCard {...base} phase="done" onRestore={onRestore} />));
    const undo = screen.getByRole('button', { name: t.actions.undoDone });
    fireEvent.keyDown(undo, { key: 'Enter' });
    expect(onRestore).toHaveBeenCalledTimes(1);
    fireEvent.click(undo);
    expect(onRestore).toHaveBeenCalledTimes(2);
  });

  it('renders the conflict flag when a hard conflict is passed', () => {
    const { container } = render(
      wrap(
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

  it('the ⋯ menu opens the manage sheet; edit + delete fire their callbacks', () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      wrap(
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
      wrap(
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
      wrap(
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
      wrap(
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
      wrap(<EventCard {...base} phase="done" onRestore={() => {}} onShowOnMap={onShowOnMap} />),
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
  });

  // Multi-zone display (ADR-0107): the optional `zones` prop renders each end in
  // its own zone + a `· city` label on the ends the suppression rule kept.
  it('renders no zone label without `zones` (single-zone trips stay bare)', () => {
    const { container } = render(
      wrap(<EventCard {...base} startsAt="2026-07-07T10:00:00Z" endsAt="2026-07-07T11:00:00Z" />),
    );
    expect(container.querySelector('.wp-event-tz')).toBeNull();
  });

  it('labels a zone-crossing event on both ends, each time in its own zone', () => {
    const { container } = render(
      wrap(
        <EventCard
          {...base}
          startsAt="2026-07-07T20:00:00Z" // 23:00 in Jerusalem
          endsAt="2026-07-08T09:00:00Z" // 18:00 next-day in Tokyo
          zones={{
            startZone: 'Asia/Jerusalem',
            endZone: 'Asia/Tokyo',
            showStart: true,
            showEnd: true,
          }}
        />,
      ),
    );
    const labels = [...container.querySelectorAll('.wp-event-tz')].map((n) => n.textContent);
    expect(labels).toEqual([' · Jerusalem', ' · Tokyo']);
    const time = container.querySelector('.wp-event-time')!.textContent!;
    expect(time).toContain('23:00'); // start read in Jerusalem
    expect(time).toContain('18:00'); // end read in Tokyo
    expect(container.querySelector('.wp-event-xmid')).not.toBeNull(); // +1 across zones
  });
});
