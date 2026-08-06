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
import type { DeliveredImageValue, PlaceResult } from '@waypoint/shared';
import type { UsePlaceSearch } from '../lib/usePlaceSearch';
import { mapsPredictionUrl } from '../lib/places';
import type { PlaceSummary } from '../lib/place-summary';
import { Skeleton, StatusBanner } from '../ui/feedback';
import { KNOWLEDGE_DENSITY, PlaceKnowledge } from '../ui/domain/PlaceKnowledge';
import { DEFAULT_PLACE_ICON } from '../constants';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';

export function PlaceResearch({
  /** The screen's live search — one control, two halves (ADR-0115 §1), owned one level
   *  up now that its results are also pins (ADR-0132 §7). */
  search,
  offline,
  /** The result currently selected on the canvas — a ring tap selects its row, which is
   *  the pin↔row rule this tab already runs in the other direction (ADR-0132 §8). */
  selectedId,
  /** An errand is live, so the verb is CHOOSE rather than shelve (ADR-0134 §3): one place,
   *  assigned to the form that asked, and no `MaybeItem`. */
  chooseMode,
  /** **What we know about the SELECTED result** (ADR-0166 §17) — resolved once by the screen,
   *  which needs the same two values for the canvas card, so one lookup serves both hosts. Only
   *  the selected row can show it, so only the selected row is handed it. */
  selectedKnowledge,
  /** The row was tapped: show me where this is (ADR-0134 §6). The row's body used to be
   *  a link to Google Maps; the tap now means "frame it here" and Google is its own
   *  control, because a link wrapping the whole row cannot coexist with that. */
  onShow,
  /** **And the same tap read again closes it** (ADR-0168 §4). A selected result row opens the
   *  deciding card inside itself, so it owes the way out that the trip's row now owes.
   *  **Absent when the RING is what selected this result**, which is what keeps ADR-0134 §6's
   *  gesture intact: the row's first tap then still frames the place you cannot see, and only
   *  the tap after that closes it. */
  onHide,
  onFullPicture,
  /** Which result is mid-add, and whether the last add failed. Both live with the add
   *  itself, in the screen. */
  addingId,
  addFailed,
  onAdd,
}: {
  search: UsePlaceSearch;
  offline: boolean;
  selectedId: string | null;
  chooseMode: boolean;
  selectedKnowledge?: { image?: DeliveredImageValue; summary?: PlaceSummary };
  addingId: string | null;
  addFailed: boolean;
  onShow: (result: PlaceResult) => void;
  onHide?: () => void;
  onFullPicture?: () => void;
  onAdd: (result: PlaceResult) => void;
}) {
  if (offline) {
    // No Google, so no affordance — the same rule the near-me chip follows
    // (ADR-0109 §7): when there is nothing to offer, don't offer it.
    return <StatusBanner tone="offline">{t.map.research.offline}</StatusBanner>;
  }

  return (
    <div className="map-research">
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

      <div className="map-list">
        {/* A RESULT THE TRIP ALREADY OWNS IS NOT SHOWN HERE AT ALL (session 168). It used to
            render as a row saying `כבר בטיול`, which was the only row for it — the trip half
            had not matched the text Google matched — and the owner's report is what that
            costs: you search for a place you own and the app shows you Google's version of
            it. The trip's own row is now in the list above (`ownedResults` in `Map.tsx`),
            carrying its day, its time, what happens there and the way in to every reference.
            So this half drops it rather than repeating it worse: **one place, one row, and
            it is ours** — the same rule the ring already follows on the canvas (ADR-0132 §6).
            It also removes a duplicate that shipped: a place we own whose name DID match our
            text was listed twice, once as ours and once as Google's. */}
        {search.predictions
          .filter((result) => !search.alreadyInTrip(result))
          .map((result) => (
            <ResultRow
              key={result.googlePlaceId}
              result={result}
              selected={selectedId === result.googlePlaceId}
              chooseMode={chooseMode}
              busy={addingId === result.googlePlaceId}
              image={selectedId === result.googlePlaceId ? selectedKnowledge?.image : undefined}
              summary={selectedId === result.googlePlaceId ? selectedKnowledge?.summary : undefined}
              onShow={(selectedId === result.googlePlaceId && onHide) || (() => onShow(result))}
              onFullPicture={onFullPicture}
              onAdd={() => onAdd(result)}
            />
          ))}
      </div>

      <p className="map-res-foot">{t.placePicker.costFooter}</p>
    </div>
  );
}

// A Google result, in the list's own row grammar (ADR-0115 §7) — but it says only
// what the relay returns: name + secondary address, a neutral "not ours yet"
// badge, and no ★ / distance / category (ADR-0115 §2, none of which this field mask
// buys).
//
// THREE JOBS WHERE THERE WAS ONE (ADR-0134 §5). The body was an `<a>` to Google Maps and
// the only control was `＋ אולי`. The tap now means **show me where this is**, so the body
// is a `<button>` and the way out to Google is its own control — a link wrapping the whole
// row cannot coexist with a tap that means something else. ADR-0115 §2's "vet a candidate
// for free before we spend on it" survives as that control rather than as the row.
//
// `data-result` is how a ring tap finds this row to scroll it into view — the exact
// counterpart of `data-place` on a trip row (ADR-0132 §8).
//
// EXPORTED for the canvas place card (session 166), which is the same reuse `PlaceRow` gets
// in its two hosts: at the map extreme the sheet shows no rows, so a tapped ring surfaces as
// this row over the canvas (ADR-0122 §7). Its body is inert there — `onShow` is absent —
// because framing the place you are already looking at does nothing, which is exactly why
// the trip row's card drops `onSelect` too.
//
// It has no "already in the trip" state any more (session 168) — a result we own is not
// rendered here at all, because the trip's own row is, so there is nothing left for this row
// to say about ownership.
export function ResultRow({
  result,
  selected,
  chooseMode,
  busy,
  image,
  summary,
  onShow,
  onFullPicture,
  onAdd,
}: {
  result: PlaceResult;
  selected: boolean;
  /** The verb is `בחירה`, not `＋ אולי` (ADR-0134 §3). */
  chooseMode: boolean;
  busy: boolean;
  /** **What the world knows about a place nobody has added** (ADR-0166 §17), fetched by the tap
   *  that selected this row. Present only on the selected row — like the trip row's own summary,
   *  and for the same reason: it is the answer to "which of these is the place", so it belongs to
   *  the one being asked about. Absent for the majority of results, which renders as the row that
   *  was always here (ADR-0109 §7). */
  image?: DeliveredImageValue;
  summary?: PlaceSummary;
  /** Frame this result on the canvas. **Absent on the canvas card**, where the body is
   *  inert: there is nowhere for the tap to go, so it renders as content rather than as a
   *  `button` that does nothing. */
  onShow?: () => void;
  /** Open the picture full screen (ADR-0167 §11.1) — the same level below the card the committed
   *  place's hero reaches, since it is the same hero. */
  onFullPicture?: () => void;
  onAdd: () => void;
}) {
  const body = (
    <>
      <span className="map-badge result" aria-hidden="true">
        {DEFAULT_PLACE_ICON}
      </span>
      <span className="map-main">
        {/* Both halves are Google's own strings in whatever script the place has, so
            each sniffs its own direction (ADR-0118) — the secondary text is an address
            and reorders in the RTL flow when it opens with a numeral run. */}
        <span className="map-t">
          <span className="map-name" dir="auto">
            {result.primaryText}
          </span>
        </span>
        {result.secondaryText && (
          <span className="map-m">
            <span className="map-tag" dir="auto">
              {result.secondaryText}
            </span>
          </span>
        )}
      </span>
    </>
  );
  return (
    <div
      className={'place result' + (selected ? ' selected' : '')}
      data-result={result.googlePlaceId}
    >
      {onShow ? (
        <button type="button" className="map-res-open" onClick={onShow}>
          {body}
        </button>
      ) : (
        <span className="map-res-open">{body}</span>
      )}
      <span className="map-right">
        {/* An ICON, not a label: the row already carries one labelled verb, and two
            labelled buttons side by side compete for "which is the action" (ADR-0134 §5 —
            which also records that the width measurement did NOT force this). */}
        <a
          className="map-res-out"
          href={mapsPredictionUrl(result)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.map.research.openInGoogle}
          title={t.map.research.openInGoogle}
        >
          <Icon name="external" />
        </a>
        <button
          type="button"
          className="map-addmaybe"
          disabled={busy}
          aria-label={
            chooseMode
              ? t.map.errand.chooseAria(result.primaryText)
              : t.map.research.addAria(result.primaryText)
          }
          onClick={onAdd}
        >
          {chooseMode ? (
            t.map.errand.choose
          ) : (
            <>
              <Icon name="plus" /> {t.map.research.add}
            </>
          )}
        </button>
      </span>
      {/* **THE DECIDING CARD** (ADR-0167 §9.1, ADR-0166 §17): the picture, its credit and the
          summary, in the one component the committed place's card renders too — `deciding` is the
          density where they get the room they are actually for, because nothing points at this
          place yet, so there are no notes, no references and no `שיבוץ ליום` competing for the
          same pixels. §9.1's inversion, and the whole reason enrichment belongs here most.

          Selection-gated by the caller, and it comes AFTER the row's controls in the DOM for the
          same reason `.map-refs` does: these are full-width lines on a wrapping row, so they
          follow the identity line rather than interrupting it. */}
      <PlaceKnowledge
        density={KNOWLEDGE_DENSITY.DECIDING}
        image={image}
        summary={summary}
        onFullPicture={onFullPicture}
      />
    </div>
  );
}
