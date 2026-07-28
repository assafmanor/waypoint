// Google's half of the Map tab's search (Phase 5, ADR-0115) — the second shell over
// the shared search core ADR-0110 §1 pre-shaped. The free half above it filters the
// trip's own places; this half finds places that aren't in the trip yet and puts them
// on the maybe shelf.
//
// RE-PARENTED, NOT REWRITTEN (ADR-0131 §8): it used to render inside the Map tab's
// full-screen search overlay, which covered the canvas. It now renders in the SHEET's
// scroll region, in BOTH modes, and needed no change to move — it only ever took
// `query`/`usageIndex`/`offline`. It belongs in the sheet rather than on the canvas for a
// fact rather than a preference: an Autocomplete prediction carries NO coordinates until
// the pick (ADR-0115 §2), so there is nothing to draw.
//
// THE ARM IS GONE (ADR-0131 §8a, owner's call). ADR-0115 §1 gated the first paid call
// behind an explicit tap, reasoning that filtering your own list and buying an
// Autocomplete session must not be the same gesture. That was right while the field's
// default meaning was "filter" — but the field now means one thing, "find a place", so an
// arm asked for a distinction the user does not have. (The in-form picker has never had
// one, for exactly that reason.) The cost controls that remain are all the hook's: the
// min-chars floor — raised 2 → 3 by §8b, and now the thing standing between a keystroke
// and a paid call — the pause-gated debounce, one session token, and dedup-before-spend.
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
  /** The row's query — one control, two halves (ADR-0115 §1), which is true of a surface
   *  with a map on it for the first time (ADR-0131 §8). */
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addFailed, setAddFailed] = useState(false);

  // The query goes straight to the hook, which is inert below the min-chars floor — so
  // the floor, not an arm, is what stops a one- or two-character query from firing.
  //
  // It is handed on only once it is non-blank, which keeps "nothing typed → nothing
  // reaches the paid core" a property of THIS component rather than of whoever renders
  // it. The hook would ignore whitespace anyway (it trims before the floor), so this is
  // about not asserting an intent we do not have: the screen only mounts this while a
  // query is live, and a component that quietly hands its collaborator input it has
  // itself decided to ignore is the kind of thing that stops being harmless later.
  const trimmed = query.trim();
  useEffect(() => {
    search.setQuery(trimmed ? query : '');
  }, [query, trimmed, search.setQuery]);
  // Unmounting retires the session token (the hook mints a fresh one next time) — the
  // abandonment half of the session lifecycle, ADR-0110 §1. This renders only while a
  // query is live, so closing the row's field is what unmounts it: the session is per
  // SEARCH SESSION exactly as it was per overlay.
  useEffect(() => () => search.reset(), [search.reset]);

  if (!trimmed) return null;

  if (offline) {
    // No Google, so no affordance — the same rule the near-me chip follows
    // (ADR-0109 §7): when there is nothing to offer, don't offer it.
    return <StatusBanner tone="offline">{t.map.research.offline}</StatusBanner>;
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
