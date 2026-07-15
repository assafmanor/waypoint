// Plan-mode Day-by-day — the itinerary BUILDER (modes.md; ADR-0025 Tier 3;
// mockups/plan-mode-v1.html). Trip mode follows/adjusts the day (quick verbs);
// Plan mode builds it — so rows are structural: tap the row opens the edit
// sheet, the ⋯ button opens a per-row action sheet (edit · move-to-shelf ·
// delete), and gap chips + the shelf fill the day. One trailing affordance per
// row, not a strip of icons — the phone has no width for it (ADR-0017).
//
// Editing reuses EventForm (add + edit, incl. hard↔soft flip, time, and
// cross-day via its date field). Reorder = drag a soft row's grip (or the ▲/▼
// fallback) to reassign the day's soft time slots (verbs.reorder → planReorder);
// the list stays time-ordered and hard events are pinned anchors (ADR-0011).
import { Fragment, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { EVENT_KIND, EVENT_STATUS, type MaybeItem, type TripEvent } from '@waypoint/shared';
import { useTrip, byStart } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { formatTime, zonedIso } from '../lib/time';
import { gapBetween, nextSlot, type GapDefaults } from '../lib/gaps';
import { CODE_PREFIX, ICONS, MS_PER_DAY, MINUTES_PER_HOUR } from '../constants';
import { t } from '../i18n/he';
import { TRIP_TZ_OFFSET, maybeMeta } from '../fixtures';
import { EventForm } from '../ui/EventForm';
import { Sheet } from '../ui/Sheet';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

function gapLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return t.planDay.gapMinutes(minutes);
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours === 1
    ? t.planDay.gapHour
    : hours === 2
      ? t.planDay.gapTwoHours
      : t.planDay.gapHours(hours);
}

export function PlanDay() {
  const { trip, events, maybeItems, bookings, activeDate } = useTrip();
  const verbs = useVerbs();
  const tz = trip.timezone;
  const [formTarget, setFormTarget] = useState<'new' | TripEvent | null>(null);
  const [gapFill, setGapFill] = useState<GapDefaults | null>(null);
  // A shelf idea being scheduled onto a day — opens EventForm in "schedule" mode
  // so the user picks the day/time/kind (not the old hardcoded 17:30 dump).
  const [scheduleMaybe, setScheduleMaybe] = useState<MaybeItem | null>(null);
  // A gap the user tapped "＋ שבץ" on — opens a chooser to drop an existing shelf
  // idea into the gap's slot, or start a fresh event there (#21).
  const [gapChoice, setGapChoice] = useState<GapDefaults | null>(null);

  const dayEvents = events
    .filter((e) => e.date === activeDate && e.status !== EVENT_STATUS.SKIPPED)
    .sort(byStart);

  // Reorder acts on soft events only (hard events are pinned anchors, ADR-0011).
  const softEvents = dayEvents.filter((e) => e.kind === EVENT_KIND.SOFT);
  const softIndex = new Map(softEvents.map((e, i) => [e.id, i]));

  // Drag-to-reorder: a soft event's grip is the handle. Pointer capture keeps
  // move/up on the grip; the row under the pointer (data-bld-id) is the drop
  // target. Drop reassigns the soft time slots (verbs.reorder → planReorder).
  const [drag, setDrag] = useState<{ id: string; overId: string | null } | null>(null);
  const gripProps = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({ id, overId: null });
    },
    onPointerMove: (e: ReactPointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const overId = (el?.closest('[data-bld-id]') as HTMLElement | null)?.dataset.bldId ?? null;
        const next = overId && overId !== d.id && softIndex.has(overId) ? overId : null;
        return next === d.overId ? d : { ...d, overId: next };
      });
    },
    onPointerUp: () => {
      if (drag?.overId && drag.overId !== drag.id) verbs.reorder(dayEvents, drag.id, drag.overId);
      setDrag(null);
    },
  });

  const dayNumber = daysBetween(trip.startDate, activeDate) + 1;
  const weekday = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    timeZone: trip.timezone,
  }).format(new Date(`${activeDate}T12:00:00${TRIP_TZ_OFFSET}`));

  const closeForm = () => {
    setFormTarget(null);
    setGapFill(null);
    setScheduleMaybe(null);
  };

  return (
    <div className="builder">
      <div className="builder-main">
        <div className="sec-title">
          {t.day.heading(dayNumber, weekday, trip.destination)}
          <span className="sec-title-end">
            <button className="new-event-btn" onClick={() => setFormTarget('new')}>
              {ICONS.add} {t.actions.newEvent}
            </button>
          </span>
        </div>

        {dayEvents.length === 0 ? (
          <div className="builder-empty">{t.planDay.empty}</div>
        ) : (
          <div>
            {dayEvents.map((e, i) => {
              const next = dayEvents[i + 1];
              const gap = next ? gapBetween(e, next, tz) : null;
              const si = softIndex.get(e.id);
              const soft = si !== undefined;
              const earlierId = soft && si > 0 ? softEvents[si - 1].id : undefined;
              const laterId =
                soft && si < softEvents.length - 1 ? softEvents[si + 1].id : undefined;
              return (
                <Fragment key={e.id}>
                  <BuilderRow
                    event={e}
                    tz={tz}
                    booking={e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined}
                    onEdit={() => setFormTarget(e)}
                    onDelete={() => verbs.remove(e)}
                    onPark={soft ? () => verbs.park(e) : undefined}
                    grip={soft ? gripProps(e.id) : undefined}
                    dragging={drag?.id === e.id}
                    over={drag?.overId === e.id}
                    onMoveEarlier={
                      earlierId ? () => verbs.reorder(dayEvents, e.id, earlierId) : undefined
                    }
                    onMoveLater={
                      laterId ? () => verbs.reorder(dayEvents, e.id, laterId) : undefined
                    }
                  />
                  {gap && (
                    <div className="gap">
                      <span className="gap-line" />
                      <button className="gap-add" onClick={() => setGapChoice(gap.fill)}>
                        {t.planDay.gap(gapLabel(gap.minutes))}
                      </button>
                      <span className="gap-line" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

        {/* Header's "new event" is a blank form; this one continues the day at
            the next open slot. */}
        <button
          className="addbtn"
          onClick={() => {
            setGapFill(nextSlot(dayEvents, activeDate, tz));
            setFormTarget('new');
          }}
        >
          {ICONS.add} {t.planDay.addToDay}
        </button>
      </div>

      <div className="builder-side">
        <div className="sec-title">
          {t.day.maybeShelf}
          <span className="hint">{t.day.tapToSchedule}</span>
        </div>
        <div className="shelf">
          {/* Scheduled (consumed) ideas leave the shelf — no dead "שובץ"
              tombstone (ADR-0027: an idea is parked OR placed, never both). */}
          {maybeItems
            .filter((m) => !m.consumed)
            .map((m) => (
              <MaybeCard
                key={m.id}
                item={m}
                onSchedule={() => {
                  setGapFill(nextSlot(dayEvents, activeDate, tz));
                  setScheduleMaybe(m);
                }}
                onRemove={() => verbs.removeMaybe(m)}
              />
            ))}
        </div>
        <AddIdea onAdd={(title) => verbs.addMaybe(title)} />
      </div>

      {gapChoice && (
        <GapFillSheet
          gap={gapChoice}
          ideas={maybeItems.filter((m) => !m.consumed)}
          onPickIdea={(m) => {
            verbs.schedule(m, {
              date: gapChoice.date,
              title: m.title,
              kind: EVENT_KIND.SOFT,
              startsAt: zonedIso(gapChoice.date, gapChoice.start, tz),
              endsAt: zonedIso(gapChoice.date, gapChoice.end, tz),
            });
            setGapChoice(null);
          }}
          onNewEvent={() => {
            setGapFill(gapChoice);
            setFormTarget('new');
            setGapChoice(null);
          }}
          onClose={() => setGapChoice(null)}
        />
      )}

      {(formTarget || scheduleMaybe) && (
        <EventForm
          event={formTarget && formTarget !== 'new' ? formTarget : null}
          maybeItem={scheduleMaybe}
          defaults={gapFill ?? undefined}
          onClose={closeForm}
        />
      )}
    </div>
  );
}

// Gap-fill chooser (#21): drop an existing shelf idea into the gap's slot, or
// start a fresh event there. Scheduling an idea reuses verbs.schedule with the
// gap's exact start/end so it lands in the hole, not the old default slot.
function GapFillSheet({
  gap,
  ideas,
  onPickIdea,
  onNewEvent,
  onClose,
}: {
  gap: GapDefaults;
  ideas: MaybeItem[];
  onPickIdea: (m: MaybeItem) => void;
  onNewEvent: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={t.planDay.gapFillTitle(gap.start, gap.end)} onClose={onClose}>
      <div className="gapfill-list">
        {ideas.map((m) => (
          <button key={m.id} className="gapfill-row" onClick={() => onPickIdea(m)}>
            <span className="gapfill-ic">{m.icon}</span>
            <span className="gapfill-main">
              <span className="gapfill-t">{m.title}</span>
              <span className="gapfill-m">{maybeMeta(m.id)}</span>
            </span>
            <span className="gapfill-add">{ICONS.add}</span>
          </button>
        ))}
        {ideas.length === 0 && <div className="gapfill-empty">{t.planDay.gapFillEmpty}</div>}
      </div>
      <button className="btn-primary gapfill-new" onClick={onNewEvent}>
        {ICONS.add} {t.actions.newEvent}
      </button>
    </Sheet>
  );
}

function BuilderRow({
  event,
  tz,
  booking,
  onEdit,
  onDelete,
  onPark,
  grip,
  dragging,
  over,
  onMoveEarlier,
  onMoveLater,
}: {
  event: TripEvent;
  tz: string;
  booking?: { confirmationCode?: string };
  onEdit: () => void;
  onDelete: () => void;
  // Present only for soft rows — move the event to the shelf as an idea.
  onPark?: () => void;
  // Present only for soft rows (hard events are pinned anchors, not draggable).
  grip?: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: () => void;
  };
  dragging?: boolean;
  over?: boolean;
  // undefined at the ends of the soft list (nothing to swap with)
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const isHard = event.kind === EVENT_KIND.HARD;
  const code = booking?.confirmationCode ? `${CODE_PREFIX}${booking.confirmationCode}` : undefined;
  const meta = [event.location, code && `${t.event.bookingLabel} ${code}`]
    .filter(Boolean)
    .join(' · ');

  const cls = ['bld', isHard ? '' : 'soft', dragging ? 'dragging' : '', over ? 'over' : '']
    .filter(Boolean)
    .join(' ');

  // Row actions live behind one ⋯ button (a bottom sheet), not a strip of inline
  // icons — a phone row only has width for grip + title + time + one affordance
  // (mockups/plan-mode-v1.html). Edit is also reachable by tapping the row body.
  const [menuOpen, setMenuOpen] = useState(false);
  const runAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div className={cls} data-bld-id={event.id}>
      {grip ? (
        <span className="bld-reorder">
          <button className="bld-grip" aria-label={t.planDay.drag} {...grip}>
            ⠿
          </button>
          <span className="bld-move-stack">
            <button
              className="bld-move"
              onClick={onMoveEarlier}
              disabled={!onMoveEarlier}
              aria-label={t.planDay.moveEarlier}
            >
              ▲
            </button>
            <button
              className="bld-move"
              onClick={onMoveLater}
              disabled={!onMoveLater}
              aria-label={t.planDay.moveLater}
            >
              ▼
            </button>
          </span>
        </span>
      ) : (
        <span className="bld-anchor" aria-label={t.planDay.pinned} title={t.planDay.pinned}>
          {ICONS.lock}
        </span>
      )}
      <span className="bld-bd" aria-hidden="true">
        {event.icon}
      </span>
      <button className="bld-main" onClick={onEdit}>
        <span className="bld-t">
          {event.title}
          {isHard ? (
            <span className="tag-hard">
              {ICONS.lock} {t.event.hard}
            </span>
          ) : (
            <span className="tag-soft">{t.event.soft}</span>
          )}
        </span>
        {meta && <span className="bld-m">{meta}</span>}
      </button>
      {event.startsAt && (
        <span className="bld-time" dir="ltr">
          {formatTime(event.startsAt, tz)}
          {event.endsAt && `–${formatTime(event.endsAt, tz)}`}
        </span>
      )}
      <button
        className="bld-icon"
        onClick={() => setMenuOpen(true)}
        aria-label={t.planDay.rowActions}
      >
        {ICONS.more}
      </button>
      {menuOpen && (
        <Sheet title={event.title} onClose={() => setMenuOpen(false)}>
          <div className="row-actions">
            <button className="row-action" onClick={() => runAction(onEdit)}>
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.edit}
              </span>
              {t.actions.edit}
            </button>
            {onPark && (
              <button className="row-action" onClick={() => runAction(onPark)}>
                <span className="row-action-ic" aria-hidden="true">
                  {ICONS.toShelf}
                </span>
                {t.planDay.toShelf}
              </button>
            )}
            <button className="row-action danger" onClick={() => runAction(onDelete)}>
              <span className="row-action-ic" aria-hidden="true">
                {ICONS.trash}
              </span>
              {t.actions.delete}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MaybeCard({
  item,
  onSchedule,
  onRemove,
}: {
  item: MaybeItem;
  onSchedule: () => void;
  onRemove: () => void;
}) {
  // Consumed (scheduled) ideas are filtered out before render (ADR-0027), so a
  // card is always an actionable, unplaced idea: schedule it or remove it.
  return (
    <div className="maybe">
      <button className="maybe-remove" onClick={onRemove} aria-label={t.planDay.removeIdea}>
        ✕
      </button>
      <button className="maybe-body" onClick={onSchedule}>
        <span className="mi">{item.icon}</span>
        <span className="mt">{item.title}</span>
        <span className="mm">{maybeMeta(item.id)}</span>
        <span className="add">
          {ICONS.add} {t.actions.scheduleToDay}
        </span>
      </button>
    </div>
  );
}

// Add an idea to the shelf (Plan-mode Tier 3). Manual entry until Places
// research (Map tab) lands; icon defaults server-agnostically in verbs.addMaybe.
function AddIdea({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  };
  return (
    <form className="add-idea" onSubmit={submit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.planDay.addIdeaPlaceholder}
        aria-label={t.planDay.addIdea}
      />
      <button type="submit" className="add-idea-btn" disabled={!title.trim()}>
        {ICONS.add}
      </button>
    </form>
  );
}
