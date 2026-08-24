// **The second door** (ADR-0197 §7, place 2): the one moment other than the settings screen
// where asking for notification permission is earned — immediately after a deadline is set on
// a task, which is the moment the want was expressed.
//
// ── THREE THINGS IT DELIBERATELY IS NOT ───────────────────────────────────────────────────
//
// **Not a sheet after the sheet.** Measured in the phase-1b mockup at 169px against this
// banner's 55.7px — ×3 — plus a layer in the back stack (ADR-0090), for an overlay that opens
// on top of the one you are already in.
//
// **Not a banner on the screen you land on afterwards.** A deadline is also set from
// `HostTasks` and `TripHomeTaskBand`, so "the tasks screen" is somewhere the person may never
// go — the ask would arrive a screen late or not at all.
//
// **Not a new component.** `StatusBanner` already takes an `action` and an `onDismiss`, and
// ADR-0181 already recorded why the verb belongs inside the banner rather than beside it. So
// this door costs no infrastructure at all: it is that primitive, with the permission gesture
// wired to its action.
//
// ── AND THE ONE BLOCKER THAT IS NOW ANSWERED RATHER THAN DECLINED ─────────────────────────
//
// `NEEDS_INSTALL` used to return `null` here, with the reason: "a task form is not the place
// to teach somebody to add a web app to their home screen." **That was right about the
// teaching and wrong about the silence** (ADR-0204 §3). Somebody who has just put a deadline
// on a task has just asked to be reminded, and on iOS the true answer is "you cannot be,
// unless this is on your home screen" — so the highest-intent install moment in the product
// was a wall. The teaching still does not happen here: the banner's verb opens `InstallSheet`,
// which is where a gesture can be shown at the size it is performed.
//
// It is deliberately **outside** the install ask budget (ADR-0204 §5), because it only ever
// reaches somebody who has just asked for the thing it enables. It is an answer, not an
// approach. The push ask's OWN "once per install" still governs it, so it cannot repeat.
//
// ── AND WHY IT ANSWERS ITSELF EITHER WAY ──────────────────────────────────────────────────
//
// §7 says "once per install, dismissible, never re-asked". **Both buttons are answers**: a
// dismissal is remembered exactly like an acceptance, because re-asking somebody who said no
// is how a prompt becomes a nag — and a permission prompt refused at the platform level is
// not recoverable in-app on any platform.
import { useState } from 'react';
import { t } from '../i18n/he';
import { useMaybeAuth } from '../state/auth-state';
import {
  PUSH_BLOCKER,
  markPushAskAnswered,
  pushAskAnswered,
  pushBlocker,
  subscribeThisDevice,
} from '../lib/push';
import { StatusBanner } from './feedback/StatusBanner';
import { InstallSheet } from './InstallSheet';

/**
 * `null` unless this install can be asked and has not been.
 *
 * The gate is deliberately narrow, and every clause of it is one of §7's: a keypair on the
 * server, a device that could receive at all, no answer yet from this install, and a deadline
 * actually set — the caller owns that last one, because only it knows.
 */
export function PushAskBanner({
  visible,
}: {
  /** The caller's own condition, and the only thing it has to know: a deadline is on the
   *  draft. Everything else — the server's keypair, the device's capability, whether this
   *  install has already answered — belongs to this component, so a task form does not have
   *  to learn what VAPID is. */
  visible: boolean;
}) {
  // `useMaybeAuth`, not `useAuth`: no session means nothing to offer, and a form rendered
  // without a provider (which its own tests do) must not crash on a banner it cannot show.
  const vapidPublicKey = useMaybeAuth()?.me?.push?.vapidPublicKey ?? null;
  // Read once, at mount, so answering it inside this sheet does not make the banner vanish
  // mid-interaction and reflow the form under the user's finger.
  const [answered, setAnswered] = useState(pushAskAnswered);
  const [busy, setBusy] = useState(false);

  if (!visible || answered) return null;
  const blocker = pushBlocker(vapidPublicKey);
  // `NEEDS_INSTALL` is the one blocker with a cure the user can perform, so it gets an
  // answer instead of a silence (ADR-0204 §3). Every other blocker still means no ask:
  // `DENIED` is not recoverable in-app, `UNSUPPORTED` has no cure, and `SERVER` is not
  // about this device at all.
  const needsInstall = blocker === PUSH_BLOCKER.NEEDS_INSTALL;
  if (blocker !== null && !needsInstall) return null;

  const enable = () => {
    setBusy(true);
    // Answered the moment it is taken, not when it succeeds: a person who pressed this has
    // answered, and a platform refusal is not something to ask about again.
    markPushAskAnswered();
    void subscribeThisDevice(vapidPublicKey!)
      .catch(() => {})
      .finally(() => {
        setBusy(false);
        setAnswered(true);
      });
  };

  const dismiss = () => {
    markPushAskAnswered();
    setAnswered(true);
  };

  if (needsInstall) return <InstallOffer onAnswered={dismiss} />;

  return (
    <StatusBanner
      tone="neutral"
      action={{ label: t.tasks.sheet.notifyAsk.action, onClick: enable }}
      onDismiss={busy ? undefined : dismiss}
    >
      {t.tasks.sheet.notifyAsk.text}
    </StatusBanner>
  );
}

/**
 * Door C (ADR-0204 §3): the same banner, with the verb that actually helps.
 *
 * The copy names what was just asked for rather than the app, because the person did not ask
 * for an app — they asked to be reminded. And the verb is `איך` rather than `התקנה`, because
 * on the platform this appears on nothing can install: the sheet teaches.
 *
 * It answers the PUSH ask when it is dismissed or the sheet is closed, so this install's push
 * ask is spent either way — which is what stops the same wall being re-shown on the next
 * deadline. It does not touch the install budget; see the header.
 */
function InstallOffer({ onAnswered }: { onAnswered: () => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <StatusBanner
        tone="neutral"
        action={{ label: t.install.blocked.action, onClick: () => setSheetOpen(true) }}
        onDismiss={onAnswered}
      >
        {t.install.blocked.text}
      </StatusBanner>
      {sheetOpen && (
        <InstallSheet
          onClose={() => {
            setSheetOpen(false);
            onAnswered();
          }}
        />
      )}
    </>
  );
}
