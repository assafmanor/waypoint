// BootScreen — tier 3 of the loading language (ADR-0105): the loud "board
// power-on", the one full-screen loading surface the app is allowed (the
// board is rationed — design-language "The board is rationed"). Shown before
// any trip context exists (auth check, route-chunk fetch, trips-list load),
// so it is deliberately THEME-aware only, never MODE-aware: mode is derived
// from a trip this screen hasn't loaded yet (ADR-0016/0040, ADR-0105). The
// glow RAMPS as a warm-up — distinct from the reserved live pulse
// (`wp-board-pulse`, design-language "Pulse means live") — a boot is never
// claiming to be live this minute. Colors read only tokens, so the block
// stays remap-ready for the dark boot (designed in ADR-0105, not wired here).
import { formatTime } from '../../lib/time';
import { useClock } from '../../lib/useClock';
import { DEVICE_TIMEZONE, DOT_SEPARATOR } from '../../constants';
import { t } from '../../i18n/he';

const DOTS = [DOT_SEPARATOR, DOT_SEPARATOR, DOT_SEPARATOR].join(' ');

export function BootScreen() {
  const now = useClock();
  const clock = formatTime(now, DEVICE_TIMEZONE);
  return (
    <div className="fb-boot" role="status" aria-live="polite" aria-label={t.shell.booting}>
      <div className="fb-boot-mark" aria-hidden="true">
        <div className="fb-boot-clock" dir="ltr">
          {clock}
        </div>
        <div className="fb-boot-dots" dir="ltr">
          {DOTS}
        </div>
      </div>
      <div className="fb-boot-label" aria-hidden="true">
        {t.shell.booting}
      </div>
      <div className="fb-boot-track" aria-hidden="true">
        <div className="fb-boot-seg" />
      </div>
    </div>
  );
}
