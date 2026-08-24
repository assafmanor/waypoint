// "Put this on your home screen", the surface that explains it (ADR-0204 §4).
//
// ── WHAT IS AND IS NOT THIS COMPONENT'S ───────────────────────────────────────────────────
//
// It is `Sheet` — `Modal`'s `sheet` variant, so the backdrop, Escape, the back-stack entry
// and the exit animation all arrive by existing (ADR-0079/0090). It is NOT a floating panel
// of its own; that is lint-blocked, and a bespoke overlay would break the one-back-action
// invariant.
//
// `ariaLabel` rather than `title`, which is `RosterSheet`'s shape and not an omission: a
// visible `.modal-title` would say "Travelive על מסך הבית" directly above a head that says
// "Travelive", and the mockup's first render made that duplication obvious.
//
// ── THE ONE THING THAT VARIES ─────────────────────────────────────────────────────────────
//
// Only the BODY changes per platform, and each of the three is a different kind of thing:
//
//   • `PROMPT`  — a real button. The captured `beforeinstallprompt` is fired from this tap,
//                 which is the entire reason `lib/install.ts` captures it at app root.
//   • `TEACH`   — there is no API on WebKit, so this teaches the gesture, and its button
//                 CANNOT pretend to install: it reads הבנתי and closes. A button that
//                 claimed to install here would be the worst outcome on the file.
//   • `IN_APP`  — installing is impossible from an embedded browser on every platform, so
//                 the only useful move is out. Not an edge case: joins are link-only
//                 (ADR-0030), links travel in chats, and chats open their own webview.
//
// The share glyph is our own `upload` (an arrow out of a tray, the nearest shape we own).
// **The words are what identify the menu item** — ״הוספה למסך הבית״ — exactly as the
// existing `notifyNeedsInstall` sentence already does. We do not redraw Apple's mark.
import { useState } from 'react';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { AppMark } from './AppMark';
import { INSTALL_PATH, type InstallPath, fireInstallPrompt, installPath } from '../lib/install';
import { t } from '../i18n/he';
import './install.css';

export function InstallSheet({ onClose, path }: { onClose: () => void; path?: InstallPath }) {
  // Resolved once at mount, not per render: firing the prompt clears it, and a body that
  // changed shape underneath the finger that pressed it is the wrong kind of surprise.
  const [resolved] = useState<InstallPath>(() => path ?? installPath());

  return (
    <Sheet ariaLabel={t.install.sheet.title} onClose={onClose}>
      <div className="inst-head">
        <AppMark className="inst-mark" />
        <div>
          <div className="inst-name">Travelive</div>
          <div className="inst-sub">{t.install.sheet.sub}</div>
        </div>
      </div>
      {resolved === INSTALL_PATH.IN_APP ? (
        <InAppBody onClose={onClose} />
      ) : (
        <>
          <WhyList />
          {resolved === INSTALL_PATH.TEACH ? <TeachBody onClose={onClose} /> : null}
          {resolved === INSTALL_PATH.PROMPT ? <PromptBody onClose={onClose} /> : null}
        </>
      )}
    </Sheet>
  );
}

/** The three reasons, in the order they become true on a trip. Every glyph is neutral:
 *  installing is not a time fact, not a place fact and not plan mode, so it spends none of
 *  ADR-0028's semantic budget. */
function WhyList() {
  return (
    <div className="inst-why">
      <div className="inst-why-row">
        <Icon name="offline" />
        <span>{t.install.sheet.whyOffline}</span>
      </div>
      <div className="inst-why-row">
        <Icon name="clock" />
        <span>{t.install.sheet.whyNotify}</span>
      </div>
      <div className="inst-why-row">
        <Icon name="home" />
        <span>{t.install.sheet.whyHome}</span>
      </div>
    </div>
  );
}

function PromptBody({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const install = () => {
    setBusy(true);
    // Closed whatever the outcome. An accepted install makes this sheet meaningless, and a
    // dismissal was the platform's own prompt being answered — re-asking inside our sheet
    // would be a second ask the budget never authorised.
    void fireInstallPrompt().finally(onClose);
  };
  return (
    <>
      <button type="button" className="inst-do" onClick={install} disabled={busy}>
        {t.install.sheet.doInstall}
      </button>
      <div className="inst-note">{t.install.sheet.note}</div>
    </>
  );
}

function TeachBody({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="inst-steps">
        <div className="inst-step">
          <span className="inst-step-n">1</span>
          <span className="inst-step-text">{t.install.sheet.stepShare}</span>
          <span className="inst-glyph" aria-hidden="true">
            <Icon name="upload" />
          </span>
        </div>
        <div className="inst-step">
          <span className="inst-step-n">2</span>
          <span className="inst-step-text">{t.install.sheet.stepAdd}</span>
          <span className="inst-glyph" aria-hidden="true">
            <Icon name="plus" />
          </span>
        </div>
      </div>
      {/* Quiet, because it does not install — it acknowledges. A filled primary here would
          promise the one thing this platform cannot give. */}
      <button type="button" className="inst-do" data-quiet="true" onClick={onClose}>
        {t.install.sheet.doGot}
      </button>
    </>
  );
}

function InAppBody({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // No "open in browser" button: no platform exposes a way to hand a URL to the default
  // browser from inside someone else's webview, and a button that silently did nothing is
  // worse than the instruction. Copying the link is the thing that actually works.
  const copy = () => {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => setCopied(true))
      .catch(() => {
        // A refused clipboard leaves the sentence above, which is still followable by hand.
      });
  };
  return (
    <>
      <div className="inst-why">
        <div className="inst-why-row">
          <Icon name="external" />
          <span>{t.install.sheet.inAppTitle}</span>
        </div>
      </div>
      <p className="inst-body">{t.install.sheet.inAppBody}</p>
      <button type="button" className="inst-do" onClick={copy}>
        {copied ? t.install.sheet.inAppCopied : t.install.sheet.inAppCopy}
      </button>
      <button type="button" className="inst-alt" onClick={onClose}>
        {t.install.sheet.doGot}
      </button>
    </>
  );
}
