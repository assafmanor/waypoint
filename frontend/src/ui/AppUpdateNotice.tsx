// The app-wide "a new version took over, reload" notice (ADR-0181, ADR-0185).
//
// It is no longer the mechanism, it is the exception. A new build normally
// installs, waits, and swaps itself in at a moment nobody is looking
// (`lib/useAppUpdate.ts`) — this renders only when that could not happen: another
// tab took the swap and left this one running orphaned JS, or an open sheet has
// blocked the quiet path long enough to be worth mentioning. Which is why the
// copy still reads in the past tense and did not need rewriting.
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
  const { noticeVisible, reload, dismiss } = useAppUpdate();
  if (!noticeVisible) return null;
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
