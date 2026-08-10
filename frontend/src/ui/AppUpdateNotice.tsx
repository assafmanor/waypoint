// The app-wide "a new version took over, reload" notice (ADR-0181, F-13).
//
// Deliberately NOT in `ui/feedback/` despite being a feedback surface: that
// directory's barrel is imported by lazy route chunks, and this file pulls in the
// PWA registration virtual module (which dynamically imports workbox-window).
// It renders `StatusBanner` rather than a banner of its own (ADR-0078).
//
// It mounts at the app root, beside `TripHandoffLayer`, because `AppShell` frames
// only the in-trip surfaces — /trips, /settings and the join flow are outside it —
// and a build swap is not a fact about the screen you happen to be on. `.app-update`
// (App.css) is a mount, not a second banner: all of the look is `.fb-banner`'s.
import { StatusBanner } from './feedback';
import { useAppUpdate } from '../lib/useAppUpdate';
import { t } from '../i18n/he';

export function AppUpdateNotice() {
  const { updateReady, reload, dismiss } = useAppUpdate();
  if (!updateReady) return null;
  return (
    <div className="app-update">
      {/* `neutral`, not `warn`: nothing is wrong, and nothing failed. */}
      <StatusBanner
        tone="neutral"
        action={{ label: t.feedback.update.action, onClick: reload }}
        onDismiss={dismiss}
      >
        {t.feedback.update.message}
      </StatusBanner>
    </div>
  );
}
