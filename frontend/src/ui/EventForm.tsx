// Self-contained event create/edit form (T-047). Renders its fields + submit
// INSIDE the single Modal primitive (variant="sheet", ADR-0079 / U-01) — so the
// overlay stack (system-back), focus-in/Escape/restore, and backdrop-close all
// work like every other sheet; this component owns only the fields, not the
// presentation container. A dirty close is guarded by a discard confirm (U-05).
import { useMemo, useState, type FormEvent } from 'react';
import {
  createEventSchema,
  updateEventSchema,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type EventCategory,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useVerbs } from '../state/verbs';
import { getNow } from '../lib/useClock';
import { zonedIso, isoToTimeInput, hardConflicts, formatTime, resolveEndIso } from '../lib/time';
import { useUnsavedGuard } from '../lib/useUnsavedGuard';
import { DEFAULT_EVENT_ICON } from '../constants';
import { t } from '../i18n/he';
import { TimePicker } from './TimePicker';
import { IconPicker } from './IconPicker';
import { Modal } from './primitives/Modal';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { DateTimeField } from './primitives/DateTimeField';
import { ConfirmDialog } from './primitives/ConfirmDialog';

export function EventForm({
  event,
  defaults,
  maybeItem,
  onClose,
}: {
  event?: TripEvent | null;
  // Prefill for a *new* event (e.g. the builder's gap-fill: date + start of the
  // gap). Ignored when editing an existing event.
  defaults?: { date?: string; start?: string; end?: string };
  // When set, this is a "schedule from the shelf" flow: same fields, but on save
  // it creates the event AND consumes the idea (verbs.schedule) instead of a
  // plain create. Prefilled from the idea's title/kind.
  maybeItem?: MaybeItem | null;
  onClose: () => void;
}) {
  const { trip, activeDate, events } = useTrip();
  const { me } = useAuth();
  const verbs = useVerbs();
  const tz = trip.timezone;

  // Initial values captured up front so the unsaved-changes guard can diff
  // against them (props are stable while the form is open).
  const initialTitle = event?.title ?? maybeItem?.title ?? '';
  const initialDate = event?.date ?? defaults?.date ?? activeDate;
  const initialStart = event?.startsAt
    ? isoToTimeInput(event.startsAt, tz)
    : (defaults?.start ?? '');
  const initialEnd = event?.endsAt ? isoToTimeInput(event.endsAt, tz) : (defaults?.end ?? '');
  const initialKind: TripEvent['kind'] = event?.kind ?? EVENT_KIND.SOFT;
  const initialIcon = event?.icon ?? maybeItem?.icon ?? DEFAULT_EVENT_ICON;
  const initialCategory = event?.category ?? maybeItem?.category;

  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [kind, setKind] = useState<TripEvent['kind']>(initialKind);
  const [icon, setIcon] = useState(initialIcon);
  const [category, setCategory] = useState<EventCategory | undefined>(initialCategory);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== initialTitle ||
    date !== initialDate ||
    start !== initialStart ||
    end !== initialEnd ||
    kind !== initialKind ||
    icon !== initialIcon ||
    category !== initialCategory;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  // Live hard-conflict warning (ADR-0011): a soft event whose span overlaps a
  // same-day hard event is flagged as it's edited — same check the day view and
  // board use, so the warning wording is consistent. Only meaningful once the
  // event has a full span; hardConflicts itself returns [] for hard events.
  const conflicts = useMemo(() => {
    if (!start || !end) return [];
    const provisional = {
      id: event?.id ?? '__provisional__',
      kind,
      startsAt: zonedIso(date, start, tz),
      endsAt: resolveEndIso(date, start, end, tz),
    } as TripEvent;
    const dayEvents = events.filter((e) => e.date === date && e.status !== EVENT_STATUS.SKIPPED);
    return hardConflicts(provisional, dayEvents);
  }, [start, end, kind, date, tz, events, event?.id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError(t.eventForm.titleRequired);
    if (!date) return setError(t.eventForm.dateRequired);
    // Native min/max guides the picker, but a typed value can still land outside
    // the trip. An event belongs to a day within [startDate, endDate] — an
    // overnight event on the last day still files under that day (ADR-0037).
    if (date < trip.startDate || date > trip.endDate) {
      return setError(t.eventForm.dateOutOfRange);
    }

    const fields = {
      date,
      title: title.trim(),
      icon,
      category,
      kind,
      startsAt: start ? zonedIso(date, start, tz) : undefined,
      endsAt: end
        ? start
          ? resolveEndIso(date, start, end, tz)
          : zonedIso(date, end, tz)
        : undefined,
    };
    if (
      fields.startsAt &&
      fields.endsAt &&
      Date.parse(fields.endsAt) <= Date.parse(fields.startsAt)
    ) {
      return setError(t.eventForm.endBeforeStart);
    }

    if (event) {
      const parsed = updateEventSchema.safeParse(fields);
      if (!parsed.success)
        return setError(parsed.error.issues[0]?.message ?? t.eventForm.titleRequired);
      verbs.update(event, parsed.data);
    } else if (maybeItem) {
      const parsed = createEventSchema.safeParse(fields);
      if (!parsed.success)
        return setError(parsed.error.issues[0]?.message ?? t.eventForm.titleRequired);
      verbs.schedule(maybeItem, {
        date: parsed.data.date,
        title: parsed.data.title,
        kind: parsed.data.kind,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        icon: parsed.data.icon,
        category: parsed.data.category,
      });
    } else {
      const parsed = createEventSchema.safeParse(fields);
      if (!parsed.success)
        return setError(parsed.error.issues[0]?.message ?? t.eventForm.titleRequired);
      const now = new Date(getNow()).toISOString();
      verbs.create({
        ...parsed.data,
        id: crypto.randomUUID(),
        tripId: trip.id,
        status: EVENT_STATUS.PLANNED,
        sortOrder: 99,
        source: parsed.data.source ?? EVENT_SOURCE.MANUAL,
        createdAt: now,
        updatedAt: now,
        updatedBy: me?.user.id ?? trip.updatedBy,
      });
    }
    onClose();
  };

  const heading = event
    ? t.eventForm.editTitle
    : maybeItem
      ? t.eventForm.scheduleTitle
      : t.eventForm.newTitle;

  return (
    <>
      <Modal variant="sheet" title={heading} onClose={requestClose}>
        <form
          className="modal-form"
          onSubmit={submit}
          // Reveal the focused field above the keyboard within the scrolling sheet.
          onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement)
              e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        >
          <Field label={t.eventForm.titleLabel}>
            <div className="title-row">
              <IconPicker
                icon={icon}
                onChange={(next, cat) => {
                  setIcon(next);
                  setCategory(cat);
                }}
              />
              <input
                className="title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.eventForm.titlePlaceholder}
              />
            </div>
          </Field>

          <Field label={t.eventForm.dateLabel} htmlFor="ef-date">
            <DateTimeField
              mode="date"
              id="ef-date"
              min={trip.startDate}
              max={trip.endDate}
              value={date}
              onChange={setDate}
            />
          </Field>

          <TimePicker
            start={start}
            end={end}
            onChange={(next) => {
              setStart(next.start);
              setEnd(next.end);
            }}
          />

          {conflicts.length > 0 && (
            <p className="form-conflict">
              ⚠︎ {t.event.conflictWarn(conflicts[0].title, formatTime(conflicts[0].startsAt!, tz))}
            </p>
          )}

          <Field label={t.eventForm.kindLabel}>
            <div className="kind-toggle">
              <button
                type="button"
                className={'soft' + (kind === EVENT_KIND.SOFT ? ' on' : '')}
                onClick={() => setKind(EVENT_KIND.SOFT)}
              >
                {t.eventForm.kindSoft}
              </button>
              <button
                type="button"
                className={'hard' + (kind === EVENT_KIND.HARD ? ' on' : '')}
                onClick={() => setKind(EVENT_KIND.HARD)}
              >
                {t.eventForm.kindHard}
              </button>
            </div>
          </Field>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <FormActions
            primary={{ label: t.common.save, type: 'submit' }}
            secondary={{ label: t.common.cancel, onClick: requestClose }}
          />
        </form>
      </Modal>

      {prompting && (
        <ConfirmDialog
          tone="danger"
          title={t.common.discardTitle}
          body={t.common.discardBody}
          confirmLabel={t.common.discardConfirm}
          cancelLabel={t.common.discardCancel}
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      )}
    </>
  );
}
