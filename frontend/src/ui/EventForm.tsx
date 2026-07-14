// Self-contained event create/edit form (T-047). Rendered as a modal today;
// T-053 wraps this same component in a Trip-mode bottom sheet later — it owns
// only the fields + save/cancel, not its presentation container.
import { useState, type FormEvent } from 'react';
import {
  createEventSchema,
  updateEventSchema,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useVerbs } from '../state/verbs';
import { getNow } from '../lib/useClock';
import { zonedIso, isoToTimeInput } from '../lib/time';
import { DEFAULT_EVENT_ICON } from '../constants';
import { t } from '../i18n/he';

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
  const { trip, activeDate, activeUserId } = useTrip();
  const verbs = useVerbs();
  const tz = trip.timezone;

  const [title, setTitle] = useState(event?.title ?? maybeItem?.title ?? '');
  const [date, setDate] = useState(event?.date ?? defaults?.date ?? activeDate);
  const [start, setStart] = useState(
    event?.startsAt ? isoToTimeInput(event.startsAt, tz) : (defaults?.start ?? ''),
  );
  const [end, setEnd] = useState(
    event?.endsAt ? isoToTimeInput(event.endsAt, tz) : (defaults?.end ?? ''),
  );
  const [kind, setKind] = useState<TripEvent['kind']>(event?.kind ?? EVENT_KIND.SOFT);
  const [location, setLocation] = useState(event?.location ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError(t.eventForm.titleRequired);
    if (!date) return setError(t.eventForm.dateRequired);

    const fields = {
      date,
      title: title.trim(),
      kind,
      startsAt: start ? zonedIso(date, start, tz) : undefined,
      endsAt: end ? zonedIso(date, end, tz) : undefined,
      location: location.trim() || undefined,
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
        location: parsed.data.location,
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
        icon: DEFAULT_EVENT_ICON,
        status: EVENT_STATUS.PLANNED,
        sortOrder: 99,
        source: parsed.data.source ?? EVENT_SOURCE.MANUAL,
        createdAt: now,
        updatedAt: now,
        updatedBy: activeUserId,
      });
    }
    onClose();
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <form className="event-form-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="confirm-title">
          {event
            ? t.eventForm.editTitle
            : maybeItem
              ? t.eventForm.scheduleTitle
              : t.eventForm.newTitle}
        </div>

        <label className="form-field">
          {t.eventForm.titleLabel}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.eventForm.titlePlaceholder}
            autoFocus
          />
        </label>

        <label className="form-field">
          {t.eventForm.dateLabel}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="form-row">
          <label className="form-field">
            {t.eventForm.startLabel}
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="form-field">
            {t.eventForm.endLabel}
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <label className="form-field">
          {t.eventForm.locationLabel}
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t.eventForm.locationPlaceholder}
          />
        </label>

        <div className="form-field">
          {t.eventForm.kindLabel}
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
        </div>

        {error && <p className="confirm-body form-error">{error}</p>}

        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onClose}>
            {t.eventForm.cancel}
          </button>
          <button type="submit" className="form-save">
            {t.eventForm.save}
          </button>
        </div>
      </form>
    </div>
  );
}
