// Plan-mode place research (Phase 5, ADR-0115) — the second shell over the shared
// search core ADR-0110 §1 pre-shaped. It lives inside the Map tab's existing
// search overlay: the free half above it filters the trip's own places, this half
// finds places that aren't in the trip yet and puts them on the maybe shelf.
//
// This is the first surface in the app that spends money per keystroke, so the
// Google half is ARMED BY INTENT (ADR-0115 §1): the overlay opens free, and only
// an explicit tap starts feeding the query to `usePlaceSearch`. Once armed the
// behaviour is the picker's, unchanged — min-chars floor, pause-gated debounce,
// one session token, dedup-before-spend — because the hook owns all of it and
// this shell adds no second search path.
import { useEffect, useState } from 'react';
import type { PlacePrediction } from '@waypoint/shared';
import { useVerbs } from '../state/verbs';
import { usePlaceSearch } from '../lib/usePlaceSearch';
import { mapsPredictionUrl } from '../lib/places';
import type { PlaceUsage } from '../lib/place-usage';
import { EmptyState, Skeleton, StatusBanner } from '../ui/feedback';
import { ICONS } from '../constants';
import { t } from '../i18n/he';

export function PlaceResearch({
  /** The overlay's query — one control, two halves (ADR-0115 §1). */
  query,
  /** The place-usage index the tab already derives, so "already in the trip" and
   *  "already on the shelf" cost nothing and read the same rule as the list. */
  usageIndex,
  offline,
}: {
  query: string;
  usageIndex: Map<string, PlaceUsage>;
  offline: boolean;
}) {
  const verbs = useVerbs();
  const search = usePlaceSearch();
  const [armed, setArmed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addFailed, setAddFailed] = useState(false);

  // Arming is expressed by feeding the hook a query — below the min-chars floor
  // it stays inert, so nothing fires until there is something worth searching.
  useEffect(() => {
    if (armed) search.setQuery(query);
  }, [armed, query, search.setQuery]);
  // Closing the overlay retires the session token (the hook mints a fresh one on
  // the next open) — the abandonment half of the session lifecycle, ADR-0110 §1.
  useEffect(() => () => search.reset(), [search.reset]);

  const trimmed = query.trim();
  if (!trimmed) return null;

  if (offline) {
    // No Google, so no affordance — the same rule the near-me chip follows
    // (ADR-0109 §7): when there is nothing to offer, don't offer it.
    return <StatusBanner tone="offline">{t.map.research.offline}</StatusBanner>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="map-arm"
        aria-label={t.map.research.armAria}
        onClick={() => setArmed(true)}
      >
        <span className="map-arm-g" aria-hidden="true" />
        <span className="map-arm-txt">
          <span className="at">{t.map.research.arm}</span>
          <span className="am">{t.map.research.armBody}</span>
        </span>
      </button>
    );
  }

  const add = async (prediction: PlacePrediction) => {
    setBusyId(prediction.googlePlaceId);
    setAddFailed(false);
    try {
      // One pick: enrich-or-link the Place (dedup-before-spend server-side), then
      // reference it from an uncategorised idea — the reference is what makes the
      // place "in the trip" (ADR-0112), so the row below flips state on its own.
      const place = await search.pick(prediction);
      verbs.addMaybe(prediction.primaryText, { placeId: place.id });
    } catch {
      setAddFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="map-research">
      <div className="map-grouphead">{t.map.research.googleGroup}</div>

      {search.rateLimited && <StatusBanner tone="warn">{t.placePicker.rateLimited}</StatusBanner>}
      {(search.failed || addFailed) && (
        <StatusBanner tone="warn">{t.placePicker.failed}</StatusBanner>
      )}

      {search.loading && (
        <div className="map-list">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="block" height={64} className="map-res-skel" />
          ))}
        </div>
      )}

      {/* Armed but still under the min-chars floor: say why nothing is happening,
          rather than leaving a bare header over an empty section. */}
      {!search.active && <p className="map-res-hint">{t.map.research.typeMore}</p>}

      {!search.loading && search.active && search.predictions.length === 0 && !search.failed && (
        <EmptyState icon={ICONS.search} title={t.map.research.noResults} />
      )}

      <div className="map-list">
        {search.predictions.map((prediction) => {
          const inTrip = search.alreadyInTrip(prediction);
          const onShelf = inTrip ? (usageIndex.get(inTrip.id)?.isMaybe ?? false) : false;
          return (
            <ResultRow
              key={prediction.googlePlaceId}
              prediction={prediction}
              inTrip={inTrip != null}
              onShelf={onShelf}
              busy={busyId === prediction.googlePlaceId}
              onAdd={() => void add(prediction)}
            />
          );
        })}
      </div>

      <p className="map-res-foot">{t.placePicker.costFooter}</p>
    </div>
  );
}

// A Google result, in the list's own row grammar (ADR-0115 §7) — but it says only
// what the relay returns: name + secondary address, a neutral "not ours yet"
// badge, and no ★ / distance / category (ADR-0115 §2, none of which a prediction
// carries). The name links out to the Google Maps place so a candidate can be
// vetted for free before we spend on resolving it.
function ResultRow({
  prediction,
  inTrip,
  onShelf,
  busy,
  onAdd,
}: {
  prediction: PlacePrediction;
  /** Something in the trip already references this place: state it, don't re-add. */
  inTrip: boolean;
  /** …and it's an unconsumed idea, so it's already exactly where ＋ אולי would put it. */
  onShelf: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="place result">
      <a
        className="map-res-open"
        href={mapsPredictionUrl(prediction)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="map-badge result" aria-hidden="true">
          📍
        </span>
        <span className="map-main">
          <span className="map-t">
            <span className="map-name">{prediction.primaryText}</span>
          </span>
          {prediction.secondaryText && (
            <span className="map-m">
              <span className="map-tag">{prediction.secondaryText}</span>
            </span>
          )}
        </span>
      </a>
      <span className="map-right">
        {inTrip ? (
          <span className={'map-instate' + (onShelf ? ' shelf' : '')}>
            {onShelf ? t.map.research.onShelf : t.map.research.inTrip}
          </span>
        ) : (
          <button
            type="button"
            className="map-addmaybe"
            disabled={busy}
            aria-label={t.map.research.addAria(prediction.primaryText)}
            onClick={onAdd}
          >
            <span aria-hidden="true">＋</span> {t.map.research.add}
          </button>
        )}
      </span>
    </div>
  );
}
