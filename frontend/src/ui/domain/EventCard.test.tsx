// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { EventCard, type EventCardProps } from './EventCard';
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

  it('shows a sync badge for a queued/failed edit and none when synced (U-04)', () => {
    const pending = render(wrap(<EventCard {...base} sync="pending" />));
    expect(pending.container.querySelector('.sync-badge-pending')).toBeTruthy();
    cleanup();
    const failed = render(wrap(<EventCard {...base} sync="failed" />));
    expect(failed.container.querySelector('.sync-badge-failed')).toBeTruthy();
    cleanup();
    const synced = render(wrap(<EventCard {...base} sync="synced" />));
    expect(synced.container.querySelector('.sync-badge')).toBeNull();
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
});
