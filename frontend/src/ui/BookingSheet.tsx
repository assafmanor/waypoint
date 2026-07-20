// Booking form (ADR-0047/0048) — one merged sheet for create and edit. Fields:
// type (create only), IconPicker glyph + derived category, title, confirmation
// code, transport origin/destination (each a name-only Place, authored on save),
// hotel room/WiFi, notes, and an optional date/time that seeds the linked
// itinerary event (the backend upserts it). Delete surfaces the delete-both-vs-
// unlink choice when a booking is tied to an event (ADR-0047 §3).
//
// Structure folded onto the shared editing grammar (U-01/U-02/U-05): fields wear
// the Field shell, every date/time flows through the WhenField standard (a span
// for two-endpoint bookings, a single day otherwise — never a cramped native
// datetime box), the footer is FormActions, delete routes through the generic
// ConfirmDialog, and a dirty close is guarded by a discard confirm.
import { useState } from 'react';
import {
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  EVENT_KIND,
  type Booking,
  type BookingType,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { IconPicker } from './IconPicker';
import { Icon } from './Icon';
import { NavArrow } from './NavArrow';
import { Field } from './primitives/Field';
import { FormActions } from './primitives/FormActions';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { WhenField } from './primitives/WhenField';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { useUnsavedGuard } from '../lib/useUnsavedGuard';
import {
  mergeBookingDetails,
  deleteFlags,
  buildEventSeed,
  buildSpanSeed,
  dateOutOfTripRange,
  findPlaceByName,
  isoToDateTimeLocal,
  routeTitle,
} from '../lib/booking-edit';
import { placeName } from '../lib/places';
import { withChangeGroup } from '../lib/outbox';
import { isoToTimeInput, zonedIso } from '../lib/time';
import { bookingDurationUnit, timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const BOOKING_TYPE_OPTIONS = Object.values(BOOKING_TYPE).map((ty) => ({
  value: ty,
  icon: BOOKING_TYPE_ICON[ty],
  label: t.index.bookingType[ty],
}));
const isTransportType = (ty: BookingType) =>
  ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;
// Two-endpoint schedule (start + end, may span days): transport departure→arrival,
// a hotel check-in→check-out, an activity start→end. Restaurant/other are a
// single point on a day (date + the events time picker).
const isSpanType = (ty: BookingType) =>
  isTransportType(ty) || ty === BOOKING_TYPE.HOTEL || ty === BOOKING_TYPE.ACTIVITY;

/** The two span-endpoint labels for a type — shared with the detail view and the
 *  Index row so the wording never drifts (`../lib/booking-timing`). */
const spanLabels = timingLabels;

/** Pre-set fields for a create-flow open (ADR-0061): the Plan-home checklist opens
 *  the form for a specific booking type, and for a flight seeds the missing leg's
 *  destination endpoint. Ignored when editing an existing booking. */
export interface BookingSeed {
  type?: BookingType;
  origin?: string;
  dest?: string;
}

export function BookingSheet({
  booking,
  seed,
  onClose,
}: {
  booking?: Booking | null;
  seed?: BookingSeed;
  onClose: () => void;
}) {
  const { trip, events, places, indexVerbs } = useTrip();
  const isCreate = !booking;
  const linkedEvent = booking ? events.find((e) => e.bookingId === booking.id) : undefined;
  const initialType = booking?.type ?? seed?.type ?? BOOKING_TYPE.FLIGHT;
  const wifi = booking?.details?.wifi as Wifi | undefined;

  const defaultKind = (ty: BookingType) => (isSpanType(ty) ? EVENT_KIND.HARD : EVENT_KIND.SOFT);

  // Initial values captured up front so the unsaved-changes guard can diff them.
  const initialIcon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[initialType];
  const initialTitle = booking?.title ?? '';
  const initialCode = booking?.confirmationCode ?? '';
  const initialOrigin = placeName(places, booking?.fromPlaceId) ?? seed?.origin ?? '';
  const initialDest = placeName(places, booking?.toPlaceId) ?? seed?.dest ?? '';
  const initialRoom = (booking?.details?.room as string | undefined) ?? '';
  const initialNotes = (booking?.details?.notes as string | undefined) ?? '';
  const initialWifiNetwork = wifi?.network ?? '';
  const initialWifiPassword = wifi?.password ?? '';
  const initialDate = linkedEvent?.date ?? '';
  const initialStart = linkedEvent?.startsAt
    ? isoToTimeInput(linkedEvent.startsAt, trip.timezone)
    : '';
  const initialEnd = linkedEvent?.endsAt ? isoToTimeInput(linkedEvent.endsAt, trip.timezone) : '';
  const initialSpanStart = linkedEvent?.startsAt
    ? isoToDateTimeLocal(linkedEvent.startsAt, trip.timezone)
    : '';
  const initialSpanEnd = linkedEvent?.endsAt
    ? isoToDateTimeLocal(linkedEvent.endsAt, trip.timezone)
    : '';
  const initialKind: 'hard' | 'soft' = linkedEvent?.kind ?? defaultKind(initialType);

  const [type, setType] = useState<BookingType>(initialType);
  const [iconTouched, setIconTouched] = useState(false);
  const [icon, setIcon] = useState(initialIcon);
  const [title, setTitle] = useState(initialTitle);
  const [code, setCode] = useState(initialCode);
  const [origin, setOrigin] = useState(initialOrigin);
  const [dest, setDest] = useState(initialDest);
  const [room, setRoom] = useState(initialRoom);
  const [notes, setNotes] = useState(initialNotes);
  const [wifiNetwork, setWifiNetwork] = useState(initialWifiNetwork);
  const [wifiPassword, setWifiPassword] = useState(initialWifiPassword);
  // Non-transport scheduling: a single day + optional same-day time span.
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  // Span scheduling (transport departure/arrival, hotel check-in/check-out): two
  // explicit datetimes that may fall on different days.
  const [spanStart, setSpanStart] = useState(initialSpanStart);
  const [spanEnd, setSpanEnd] = useState(initialSpanEnd);
  const [kind, setKind] = useState<'hard' | 'soft'>(initialKind);
  const [kindTouched, setKindTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isTransport = isTransportType(type);
  const isHotel = type === BOOKING_TYPE.HOTEL;
  const isSpan = isSpanType(type);
  // A booked event's category is its booking type's — canonical (ADR-0038), not
  // the picked glyph. The IconPicker only sets the badge icon; a ⭐ on a hotel
  // stays lodging, so nights/check-in-out/ambient behaviour all follow the type.
  const category = BOOKING_TYPE_TO_CATEGORY[type];

  const dirty =
    type !== initialType ||
    icon !== initialIcon ||
    title !== initialTitle ||
    code !== initialCode ||
    origin !== initialOrigin ||
    dest !== initialDest ||
    room !== initialRoom ||
    notes !== initialNotes ||
    wifiNetwork !== initialWifiNetwork ||
    wifiPassword !== initialWifiPassword ||
    date !== initialDate ||
    start !== initialStart ||
    end !== initialEnd ||
    spanStart !== initialSpanStart ||
    spanEnd !== initialSpanEnd ||
    kind !== initialKind;
  const { guardedClose, prompting, confirmDiscard, cancelDiscard } = useUnsavedGuard(dirty);
  const requestClose = () => guardedClose(onClose);

  const changeType = (next: BookingType) => {
    setType(next);
    if (!iconTouched) setIcon(BOOKING_TYPE_ICON[next]);
    if (!kindTouched) setKind(defaultKind(next));
  };
  const pickKind = (k: 'hard' | 'soft') => {
    setKind(k);
    setKindTouched(true);
  };

  const resolvePlaceId = async (name: string): Promise<string | undefined> => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    return (
      findPlaceByName(places, trimmed)?.id ?? (await indexVerbs.createPlace({ name: trimmed }))
    );
  };

  const save = async () => {
    // Transport is identified by its route, not a name (ADR-0059 §3): derive the
    // stored title from origin→destination (it backs the linked event's title and
    // any place-less fallback), so a flight never carries a hand-typed name.
    let finalTitle: string;
    if (isTransport) {
      finalTitle = routeTitle(origin, dest, t.arrows.route);
      if (!finalTitle) return setError(t.index.form.routeRequired);
    } else {
      finalTitle = title.trim();
      if (!finalTitle) return setError(t.index.form.titleRequired);
    }
    const outOfRange = (v: string) => dateOutOfTripRange(v, trip.startDate, trip.endDate);
    if (isSpan ? outOfRange(spanStart) || outOfRange(spanEnd) : outOfRange(date)) {
      return setError(t.index.form.dateOutOfRange);
    }
    // A span's end must be after its start. WhenField bounds the end's earliest
    // day to the start day; this also rejects a same-day end at/before the start
    // time (a time-less end stays open-ended, so only guard when both have one).
    if (isSpan) {
      const [sDay, sTime] = spanStart.split('T');
      const [eDay, eTime] = spanEnd.split('T');
      if (sTime && eTime) {
        const s = Date.parse(zonedIso(sDay, sTime, trip.timezone));
        const e = Date.parse(zonedIso(eDay, eTime, trip.timezone));
        if (e <= s) return setError(t.index.form.endBeforeStart);
      }
    }
    setSaving(true);
    try {
      // One user action → one change group (ADR-0092): the places backing a
      // transport route and the booking itself queue together and count as a
      // single pending change, not three.
      await withChangeGroup(async () => {
        // Author places before the booking that FK-references them (see createPlace).
        const fromPlaceId = isTransport ? await resolvePlaceId(origin) : undefined;
        const toPlaceId = isTransport ? await resolvePlaceId(dest) : undefined;
        const details = mergeBookingDetails(booking?.details, {
          room: isHotel ? room : undefined,
          notes,
          wifiNetwork: isHotel ? wifiNetwork : undefined,
          wifiPassword: isHotel ? wifiPassword : undefined,
        });
        const event = isSpan
          ? buildSpanSeed(
              { startAt: spanStart, endAt: spanEnd, kind, icon, category },
              trip.timezone,
            )
          : buildEventSeed({ date, start, end, kind, icon, category }, trip.timezone);
        const base = {
          title: finalTitle,
          // Send the trimmed value even when empty: an empty string is the explicit
          // "clear the code" intent (undefined would be dropped by JSON.stringify and
          // read as "leave unchanged"). The backend normalizes empty → null.
          confirmationCode: code.trim(),
          details,
          event,
        };
        if (isCreate) {
          await indexVerbs.createBooking({ type, ...base, fromPlaceId, toPlaceId });
        } else {
          await indexVerbs.updateBooking(booking.id, {
            ...base,
            ...(isTransport ? { fromPlaceId, toPlaceId } : {}),
          });
        }
      });
      onClose();
    } catch {
      setSaving(false); // the verb already toasted + rolled back
    }
  };

  return (
    <>
      <Sheet
        ariaLabel={isCreate ? t.index.form.createTitle : t.index.sheet.editTitle}
        onClose={requestClose}
      >
        <div
          className="booking-sheet"
          // Reveal the focused field above the on-screen keyboard within the
          // scrolling sheet (matches EventForm — the keyboard never covers a field).
          onFocusCapture={(e) => {
            if (e.target instanceof HTMLElement)
              e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
        >
          {isCreate && (
            <ChoiceGrid
              options={BOOKING_TYPE_OPTIONS}
              value={type}
              onChange={changeType}
              columns={3}
              ariaLabel={t.index.form.kindLabel}
            />
          )}

          <div className="titlerow">
            <IconPicker
              icon={icon}
              // Booking icon is a badge only — the category comes from the type
              // (ADR-0038), so the picker's category suggestion is ignored here.
              onChange={(next) => {
                setIcon(next);
                setIconTouched(true);
              }}
            />
            {isTransport ? (
              // A flight's identity is its route, not a name (ADR-0059 §3): the two
              // route endpoints ARE the title row — editable inputs beside the icon,
              // not a read-only preview that reads as a tappable title.
              <div className="bs-route-inputs">
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={t.index.form.originShort}
                  aria-label={t.index.form.originLabel}
                  autoFocus={isCreate}
                />
                <span className="arr" aria-hidden="true">
                  <NavArrow variant="forward" />
                </span>
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder={t.index.form.destShort}
                  aria-label={t.index.form.destLabel}
                />
              </div>
            ) : (
              <input
                className="bs-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.index.sheet.titlePlaceholder}
                aria-label={t.index.sheet.titlePlaceholder}
                autoFocus={isCreate}
              />
            )}
          </div>

          <div className="bs-caption">
            <span>
              ✨ {t.index.form.autoCaption}{' '}
              <span className="cat-readout">{t.index.bookingType[type]}</span>
            </span>
            {iconTouched && (
              <button
                type="button"
                className="bs-revert"
                onClick={() => {
                  setIcon(BOOKING_TYPE_ICON[type]);
                  setIconTouched(false);
                }}
              >
                <Icon name="reset" /> {t.index.form.reset}
              </button>
            )}
          </div>

          {/* The route endpoints live in the title row above; this only adds the
              place-picker hint under them. */}
          {isTransport && <div className="bs-route-hint">📍 {t.index.form.routeHint}</div>}

          {/* "When" comes first (right after the identity row), through the one
              WhenField standard — a span for two-endpoint bookings, a single day
              otherwise. Never a cramped native datetime box (U-05). */}
          {isSpan ? (
            <>
              <WhenField
                variant="span"
                start={spanStart}
                end={spanEnd}
                onChange={({ start: s, end: e }) => {
                  setSpanStart(s);
                  setSpanEnd(e);
                }}
                minDate={trip.startDate}
                maxDate={trip.endDate}
                labels={spanLabels(type)}
                defaultDate={trip.startDate}
                timeZone={trip.timezone}
                durationUnit={bookingDurationUnit(type)}
              />
              {spanStart && <KindToggle kind={kind} onPick={pickKind} />}
            </>
          ) : (
            <>
              <WhenField
                variant="day"
                dateId="bs-date"
                dateLabel={t.index.form.dateLabel}
                date={date}
                start={start}
                end={end}
                onChange={({ date: d, start: s, end: e }) => {
                  setDate(d);
                  setStart(s);
                  setEnd(e);
                }}
                minDate={trip.startDate}
                maxDate={trip.endDate}
              />
              {date && <KindToggle kind={kind} onPick={pickKind} />}
            </>
          )}

          <Field label={t.index.sheet.codeLabel} htmlFor="bs-code">
            <input id="bs-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>

          {isHotel && (
            <>
              <Field label={t.index.sheet.roomLabel} htmlFor="bs-room">
                <input id="bs-room" value={room} onChange={(e) => setRoom(e.target.value)} />
              </Field>
              <div className="bs-wifi">
                <div className="bs-wifi-head">
                  📶 {t.index.sheet.wifiTitle}
                  <span className="bs-hint"> · {t.index.sheet.wifiHotelOnly}</span>
                </div>
                <div className="bs-row2">
                  <Field label={t.index.sheet.wifiNetwork} htmlFor="bs-wifi-net">
                    <input
                      id="bs-wifi-net"
                      dir="ltr"
                      value={wifiNetwork}
                      onChange={(e) => setWifiNetwork(e.target.value)}
                    />
                  </Field>
                  <Field label={t.index.sheet.wifiPassword} htmlFor="bs-wifi-pass">
                    <input
                      id="bs-wifi-pass"
                      dir="ltr"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </>
          )}

          <Field label={t.index.sheet.notesLabel} htmlFor="bs-notes">
            <textarea id="bs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <FormActions
            primary={{ label: t.common.save, onClick: save, disabled: saving }}
            secondary={{ label: t.common.cancel, onClick: requestClose }}
            destructive={
              isCreate
                ? undefined
                : { label: t.index.sheet.delete, onClick: () => setDeleting(true) }
            }
          />
        </div>
      </Sheet>

      {deleting && booking && (
        <DeletePrompt
          hasLinkedEvent={!!linkedEvent}
          linkedIsHard={linkedEvent?.kind === 'hard'}
          onCancel={() => setDeleting(false)}
          onChoose={(choice) => {
            void indexVerbs.deleteBooking(booking.id, deleteFlags(choice)).catch(() => {});
            setDeleting(false);
            onClose();
          }}
        />
      )}

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

function KindToggle({
  kind,
  onPick,
}: {
  kind: 'hard' | 'soft';
  onPick: (k: 'hard' | 'soft') => void;
}) {
  return (
    <Field label={t.index.form.kindLabel}>
      <div className="kind-toggle">
        <button
          type="button"
          className={'soft' + (kind === EVENT_KIND.SOFT ? ' on' : '')}
          onClick={() => onPick(EVENT_KIND.SOFT)}
        >
          {t.index.form.kindSoft}
        </button>
        <button
          type="button"
          className={'hard' + (kind === EVENT_KIND.HARD ? ' on' : '')}
          onClick={() => onPick(EVENT_KIND.HARD)}
        >
          {t.index.form.kindHard}
        </button>
      </div>
    </Field>
  );
}

export function DeletePrompt({
  hasLinkedEvent,
  linkedIsHard,
  onCancel,
  onChoose,
}: {
  hasLinkedEvent: boolean;
  linkedIsHard: boolean;
  onCancel: () => void;
  onChoose: (choice: 'both' | 'unlink') => void;
}) {
  // A booking with no linked event is a plain confirm; a linked one offers the
  // delete-both-vs-unlink choice (ADR-0047 §3). Both route through the generic
  // danger dialog — Modal portals it above the open booking sheet.
  if (!hasLinkedEvent) {
    return (
      <ConfirmDialog
        tone="danger"
        icon="🗑️"
        title={t.index.del.plainTitle}
        body={t.index.del.plainBody}
        confirmLabel={t.index.del.confirmDelete}
        cancelLabel={t.index.del.cancel}
        onConfirm={() => onChoose('unlink')}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ConfirmDialog
      tone="danger"
      icon="🔗"
      title={t.index.del.linkedTitle}
      body={t.index.del.linkedBody}
      onCancel={onCancel}
    >
      {linkedIsHard && <p className="bs-hard-note">🔒 {t.index.del.hardNote}</p>}
      <div className="bs-choices">
        <button type="button" className="bs-choice danger" onClick={() => onChoose('both')}>
          <div className="bs-choice-t">{t.index.del.both}</div>
          <div className="bs-choice-s">{t.index.del.bothSub}</div>
        </button>
        <button type="button" className="bs-choice" onClick={() => onChoose('unlink')}>
          <div className="bs-choice-t">{t.index.del.unlink}</div>
          <div className="bs-choice-s">{t.index.del.unlinkSub}</div>
        </button>
      </div>
      <button type="button" className="confirm-cancel bs-choice-cancel" onClick={onCancel}>
        {t.index.del.cancel}
      </button>
    </ConfirmDialog>
  );
}
