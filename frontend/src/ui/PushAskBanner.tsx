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
  markPushAskAnswered,
  pushAskAnswered,
  pushBlocker,
  subscribeThisDevice,
} from '../lib/push';
import { StatusBanner } from './feedback/StatusBanner';

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

  // A blocker of any kind means no ask. Notably including `NEEDS_INSTALL`: the settings
  // section explains how to fix that, and a task form is not the place to teach somebody to
  // add a web app to their home screen.
  if (!visible || answered || pushBlocker(vapidPublicKey) !== null) return null;

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
