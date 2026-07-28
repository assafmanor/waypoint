// Google's half of the Map tab's search (Phase 5, ADR-0115) — the rows. The free half
// above it filters the trip's own places; this half finds places that aren't in the trip
// yet and puts them on the maybe shelf.
//
// RE-PARENTED, NOT REWRITTEN (ADR-0131 §8): it used to render inside the Map tab's
// full-screen search overlay, which covered the canvas. It now renders in the SHEET's
// scroll region, in BOTH modes.
//
// AND NOW PRESENTATIONAL (ADR-0132 §7). It used to own the search hook. It cannot any
// more, and the reason is the SKU rather than a preference: Text Search returns results
// **with coordinates**, so the same results are also **rings on the canvas** — and a
// component rendered inside the sheet has no way to hand anything to the canvas. So the
// screen owns the search and the add, and this file renders rows, which is what
// `ui/domain`'s no-state rule would have asked for anyway.
//
// THE ARM IS GONE (ADR-0131 §8a, owner's call). ADR-0115 §1 gated the first paid call
// behind an explicit tap, reasoning that filtering your own list and buying a search
// must not be the same gesture. That was right while the field's default meaning was
// "filter" — but the field now means one thing, "find a place", so an arm asked for a
// distinction the user does not have. The cost controls that remain are the min-chars
// floor (3, ADR-0131 §8b) and the pause-gated debounce — and they carry MORE weight
// since the switch to Text Search, which has no session to bill against (ADR-0132 §7).
import type { PlaceResult } from '@waypoint/shared';
import type { UsePlaceSearch } from '../lib/usePlaceSearch';
import { mapsPredictionUrl } from '../lib/places';
import type { PlaceUsage } from '../lib/place-usage';
import { EmptyState, Skeleton, StatusBanner } from '../ui/feedback';
import { ICONS } from '../constants';
import { t } from '../i18n/he';

export function PlaceResearch({
  /** The screen's live search — one control, two halves (ADR-0115 §1), owned one level
   *  up now that its results are also pins (ADR-0132 §7). */
  search,
  /** The place-usage index the tab already derives, so "already in the trip" and
   *  "already on the shelf" cost nothing and read the same rule as the list. */
  usageIndex,
  offline,
  /** The result currently selected on the canvas — a ring tap selects its row, which is
   *  the pin↔row rule this tab already runs in the other direction (ADR-0132 §8). */
  selectedId,
  /** Which result is mid-add, and whether the last add failed. Both live with the add
   *  itself, in the screen. */
  addingId,
  addFailed,
  onAdd,
}: {
  search: UsePlaceSearch;
  usageIndex: Map<string, PlaceUsage>;
  offline: boolean;
  selectedId: string | null;
  addingId: string | null;
  addFailed: boolean;
  onAdd: (result: PlaceResult) => void;
}) {
  if (offline) {
    // No Google, so no affordance — the same rule the near-me chip follows
    // (ADR-0109 §7): when there is nothing to offer, don't offer it.
    return <StatusBanner tone="offline">{t.map.research.offline}</StatusBanner>;
  }

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

      {/* Still under the min-chars floor: say why nothing is happening, rather than
          leaving a bare header over an empty section. */}
      {!search.active && <p className="map-res-hint">{t.map.research.typeMore}</p>}

      {!search.loading && search.active && search.predictions.length === 0 && !search.failed && (
        <EmptyState icon={ICONS.search} title={t.map.research.noResults} />
      )}

      <div className="map-list">
        {search.predictions.map((result) => {
          const inTrip = search.alreadyInTrip(result);
          const onShelf = inTrip ? (usageIndex.get(inTrip.id)?.isMaybe ?? false) : false;
          return (
            <ResultRow
              key={result.googlePlaceId}
              result={result}
              inTrip={inTrip != null}
              onShelf={onShelf}
              selected={selectedId === result.googlePlaceId}
              busy={addingId === result.googlePlaceId}
              onAdd={() => onAdd(result)}
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
// badge, and no ★ / distance / category (ADR-0115 §2, none of which this field mask
// buys). The name links out to the Google Maps place so a candidate can be vetted for
// free before we spend on resolving it.
//
// `data-result` is how a ring tap finds this row to scroll it into view — the exact
// counterpart of `data-place` on a trip row (ADR-0132 §8).
function ResultRow({
  result,
  inTrip,
  onShelf,
  selected,
  busy,
  onAdd,
}: {
  result: PlaceResult;
  /** Something in the trip already references this place: state it, don't re-add. */
  inTrip: boolean;
  /** …and it's an unconsumed idea, so it's already exactly where ＋ אולי would put it. */
  onShelf: boolean;
  selected: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={'place result' + (selected ? ' selected' : '')}
      data-result={result.googlePlaceId}
    >
      <a
        className="map-res-open"
        href={mapsPredictionUrl(result)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="map-badge result" aria-hidden="true">
          📍
        </span>
        <span className="map-main">
          <span className="map-t">
            <span className="map-name">{result.primaryText}</span>
          </span>
          {result.secondaryText && (
            <span className="map-m">
              <span className="map-tag">{result.secondaryText}</span>
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
            aria-label={t.map.research.addAria(result.primaryText)}
            onClick={onAdd}
          >
            <span aria-hidden="true">＋</span> {t.map.research.add}
          </button>
        )}
      </span>
    </div>
  );
}
