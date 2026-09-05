// **WHAT THE WORLD KNOWS ABOUT A PLACE — one presentation, three densities** (ADR-0167 §11.1's
// _"one presentation, not two"_, ADR-0166 §17).
//
// The picture, its credit and the summary are the same three blocks wherever a place is shown, and
// they now have **two hosts that are different components**: `PlaceRow` (a place the trip holds)
// and `ResultRow` (a Google result nobody has added). §11.1 kept the collapsed and expanded place
// cards as one component because the collapsed card is a collapse of the expanded one — the same
// argument applies across the two rows, and rule 8 is explicit that the answer is to extract the
// existing one-off rather than to copy it beside itself.
//
// It renders a **FRAGMENT**, deliberately. Each block is a child of the row's own layout — a
// wrapping flex line in the list, a grid row in the bounded card — so a wrapper element here would
// take their place in it and the blocks would lose the full-width line the row grants them. The
// mockup makes the same point in its own stylesheet: _"the span belongs to the host, not the
// text."_
//
// The three densities are the app's existing grammar for this (`SettleControl`'s
// prompt/sheet/compact, `Modal`'s wrappers), and the words, the hues and the clamp are not a
// host's to re-choose:
//
//  - **`collapsed`** — a committed place's selected row: the summary, two lines, and `עוד ›`. No
//    hero, because the badge already carries the photograph at zero cost and 130px of picture is
//    the least valuable block on a capped card (§9.4).
//  - **`expanded`** — the same place, looked at as a subject: hero, credit, and the whole summary.
//  - **`deciding`** — a place nobody has added: hero, credit, and the summary at the mockup's own
//    three lines. No `עוד ›` and no expansion, because there is nothing to swap off — the deciding
//    card has no notes, no references and no schedule action, which is the whole of §9.1's
//    inversion ("the fields that matter most when you are choosing are the ones that matter least
//    once you have chosen").
import { placeCredit, type DeliveredImageValue } from '@waypoint/shared';
import { t } from '../../i18n/he';
import { apiAssetUrl } from '../../lib/api-asset';
import { type PlaceSummary } from '../../lib/place-summary';
import { useFailableImage } from '../../lib/useFailableImage';
import { Icon } from '../Icon';
import './place-knowledge.css';

/** How much room this place's enrichment gets — the host's state, not this block's choice. */
export const KNOWLEDGE_DENSITY = {
  /** A committed place's selected row: two clamped lines and the way in. */
  COLLAPSED: 'collapsed',
  /** The research card: the whole summary, with the picture above it. */
  EXPANDED: 'expanded',
  /** A place you have not added: the picture and three lines, with nothing to expand into. */
  DECIDING: 'deciding',
} as const;

export type KnowledgeDensity = (typeof KNOWLEDGE_DENSITY)[keyof typeof KNOWLEDGE_DENSITY];

export function PlaceKnowledge({
  density,
  image,
  summary,
  onExpand,
  onFullPicture,
}: {
  density: KnowledgeDensity;
  /** The photograph, for the hero and the credit line it obliges (§4). */
  image?: DeliveredImageValue;
  /** Already resolved by `placeSummary` — which language a reader gets, and the one word that
   *  marks it when it is not ours (§5). */
  summary?: PlaceSummary;
  /** `עוד ›`, the way into the mode change. `collapsed` only; absent means no way in, which is
   *  what an unselected or unexpandable row passes. */
  onExpand?: () => void;
  /** Open the full picture (§11.1: the preview is the level below, reached from the hero). Owned
   *  by the screen, because the viewer is a portal. */
  onFullPicture?: () => void;
}) {
  const wantsHero = density !== KNOWLEDGE_DENSITY.COLLAPSED && !!image;
  // Through the shared failable-image hook, so a blob a refresh replaced degrades to no picture
  // rather than to a broken one — the same answer the badge gets.
  const { src: heroUrl, onError: heroFailed } = useFailableImage(
    wantsHero && image ? apiAssetUrl(image.url) : undefined,
  );

  // **Nothing known renders nothing at all** (ADR-0109 §7), which is the majority case: 0 of 7
  // Tokyo restaurants had an image (ADR-0166 §11.3). An image with no summary still counts on the
  // surfaces with a hero — the picture is exactly what there is to show.
  if (!image && !summary) return null;

  // The block holds the prose, and on the collapsed row it also holds the way in — which is what
  // keeps a picture reachable on a place we have an image for and no words about.
  const showsSummaryBlock = !!summary || (density === KNOWLEDGE_DENSITY.COLLAPSED && !!onExpand);
  // Only the collapsed state has somewhere to go: the expanded card is already there, and the
  // deciding card has nothing to expand into.
  const opensOnTap = density === KNOWLEDGE_DENSITY.COLLAPSED && !!onExpand;

  return (
    <>
      {/* A button rather than a tappable div, so the picture is reachable and named — the image
          itself says nothing. */}
      {heroUrl && (
        <button
          type="button"
          className="map-hero"
          aria-label={t.map.know.fullPicture}
          onClick={(e) => {
            e.stopPropagation();
            onFullPicture?.();
          }}
        >
          <img src={heroUrl} alt="" loading="lazy" decoding="async" onError={heroFailed} />
        </button>
      )}
      {/* **Under the picture, never over it** (§4): an overlay fights whatever is behind it and
          has to be re-solved for dark mode. Absent with the picture — a credit for an image that
          failed to load credits nothing. */}
      {heroUrl && image && <span className="map-credit">{placeCredit(image)}</span>}
      {showsSummaryBlock && (
        // **THE WHOLE BLOCK OPENS THE CARD** (owner, 2026-08-05: _"I would like clicking on the
        // summary to also expand, not only when clicking on עוד"_). The clamped text is the thing
        // you are trying to read, so it is the natural target — `עוד ›` stays as the block's
        // NAMED, focusable control (the tap target grows; the accessible control does not move,
        // and a second `role="button"` around it would nest one interactive element in another).
        //
        // `stopPropagation` for the reason every other control on this row does it: the row's own
        // tap re-selects the place, which re-frames the camera and scrolls the list under you.
        <span
          className={SUMMARY_CLASS[density]}
          onClick={
            opensOnTap
              ? (e) => {
                  e.stopPropagation();
                  onExpand?.();
                }
              : undefined
          }
        >
          {/* Inline before the prose and a SIBLING of it, not inside it: `dir="auto"` sniffs the
              first strong character, so a Hebrew chip inside the prose element would make an
              English extract read as RTL — and the clamp needs an element whose content is text,
              since `-webkit-box` lays ELEMENT children out as boxes. */}
          {summary?.marker && <span className="map-tag map-sum-lang">{summary.marker}</span>}
          {summary && (
            <span className="map-sum-t" dir="auto" lang={summary.lang}>
              {summary.text}
            </span>
          )}
          {/* **The way in to the mode change**, and only where there is a mode to change into.
              The clamp hides text by design, so without this the rest of a summary would be
              unreachable — which is why it sits inside the block rather than in the footer with
              the verbs. */}
          {opensOnTap && (
            <button
              type="button"
              className="map-know-more"
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
            >
              {t.map.know.more}
              <Icon name="caret" dir="left" />
            </button>
          )}
        </span>
      )}
    </>
  );
}

/** The clamp is a **state of the block**, expressed as one class per density rather than as
 *  sibling modifier classes — ADR-0167 §9's closing note is a warning from this exact code: a
 *  later-declared 3-line rule silently won a specificity tie and rendered three lines where two
 *  were measured, so each state's clamp is written on its own compound selector in `map.css`. */
const SUMMARY_CLASS = {
  [KNOWLEDGE_DENSITY.COLLAPSED]: 'map-sum',
  [KNOWLEDGE_DENSITY.EXPANDED]: 'map-sum is-open',
  [KNOWLEDGE_DENSITY.DECIDING]: 'map-sum is-decide',
} as const satisfies Record<KnowledgeDensity, string>;
