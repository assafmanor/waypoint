// **THE WAY FROM AN OPEN DAY CARD INTO THE READ** (ADR-0229 §2).
//
// Trip mode's row opens what you DO; this is the one thing in that panel that is about
// KNOWING, and it shows rather than only points — which is the whole of the second design
// round (owner: _"let's be more creative in how we display the information"_).
//
// Two shapes, and which one you get is a fact about the place rather than a choice:
//
//  - **The place has a photograph** → a `PhotoBand` at `card` density, the picture with the
//    address and its credit over the scrim, and a pill saying where the tap goes. The whole
//    band is the button.
//  - **It has none** → one line, at the ⁦44px⁩ touch floor. Most places have none (ADR-0166
//    §11.3: 0 of 7 Tokyo restaurants had an image), and a band with no picture is a grey box,
//    which is worse than a sentence.
//
// **The label is the destination's name, not a generic word.** A booked row opens
// `BookingDetail` and says `להזמנה` — the lifted hero's own string, because it is the same
// journey one surface over; an unbooked one opens `EventDetail` and says `פרטים`. The label is
// what tells you whether the tap gets you the confirmation code.
//
// Presentational, `ui/domain/`: the screen resolves the place, the photograph and the booking
// and passes the answers. It knows nothing about trips.
import { type DeliveredImageValue } from '@waypoint/shared';
import { placeCredit } from '@waypoint/shared';
import { apiAssetUrl } from '../../lib/api-asset';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import { BAND_DENSITY, PhotoBand } from './PhotoBand';
import './read-band.css';

export function ReadBand({
  image,
  address,
  title,
  booked,
  onOpen,
}: {
  /** The place's photograph, or absent for the line. Comes from the same `enrichments` entry
   *  the badge already reads, so the band and the 40px square cannot show different places. */
  image?: DeliveredImageValue;
  /** The one fact the row above cannot say. Absent on a placeless event, and then the line
   *  carries the label alone rather than an empty second row. */
  address?: string;
  /** What the picture is OF, for the caption and the `alt` — the place's name, falling back to
   *  the event's own title. `PhotoBand` requires it: an unlabelled photograph says nothing. */
  title: string;
  /** Does this event carry a booking? Decides the label and, at the host, which read opens. */
  booked: boolean;
  onOpen: () => void;
}) {
  const label = booked ? t.hero.toBooking : t.day.read.details;
  const go = (
    <>
      <Icon name={booked ? 'ticket' : 'eye'} /> {label}
      {/* **`caret` rotated, not `NavArrow`.** `.map-know-more` already means "through to another
          card" with exactly this glyph; `NavArrow` is the app's BACK/route arrow, and drawing a
          second way-in glyph is how a surface grows a second grammar. */}
      <Icon name="caret" dir="left" />
    </>
  );

  if (!image) {
    return (
      <button type="button" className="rd-line" onClick={onOpen}>
        <span className="rd-line-main">
          <span className="rd-t">{label}</span>
          {address && (
            <span className="rd-sub" dir="auto">
              {address}
            </span>
          )}
        </span>
        <span className="rd-line-go" aria-hidden="true">
          <Icon name="caret" dir="left" />
        </span>
      </button>
    );
  }

  return (
    <button type="button" className="rd-band" onClick={onOpen}>
      {/* `interactive={false}`: this band IS the button, and `PhotoBand`'s own control would be
          a button inside a button — invalid HTML, and the same reason its caption is an overlay
          rather than a target. The full picture stays reachable one level further in, from the
          read's own hero (ADR-0167 §10). */}
      <PhotoBand
        density={BAND_DENSITY.CARD}
        interactive={false}
        shot={{
          url: apiAssetUrl(image.url),
          // The address is what this band is worth showing; the place's name is already the
          // card's title one element up, so repeating it here would spend the line twice.
          of: address ?? title,
          credit: placeCredit(image),
        }}
      />
      {/* A span, not a button, for the reason above. It is decoration over a control that is
          already named by its own accessible text, so it is hidden from the tree. */}
      <span className="rd-go" aria-hidden="true">
        {go}
      </span>
    </button>
  );
}
