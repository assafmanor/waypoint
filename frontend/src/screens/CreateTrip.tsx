// Trip creation /new (ADR-0032): three inputs — destination → dates → name
// (auto-suggested) — everything else derived or deferred. Shell surface
// (ADR-0024): indigo/neutral chrome, no amber/teal/violet. The draft preview
// renders in the soft grammar (dashed, provisional) and turns solid only
// after landing inside the created trip. Design reference: mockups/create-trip-v1.html.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTripSchema } from '@waypoint/shared';
import { useIsOffline } from '../lib/outbox';
import { useActiveTripId } from '../state/active-trip-id';
import { createTrip } from '../lib/api';
import { suggestTripName } from '../lib/trip-name';
import { MS_PER_DAY, ICONS } from '../constants';
import { t } from '../i18n/he';

export function CreateTrip() {
  const navigate = useNavigate();
  const { setTripId } = useActiveTripId();
  const offline = useIsOffline();

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const suggest = (dest: string, start: string) => {
    if (!nameTouched) setName(suggestTripName(dest, start));
  };

  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);
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
    });
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      const trip = await createTrip(parsed.data);
      setTripId(trip.id);
      // TODO(T-044): post-create invite prompt (mockup screen 2) once the
      // invite endpoint is wired into lib/api.ts.
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  };

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
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                suggest(destination, e.target.value);
              }}
            />
            <input
              type="date"
              value={endDate}
              className={datesInvalid ? 'invalid' : ''}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {datesInvalid && <div className="field-error">{t.shell.newTrip.dateError}</div>}
        </div>

        <div className="field">
          <label htmlFor="tripName">{t.shell.newTrip.nameLabel}</label>
          <input
            id="tripName"
            value={name}
            placeholder={t.shell.newTrip.namePlaceholder}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
          <div className="hint">{t.shell.newTrip.nameHint}</div>
        </div>

        <div className="draft" aria-hidden="true">
          <div className="ic">✈️</div>
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
