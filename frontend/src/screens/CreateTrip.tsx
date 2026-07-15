// Trip creation /new (ADR-0032): three inputs — destination → dates → name
// (auto-suggested) — everything else derived or deferred. Shell surface
// (ADR-0024): indigo/neutral chrome, no amber/teal/violet. The draft preview
// renders in the soft grammar (dashed, provisional) and turns solid only
// after landing inside the created trip. Design reference: mockups/create-trip-v1.html.
//
// Creation doesn't drop straight into the trip (T-065): screen 2 of the
// mockup (#s-born) is a beat to get the invite link in front of the creator
// immediately — plan-violet chrome since it's already "inside" the new trip.
import { useEffect, useState } from 'react';
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
import { createInvite, createTrip } from '../lib/api';
import { suggestTripName } from '../lib/trip-name';
import { useToast } from '../ui/Toast';
import { IconPicker } from '../ui/IconPicker';
import { MS_PER_DAY, ICONS, DEFAULT_TRIP_ICON, DEVICE_LOCALE } from '../constants';
import { todayInTz } from '../lib/time';
import { getNow } from '../lib/useClock';
import { t } from '../i18n/he';

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CreateTrip() {
  const navigate = useNavigate();
  const { setTripId } = useActiveTripId();
  const offline = useIsOffline();
  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [icon, setIcon] = useState(DEFAULT_TRIP_ICON);
  const [iconTouched, setIconTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest the trip name and — from a recognized destination — the flag,
  // until the user overrides either (ADR-0038: flag auto-fill, overridable).
  const suggest = (dest: string, start: string) => {
    if (!nameTouched) setName(suggestTripName(dest, start));
    if (!iconTouched) setIcon(suggestFlagFromDestination(dest) ?? DEFAULT_TRIP_ICON);
  };

  // Device-local "today" as YYYY-MM-DD — the floor for a new trip's dates. A
  // trip already under way is fine (start ≤ today ≤ end), but one that ended in
  // the past isn't a trip you're about to take.
  const today = todayInTz(DEVICE_TZ, new Date(getNow()));
  const startInPast = Boolean(startDate && startDate < today);
  const endInPast = Boolean(endDate && endDate < today);
  const datesInvalid =
    Boolean(startDate && endDate && endDate < startDate) || startInPast || endInPast;
  const canCreate = Boolean(destination && startDate && endDate && name && !datesInvalid);

  let draftMeta: string = t.shell.newTrip.draftPending;
  if (destination && startDate && endDate && !datesInvalid) {
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / MS_PER_DAY) + 1;
    draftMeta = t.shell.newTrip.draftMeta(destination, days);
  } else if (destination) {
    draftMeta = destination;
  }

  const submit = async () => {
    const parsed = createTripSchema.safeParse({
      name,
      destination,
      startDate,
      endDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      icon,
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

  if (createdTrip) return <Created trip={createdTrip} onDone={() => navigate('/')} />;

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={() => navigate(-1)} aria-label={t.shell.newTrip.back}>
            →
          </button>
          <div className="new-title">{t.shell.newTrip.title}</div>
        </div>
        {offline && (
          <div className="offline-badge">
            {ICONS.offline} {t.header.offlineNow}
          </div>
        )}
      </header>

      <main className="new-body">
        <p className="new-lede">{t.shell.newTrip.lede}</p>

        <div className="field">
          <label htmlFor="dest">{t.shell.newTrip.destLabel}</label>
          <input
            id="dest"
            value={destination}
            placeholder={t.shell.newTrip.destPlaceholder}
            onChange={(e) => {
              setDestination(e.target.value);
              suggest(e.target.value, startDate);
            }}
          />
        </div>

        <div className="field">
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

        <div className="field">
          <label htmlFor="tripName">{t.shell.newTrip.nameLabel}</label>
          <div className="title-row">
            <IconPicker
              icon={icon}
              onChange={(next) => {
                setIcon(next);
                setIconTouched(true);
              }}
              flatClusters={TRIP_ICON_CLUSTERS}
              destinations={DESTINATIONS}
            />
            <input
              id="tripName"
              className="title-input"
              value={name}
              placeholder={t.shell.newTrip.namePlaceholder}
              maxLength={MAX_TRIP_NAME_LENGTH}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value.slice(0, MAX_TRIP_NAME_LENGTH));
              }}
            />
          </div>
          <div className="hint">{t.shell.newTrip.nameHint}</div>
        </div>

        <div className="draft" aria-hidden="true">
          <div className="ic">{icon}</div>
          <div>
            <div className="t">
              {name || <span className="ghost">{t.shell.newTrip.draftGhost}</span>}
            </div>
            <div className="m">{draftMeta}</div>
          </div>
          <span className="tag">{t.shell.newTrip.draftTag}</span>
        </div>

        <div className="new-cta">
          {canCreate && (
            <button className="create-btn" onClick={submit} disabled={offline || submitting}>
              {t.shell.newTrip.createButton}
            </button>
          )}
          {offline && <p className="offline-note">{t.shell.newTrip.offlineNote}</p>}
          <p className="new-note">{t.shell.newTrip.note}</p>
        </div>
      </main>
    </div>
  );
}

type InviteState = { status: 'pending' } | { status: 'ready'; url: string } | { status: 'failed' };

/** Screen 2 (mockup #s-born): the beat right after creation where the invite
 *  link goes in front of the creator. Plan-violet chrome — this is already
 *  inside the new trip, not part of the shell-chrome creation form above. */
function Created({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const showToast = useToast();
  const [invite, setInvite] = useState<InviteState>({ status: 'pending' });

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
    showToast(ICONS.clipboard, t.shell.created.inviteCopied);
  };

  return (
    <div className="app" data-mode="plan">
      <header className="born-head">
        <div className="born-title">{trip.name}</div>
        <span className="mode-pill">{t.shell.created.modePill}</span>
      </header>

      <main className="born-body">
        <div className="born-emoji">{t.shell.created.emoji}</div>
        <h1 className="born-h1">{t.shell.created.title}</h1>
        <p className="born-sub">{t.shell.created.sub}</p>

        <div className="born-card">
          <div className="ic">{trip.icon ?? DEFAULT_TRIP_ICON}</div>
          <div>
            <div className="t">{trip.name}</div>
            <div className="m">{t.shell.newTrip.draftMeta(trip.destination, days)}</div>
          </div>
        </div>

        {invite.status === 'ready' && (
          <div className="invite-box" onClick={copyInvite}>
            <span className="code" dir="ltr">
              {invite.url}
            </span>
            <span className="lbl2">{t.shell.created.inviteLabel}</span>
            <span className="cp">{ICONS.clipboard}</span>
          </div>
        )}
        {invite.status === 'pending' && (
          <p className="born-teach">{t.shell.created.invitePending}</p>
        )}
        {invite.status === 'failed' && <p className="born-teach">{t.shell.created.inviteFailed}</p>}
        {invite.status === 'ready' && <p className="born-teach">{t.shell.created.teach}</p>}

        <div className="born-cta">
          <button className="plan-btn" onClick={onDone}>
            {t.shell.created.planButton}
          </button>
          <button
            className="later-btn"
            onClick={() => {
              showToast(ICONS.done, t.shell.created.laterToast);
              onDone();
            }}
          >
            {t.shell.created.laterButton}
          </button>
        </div>
      </main>
    </div>
  );
}
