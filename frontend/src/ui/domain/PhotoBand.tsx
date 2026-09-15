// **A PHOTOGRAPH AS A BAND, WITH ITS CREDIT ON IT** — one component, two densities
// (ADR-0229 §2).
//
// Extracted from `DayHead`'s own `Shot`, which was the single call site doing almost exactly
// this job. Root rule 8 is explicit that the answer to a second need is to generalise the
// existing one-off rather than to set a second one beside it — and the read band ADR-0229 adds
// to the day card is the same object at a different height: a picture you can tap, a scrim, a
// line saying what it is and a line crediting it.
//
// **The credit is structural, not decoration** (ADR-0166 §12.2: 27 of the 32 Commons files
// surveyed require attribution), which is why it is part of the band rather than something a
// host may leave out. ADR-0219 §6's rule for where it goes — on the photograph, under a scrim,
// when the picture is a band with nothing under it — is what both densities implement.
//
// Presentational, `ui/domain/`: every value arrives composed and isolated by the caller.
import { autoIsolate } from '../../lib/bidi';
import { t } from '../../i18n/he';
import './photo-band.css';

/** How much room the picture gets. The host's state, not this block's choice — the same
 *  grammar `SettleControl`, `PlaceKnowledge` and `Modal` already use for this question. */
export const BAND_DENSITY = {
  /** The day's own head, first thing on the screen (ADR-0219 §3's one number). */
  DAY: 'day',
  /** Inside an opened event card, mid-list. Shorter, because rows follow it and ⁦116px⁩ here
   *  pushes them below the fold — measured in `the-read-in-trip-mode-v2.html` §2. */
  CARD: 'card',
} as const;

export type BandDensity = (typeof BAND_DENSITY)[keyof typeof BAND_DENSITY];

export interface PhotoBandShot {
  /** Ready to render — the caller has already been through `apiAssetUrl` where it needs to. */
  url: string;
  /** What this is a picture OF, **raw**. An unlabelled photo of a waterfall on a day with four
   *  of them says nothing. Isolated for the caption here and passed to `alt` unisolated, which
   *  is the split the reader drew: bidi controls in alt text are read aloud. */
  of: string;
  /** `attribution · license`, composed by `@waypoint/shared`'s `placeCredit` — raw, isolated
   *  for the caption here. */
  credit: string;
  /** Open the full picture (ADR-0167 §10's viewer), which the screen owns. Absent → the picture
   *  is inert, which is the reader's answer: it has no app to open into. */
  onOpen?: () => void;
  /** **The day's shot is the first thing on the page, so it is fetched eagerly** (ADR-0219 §3).
   *  The reader's is one of twelve below the fold, and the read band's is inside a card nobody
   *  has opened yet — both stay lazy. */
  eager?: boolean;
}

/**
 * The band, and the one structural decision in it: **the button holds the image, the caption
 * sits over it.** A `<figcaption>` inside a `<button>` is invalid HTML (a button's content
 * model is phrasing content), and the caption is not the tap target anyway — so the figure
 * stays a figure, the picture is the control, and the caption is a non-interactive overlay the
 * tap passes straight through (`pointer-events: none`, `photo-band.css`).
 *
 * `interactive: false` renders the picture with no control of its own, for a host that is
 * itself the button — the read band is one, since there the whole band opens the read and a
 * nested button would be invalid for the same reason the caption is not one.
 */
export function PhotoBand({
  shot,
  density = BAND_DENSITY.DAY,
  interactive = true,
  className,
}: {
  shot: PhotoBandShot;
  density?: BandDensity;
  interactive?: boolean;
  className?: string;
}) {
  const img = (
    <img src={shot.url} alt={shot.of} loading={shot.eager ? 'eager' : 'lazy'} decoding="async" />
  );
  return (
    <figure
      className={`wp-photoband${density === BAND_DENSITY.CARD ? ' is-card' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      {interactive && shot.onOpen ? (
        <button type="button" aria-label={t.map.know.fullPicture} onClick={shot.onOpen}>
          {img}
        </button>
      ) : (
        img
      )}
      {/* **On the photograph, under a scrim** (ADR-0167 §4's second half, ADR-0219 §6): the
          picture is a band with nothing beneath it, so a line under it would cost ~16px on a
          head already 194px tall, and the scrim is black over the picture in both themes. */}
      <figcaption>
        <strong>{autoIsolate(shot.of)}</strong>
        <span>{autoIsolate(shot.credit)}</span>
      </figcaption>
    </figure>
  );
}
