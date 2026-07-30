// Trip creation /new (ADR-0032): three inputs — destination → dates → name
// (auto-suggested) — everything else derived or deferred. Shell surface
// (ADR-0024): indigo/neutral chrome, no amber/teal/violet. The draft preview
// renders in the soft grammar (dashed, provisional) and turns solid only
// after landing inside the created trip. Design reference: mockups/create-trip-v1.html.
//
// Creation doesn't drop straight into the trip (T-065): screen 2 of the
// mockup (#s-born) is a beat to get the invite link in front of the creator
// immediately — plan-violet chrome since it's already "inside" the new trip.
//
// ── Trip birth (ADR-0142, mockups/motion-trip-birth-v1.html) ────────────────
// The two screens are ONE component and one `.app` root, which is what lets the
// moment be a transition rather than a swap. Three things depend on it:
//
//   • the draft card is a SHARED ELEMENT — one node that travels from its slot in
//     the form to the born card's position and turns from the soft grammar to
//     solid. Not two cards cross-fading: the card you were looking at is the card
//     you end up with, and dashed→solid is ADR-0011's grammar meaning
//     "provisional → committed" at the exact frame the trip stops being a draft;
//   • the chrome WARMS indigo → plan-violet on one header, rather than one header
//     replacing another;
//   • the board POWERS ON. The zero state renders this same board unpowered
//     (ADR-0024 §2) and Trip Home renders it live, so creation is the gap between
//     them: the board's first departure. No new celebration vocabulary, and no
//     second `--t-cinematic` moment — the same asset on a second trigger.
//
// The sequence is skippable by a tap, because a celebration you cannot interrupt
// is a modal dialog wearing a costume.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createTripSchema,
  DESTINATIONS,
  MAX_TRIP_NAME_LENGTH,
  suggestFlagFromDestination,
  TRIP_ICON_CLUSTERS,
  type Trip,
} from '@waypoint/shared';
import { useIsOffline } from '../lib/outbox';
import { useActiveTripId } from '../state/active-trip-id';
import { useAppBack } from '../state/nav-state';
import { createInvite, createTrip } from '../lib/api';
import { suggestTripName } from '../lib/trip-name';
import { useDerivedField } from '../lib/useDerivedField';
import { prefersReducedMotion } from '../lib/motion';
import { useToast } from '../ui/Toast';
import { IconPicker } from '../ui/IconPicker';
import { DestinationPicker, type PickedDestination } from '../ui/DestinationPicker';
import { ZonePicker, zoneLabel } from '../ui/primitives/ZonePicker';
import { Icon } from '../ui/Icon';
import {
  MS_PER_DAY,
  CONTROL_ICON,
  DEFAULT_TRIP_ICON,
  DEVICE_LOCALE,
  TRIP_BIRTH,
} from '../constants';
import { todayInTz } from '../lib/time';
import { getNow } from '../lib/useClock';
import { NavArrow } from '../ui/NavArrow';
import { t } from '../i18n/he';

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Which beat of the birth sequence has landed. `form` and `submitting` are the
 *  creation screen; everything from `born` on is the new trip. */
type Phase = 'form' | 'submitting' | 'born';

export function CreateTrip() {
  const navigate = useNavigate();
  const goBack = useAppBack();
  const { setTripId } = useActiveTripId();
  const offline = useIsOffline();
  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);

  const [destination, setDestination] = useState('');
  // Structured destination + derived primary timezone from the Places pick (ADR-0113).
  // A "use as typed" destination leaves the structured fields empty and the zone at
  // the device default.
  const [destPlace, setDestPlace] = useState<Omit<PickedDestination, 'name'>>({});
  const [timezone, setTimezone] = useState(DEVICE_TZ);
  const [candidateZones, setCandidateZones] = useState<string[] | undefined>(undefined);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Both auto-suggest from the destination until the user overrides them (ADR-0038: flag
  // auto-fill, overridable) — the same derived-until-touched mechanism the two authoring forms
  // run, so they use the same hook rather than a sixth and seventh copy of the flag.
  const name = useDerivedField('');
  const icon = useDerivedField(DEFAULT_TRIP_ICON);
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest the trip name and — from a recognized destination — the flag,
  // until the user overrides either (ADR-0038: flag auto-fill, overridable).
  const suggest = (dest: string, start: string) => {
    name.redrive(suggestTripName(dest, start));
    icon.redrive(suggestFlagFromDestination(dest) ?? DEFAULT_TRIP_ICON);
  };

  // A picked destination sets the display name, the structured fields, and the
  // derived primary timezone (ADR-0113): a single-zone place sets it silently; a
  // multi-zone country pre-fills it + surfaces the candidate zones for the note +
  // ZonePicker. A "use as typed" pick clears the structured fields + resets the
  // zone to the device default. It also re-runs the name/flag auto-suggest.
  const handleDestination = ({ name: destName, ...place }: PickedDestination) => {
    setDestination(destName);
    setDestPlace(place);
    setTimezone(place.timezone ?? DEVICE_TZ);
    setCandidateZones(place.candidateZones);
    suggest(destName, startDate);
  };

  // Device-local "today" as YYYY-MM-DD — the floor for a new trip's dates. A
  // trip already under way is fine (start ≤ today ≤ end), but one that ended in
  // the past isn't a trip you're about to take.
  const today = todayInTz(DEVICE_TZ, new Date(getNow()));
  const startInPast = Boolean(startDate && startDate < today);
  const endInPast = Boolean(endDate && endDate < today);
  const datesInvalid =
    Boolean(startDate && endDate && endDate < startDate) || startInPast || endInPast;
  const canCreate = Boolean(destination && startDate && endDate && name.value && !datesInvalid);

  const days =
    startDate && endDate
      ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / MS_PER_DAY) + 1
      : 0;

  let draftMeta: string = t.shell.newTrip.draftPending;
  if (destination && startDate && endDate && !datesInvalid) {
    draftMeta = t.shell.newTrip.draftMeta(destination, days);
  } else if (destination) {
    draftMeta = destination;
  }

  const submit = async () => {
    const parsed = createTripSchema.safeParse({
      name: name.value,
      destination,
      destinationGooglePlaceId: destPlace.googlePlaceId,
      destinationLat: destPlace.lat,
      destinationLng: destPlace.lng,
      destinationCountryCode: destPlace.countryCode,
      startDate,
      endDate,
      timezone,
      icon: icon.value,
    });
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      const trip = await createTrip(parsed.data);
      setTripId(trip.id);
      setCreatedTrip(trip);
    } finally {
      setSubmitting(false);
    }
  };

  const phase: Phase = createdTrip ? 'born' : submitting ? 'submitting' : 'form';

  return (
    <Birth
      phase={phase}
      trip={createdTrip}
      icon={icon.value}
      title={name.value}
      meta={draftMeta}
      onDone={() => navigate('/')}
    >
      <header className="new-head birth-head">
        <div className="new-head-row">
          <button className="back" onClick={goBack} aria-label={t.shell.newTrip.back}>
            <NavArrow variant="back" />
          </button>
          <div className="new-title">{createdTrip ? createdTrip.name : t.shell.newTrip.title}</div>
          {/* The born screen is already INSIDE the trip, in Plan mode. The pill
              arrives with the chrome rather than replacing a different header. */}
          <span className="mode-pill birth-pill">
            <Icon name="edit" /> {t.shell.created.modePill}
          </span>
        </div>
        {offline && (
          <div className="offline-badge">
            <Icon name="offline" /> {t.header.offlineNow}
          </div>
        )}
      </header>

      <main className="new-body birth-form">
        {/* One `--i` step per group, so the form ASSEMBLES rather than appearing
            whole — and it is finished before a fast typist reaches the first field
            (ADR-0142 §1). The point is that it was built, not that you waited. */}
        <p className="new-lede birth-in" style={{ '--i': 0 } as React.CSSProperties}>
          {t.shell.newTrip.lede}
        </p>

        <div className="field birth-in" style={{ '--i': 1 } as React.CSSProperties}>
          <label htmlFor="dest">{t.shell.newTrip.destLabel}</label>
          <DestinationPicker value={destination} onPick={handleDestination} />
          {destination && (
            <div className="dest-tz">
              <button
                type="button"
                className="dest-tz-chip"
                onClick={() => setTzPickerOpen(true)}
                aria-label={t.shell.newTrip.tzLabel}
              >
                <Icon name="clock" />
                <span>{zoneLabel(timezone)}</span>
                <Icon name="caret" dir="down" />
              </button>
              {candidateZones && <p className="dest-tz-note">{t.shell.newTrip.tzMultiNote}</p>}
            </div>
          )}
          {tzPickerOpen && (
            <ZonePicker
              value={timezone}
              suggested={[DEVICE_TZ, ...(candidateZones ?? [])]}
              onChange={(zone) => {
                setTimezone(zone);
                setTzPickerOpen(false);
              }}
              onClose={() => setTzPickerOpen(false)}
            />
          )}
        </div>

        <div className="field birth-in" style={{ '--i': 2 } as React.CSSProperties}>
          <label>{t.shell.newTrip.datesLabel}</label>
          <div className="date-row">
            <input
              type="date"
              lang={DEVICE_LOCALE}
              min={today}
              className={startInPast ? 'invalid' : ''}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                suggest(destination, e.target.value);
              }}
            />
            <input
              type="date"
              lang={DEVICE_LOCALE}
              min={startDate || today}
              value={endDate}
              className={datesInvalid ? 'invalid' : ''}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {datesInvalid && (
            <div className="field-error">
              {startInPast || endInPast ? t.shell.newTrip.datePast : t.shell.newTrip.dateError}
            </div>
          )}
        </div>

        <div className="field birth-in" style={{ '--i': 3 } as React.CSSProperties}>
          <label htmlFor="tripName">{t.shell.newTrip.nameLabel}</label>
          <div className="title-row">
            <IconPicker
              icon={icon.value}
              onChange={icon.set}
              flatClusters={TRIP_ICON_CLUSTERS}
              destinations={DESTINATIONS}
            />
            <input
              id="tripName"
              className="title-input"
              value={name.value}
              placeholder={t.shell.newTrip.namePlaceholder}
              maxLength={MAX_TRIP_NAME_LENGTH}
              onChange={(e) => name.set(e.target.value.slice(0, MAX_TRIP_NAME_LENGTH))}
            />
          </div>
          <div className="hint">{t.shell.newTrip.nameHint}</div>
        </div>

        {/* The shared card's slot in the form. It reserves the space; the card
            itself is rendered once by `Birth` and positioned over whichever slot
            the current phase owns. */}
        <div className="birth-slot" data-slot="form" aria-hidden="true" />

        <div className="new-cta birth-in" style={{ '--i': 4 } as React.CSSProperties}>
          {/* U-13: the CTA is always visible, disabled with a reason until the
              form is complete, so a first-timer always sees the next step. It also
              ARMS when the form completes (ADR-0142 §1) — the disabled→enabled flip
              is a real state change, and it is the app saying "you're done". */}
          <button
            className="create-btn"
            onClick={submit}
            disabled={!canCreate || offline || submitting}
            data-armed={canCreate && !offline ? '' : undefined}
          >
            {t.shell.newTrip.createButton}
          </button>
          {!canCreate && !offline && <p className="new-note">{t.shell.newTrip.ctaReason}</p>}
          {offline && <p className="offline-note">{t.shell.newTrip.offlineNote}</p>}
          <p className="new-note">{t.shell.newTrip.note}</p>
        </div>
      </main>
    </Birth>
  );
}

/** The birth choreography, and the one `.app` root both screens share.
 *
 *  It owns three things the two screens cannot own separately: the shared card's
 *  flight (measured from the two slots), the beat timers, and the skip. The form is
 *  passed as `children` so the whole creation screen above stays readable as a form. */
function Birth({
  phase,
  trip,
  icon,
  title,
  meta,
  onDone,
  children,
}: {
  phase: Phase;
  trip: Trip | null;
  icon: string;
  title: string;
  meta: string;
  onDone: () => void;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState(0);
  // Beats land independently so a skip can land them all at once.
  const [chrome, setChrome] = useState(false);
  const [board, setBoard] = useState(false);
  const [content, setContent] = useState(false);
  const [running, setRunning] = useState(false);

  const land = useCallback(() => {
    setChrome(true);
    setBoard(true);
    setContent(true);
    setRunning(false);
  }, []);

  // Measure the two slots and hand the delta to CSS. Both bodies carry the same
  // horizontal padding, so the card's WIDTH never changes and the flight is one
  // axis — which is why this is a transform rather than an animation of `top`.
  // `useLayoutEffect` so the offset is set before the browser paints the card.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const form = root.querySelector<HTMLElement>('[data-slot="form"]');
      const born = root.querySelector<HTMLElement>('[data-slot="born"]');
      if (!form || !born) return;
      setFlight(form.getBoundingClientRect().top - born.getBoundingClientRect().top);
    };
    measure();
    // The form's height changes as fields fill in (a date error appears, a
    // timezone note shows), so the flight has to be re-measured rather than read
    // once — otherwise the card starts its travel from a stale position.
    //
    // Guarded rather than shimmed in tests: jsdom has no `ResizeObserver`, and the
    // one-shot `measure()` above is the part that matters for correctness. Without
    // the observer the flight is simply measured once, which is also the honest
    // fallback anywhere else the API is missing.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [phase]);

  // The sequence. Reduced motion lands the END STATE immediately — a user who asked
  // for less motion did not ask for a different outcome (ADR-0140 §5).
  useEffect(() => {
    if (phase !== 'born') return;
    if (prefersReducedMotion()) {
      land();
      return;
    }
    setRunning(true);
    const ids = [
      setTimeout(() => setChrome(true), TRIP_BIRTH.CHROME_MS),
      setTimeout(() => setBoard(true), TRIP_BIRTH.BOARD_MS),
      setTimeout(() => setContent(true), TRIP_BIRTH.CONTENT_MS),
      setTimeout(() => setRunning(false), TRIP_BIRTH.TOTAL_MS),
    ];
    return () => ids.forEach(clearTimeout);
  }, [phase, land]);

  return (
    <div
      ref={rootRef}
      className="app birth"
      data-mode={trip ? 'plan' : undefined}
      data-birth={phase}
      data-chrome={chrome ? 'warm' : undefined}
      data-board={board ? 'on' : undefined}
      data-content={content ? 'in' : undefined}
      style={{ '--flight': `${flight}px` } as React.CSSProperties}
    >
      {children}
      {trip && <BornBody trip={trip} onDone={onDone} />}
      {/* ONE card for the whole sequence. It is never inside either slot, so
          nothing reflows mid-flight. */}
      <div className="birth-card" aria-hidden="true">
        <div className="ic">{icon}</div>
        <div>
          <div className="t">
            {title || <span className="ghost">{t.shell.newTrip.draftGhost}</span>}
          </div>
          <div className="m">{meta}</div>
        </div>
        <span className="tag">{t.shell.newTrip.draftTag}</span>
      </div>
      {/* Skippable by a tap anywhere, and only while the sequence is actually
          running — afterwards this must not sit over the invite box swallowing taps. */}
      {running && (
        <button className="birth-skip" onClick={land} aria-label={t.shell.created.skip} />
      )}
    </div>
  );
}

type InviteState = { status: 'pending' } | { status: 'ready'; url: string } | { status: 'failed' };

/** Screen 2 (mockup #s-born): the beat right after creation where the invite
 *  link goes in front of the creator. */
function BornBody({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const showToast = useToast();
  const [invite, setInvite] = useState<InviteState>({ status: 'pending' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createInvite(trip.id).then(
      (res) => {
        if (!cancelled)
          setInvite({ status: 'ready', url: `${window.location.origin}${res.inviteUrl}` });
      },
      () => {
        if (!cancelled) setInvite({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  const days = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;

  const copyInvite = () => {
    if (invite.status !== 'ready') return;
    void navigator.clipboard.writeText(invite.url);
    showToast(CONTROL_ICON.clipboard, t.shell.created.inviteCopied);
    // Confirm IN PLACE as well as in the toast (ADR-0142 §3): the toast says it
    // happened, the box you tapped should say that you tapped it.
    setCopied(true);
  };

  return (
    <main className="born-body birth-born">
      <div className="birth-arr born-hero" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="born-emoji">{t.shell.created.emoji}</div>
        <h1 className="born-h1">{t.shell.created.title}</h1>
        <p className="born-sub">{t.shell.created.sub}</p>
      </div>

      {/* The shared card's destination slot. */}
      <div className="birth-slot" data-slot="born" aria-hidden="true" />

      <div className="birth-arr birth-board-wrap" style={{ '--i': 1 } as React.CSSProperties}>
        <BirthBoard trip={trip} days={days} />
      </div>

      {invite.status === 'ready' && (
        <div
          className="invite-box birth-arr"
          style={{ '--i': 2 } as React.CSSProperties}
          onClick={copyInvite}
          data-copied={copied ? '' : undefined}
        >
          <span className="code" dir="auto">
            {invite.url}
          </span>
          <span className="lbl2">{t.shell.created.inviteLabel}</span>
          <span className="cp">
            <Icon name={copied ? CONTROL_ICON.done : CONTROL_ICON.clipboard} />
          </span>
        </div>
      )}
      {invite.status === 'pending' && <p className="born-teach">{t.shell.created.invitePending}</p>}
      {invite.status === 'failed' && <p className="born-teach">{t.shell.created.inviteFailed}</p>}
      {invite.status === 'ready' && (
        <p className="born-teach birth-arr" style={{ '--i': 3 } as React.CSSProperties}>
          {t.shell.created.teach}
        </p>
      )}

      <div className="born-cta birth-arr" style={{ '--i': 4 } as React.CSSProperties}>
        <button className="plan-btn" onClick={onDone}>
          {t.shell.created.planButton}
        </button>
        <button
          className="later-btn"
          onClick={() => {
            showToast(CONTROL_ICON.done, t.shell.created.laterToast);
            onDone();
          }}
        >
          {t.shell.created.laterButton}
        </button>
      </div>
    </main>
  );
}

/** The board's FIRST departure (ADR-0142 §2).
 *
 *  Deliberately the same object the zero state renders unpowered and Trip Home
 *  renders live — so this is that board being switched on, not a new element that
 *  happens to look like it. Its row is honest content: a brand-new trip's first
 *  departure IS the trip, so the flaps settle into the start date, the trip's name
 *  and how long it runs. Nothing decorative is being spelled out. */
function BirthBoard({ trip, days }: { trip: Trip; days: number }) {
  const flaps = [
    trip.startDate.slice(5).replace('-', '.'),
    trip.name,
    t.shell.created.boardDays(days),
  ];
  return (
    <section className="birth-board" aria-label={t.shell.created.boardLabel}>
      <div className="birth-board-top">
        <span className="live">
          <i />
          {t.shell.created.boardLive}
        </span>
        <span>{t.shell.created.boardFirst}</span>
      </div>
      <div className="birth-flaps" aria-hidden="true">
        {flaps.map((text, i) => (
          <span
            key={i}
            className="birth-flap"
            style={
              { '--i': i, '--flap-step': `${TRIP_BIRTH.FLAP_STEP_MS}ms` } as React.CSSProperties
            }
          >
            <span>{text}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
