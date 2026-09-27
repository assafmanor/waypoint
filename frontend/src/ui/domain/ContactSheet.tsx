// **THE DAYS AS A CONTACT SHEET** — the memory Home's second section (ADR-0240 §4).
//
// Two columns of day frames, each a picture over its date, its name and the glyphs of what
// happened. A day with no picture keeps the frame: its date numeral is stamped on the archive's
// wash where the picture would be, so the sheet's frames line up. Each frame opens its day.
//
// Presentational, `ui/domain/`: the days arrive chosen and composed by the screen.
import { autoIsolate } from '../../lib/bidi';
import type { ContactSheetDay } from '../../lib/memory-home';
import { BAND_DENSITY, PhotoBand } from './PhotoBand';
import './contact-sheet.css';

export function ContactSheet({
  days,
  onOpen,
}: {
  days: readonly ContactSheetDay[];
  onOpen: (date: string) => void;
}) {
  return (
    <div className="mem-sheet">
      {days.map((day) => (
        <button key={day.date} type="button" className="mem-day" onClick={() => onOpen(day.date)}>
          {day.shot ? (
            <PhotoBand shot={day.shot} density={BAND_DENSITY.THUMB} interactive={false} />
          ) : (
            <span className="mem-day-stamp" aria-hidden="true">
              {day.numeral}
            </span>
          )}
          <span className="mem-day-copy">
            <span className="mem-day-when">{day.when}</span>
            <span className="mem-day-name">{autoIsolate(day.name)}</span>
            {day.glyphs.length > 0 && (
              <span className="mem-day-marks" aria-hidden="true">
                {day.glyphs.join(' ')}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
