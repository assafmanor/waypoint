// **The notifications section of `UserSettings`** (ADR-0197 §7.1, ADR-0198 §6) — designed in
// `mockups/notifications-in-settings-v1.html` and built from it.
//
// ── THE RULE THIS COMPONENT IS ABOUT ──────────────────────────────────────────────────────
//
// **Where a blocker cannot be cleared, there is no control — not a disabled one.** A disabled
// toggle invites a tap and answers nothing, and on iOS it is worst of all, because there the
// user genuinely *can* fix it. So each blocked state renders a SENTENCE and no switch. It is
// the app's own rule reaching a settings row: `ErrorState`'s header says "the retry button
// only renders when the caller can actually recover".
//
// And when the server holds no VAPID keypair the **whole section is absent**. That is a
// property of the deployment, so it does not become a row apologising for one.
//
// ── TWO CARDS, ONE SECTION ────────────────────────────────────────────────────────────────
//
// The device card (permission, local) and the preferences card (categories, account) have
// **opposite persistence**, and ADR-0180 §2 settled what that means when the currency arrived
// beside the theme: one hint per card. A single card would leave two contradicting promises
// stacked under it with nothing to say which was which.
//
// ── AND ONE SWITCH IN THE SECOND CARD, NOT THREE ──────────────────────────────────────────
//
// `notifyTasks` gates phase A, which now fires. `notifyObligations` arrives with phase B and
// `notifyGroup` only if phase D is ever built — and a preference for a feature that may never
// come is a promise, not a control (ADR-0198 §6, amended 2026-08-21; the same argument
// ADR-0133 §7 made against a theme toggle that was not connected to anything).
import { useCallback, useEffect, useState } from 'react';
import type { PushDevice } from '@waypoint/shared';
import { t } from '../i18n/he';
import { deletePushDevice, fetchPushDevices } from '../lib/api';
import {
  currentSubscription,
  PUSH_BLOCKER,
  pushBlocker,
  subscribeThisDevice,
  thisDeviceSubscriptionId,
  unsubscribeThisDevice,
  type PushBlocker,
} from '../lib/push';
import { Icon, type IconName } from './Icon';
import { Switch } from './primitives/Switch';

/** The sentence each un-clearable state says, and the glyph beside it. `lock` is the one
 *  `.set-note`'s existing call site already pairs with "you cannot change this here", so a
 *  denied permission inherits a vocabulary rather than inventing one. */
const BLOCKED: Record<
  Exclude<PushBlocker, typeof PUSH_BLOCKER.SERVER>,
  { icon: IconName; text: string; value: string }
> = {
  [PUSH_BLOCKER.DENIED]: {
    icon: 'lock',
    text: t.shell.account.notifyDenied,
    value: t.shell.account.notifyBlockedValue,
  },
  [PUSH_BLOCKER.NEEDS_INSTALL]: {
    icon: 'home',
    text: t.shell.account.notifyNeedsInstall,
    value: t.shell.account.notifyOff,
  },
  [PUSH_BLOCKER.UNSUPPORTED]: {
    icon: 'warn',
    text: t.shell.account.notifyUnsupported,
    value: t.shell.account.notifyOff,
  },
};

export function NotificationSettings({
  vapidPublicKey,
  notifyTasks,
  onPatchPrefs,
}: {
  vapidPublicKey: string | null;
  notifyTasks: boolean;
  /** Rejects on failure so this component can show its own banner-less failure line without
   *  owning the account patch. */
  onPatchPrefs: (patch: { notifyTasks: boolean }) => Promise<void>;
}) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const subscription = await currentSubscription();
    setSubscribed(subscription !== null);
    // The list is only ever read when this device could be in it. A device with no
    // subscription has nothing to compare against and nothing to revoke.
    if (subscription === null) {
      setDevices([]);
      return;
    }
    await fetchPushDevices().then(setDevices, () => setDevices([]));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const blocker = pushBlocker(vapidPublicKey);

  // **The section is absent, not apologetic.** No keypair means nothing could be sent even if
  // a device subscribed, and that is the deployment's property rather than the person's.
  if (blocker === PUSH_BLOCKER.SERVER) return null;

  const toggleDevice = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      if (next) await subscribeThisDevice(vapidPublicKey!);
      else await unsubscribeThisDevice();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const togglePref = async (next: boolean) => {
    setFailed(false);
    try {
      await onPatchPrefs({ notifyTasks: next });
    } catch {
      setFailed(true);
    }
  };

  const removeDevice = (device: PushDevice) => {
    void deletePushDevice(device.id).then(refresh, () => setFailed(true));
  };

  const here = thisDeviceSubscriptionId();
  // **The list renders only when there is a device other than this one.** A one-row list
  // under the switch you just flipped is the same fact twice, and its heading promises a
  // list (mockup §4).
  const others = devices.filter((device) => device.id !== here);

  return (
    <>
      <div className="set-sec-title">{t.shell.account.notifications}</div>
      <div className="set-card">
        <div className="id-row">
          <span className="lab">{t.shell.account.notifyLabel}</span>
          {blocker ? (
            <span className="val dim">{BLOCKED[blocker].value}</span>
          ) : (
            <>
              <span className="val" />
              <Switch
                checked={subscribed === true}
                onChange={(next) => void toggleDevice(next)}
                ariaLabel={t.shell.account.notifyLabel}
                disabled={busy || subscribed === null}
              />
            </>
          )}
        </div>
        {blocked(blocker)}
        {failed && note('warn', t.shell.account.notifyFailed)}
      </div>
      {/* The hint belongs to the DEVICE card, and says so — its neighbour below promises the
          opposite persistence. */}
      {!blocker && <div className="set-hint-block">{t.shell.account.notifyDeviceHint}</div>}

      {/* The preferences card, and only while this device can actually receive: a category
          switch on a device with no subscription narrows nothing, which is the tasks brief's
          copy rule (ADR-0197 §7 — no UI may imply a reminder will arrive). */}
      {!blocker && subscribed === true && (
        <>
          <div className="set-card">
            <div className="id-row">
              <span className="lab">{t.shell.account.notifyTasksLabel}</span>
              <span className="val" />
              <Switch
                checked={notifyTasks}
                onChange={(next) => void togglePref(next)}
                ariaLabel={t.shell.account.notifyTasksLabel}
              />
            </div>
          </div>
          <div className="set-hint-block">{t.shell.account.notifyPrefsHint}</div>
        </>
      )}

      {others.length > 0 && (
        <>
          <div className="set-sec-title">{t.shell.account.notifyDevices}</div>
          <div className="set-card">
            {devices.map((device) => (
              <div className="set-dev-row" key={device.id}>
                <span className="set-dev-body">
                  {/* `dir="auto"` — a Latin run inside RTL copy is an island (ADR-0118). */}
                  <span className="set-dev-name" dir="auto">
                    {device.label}
                  </span>
                  <span className="set-dev-sub">
                    {device.id === here && (
                      <span className="set-dev-here">{t.shell.account.notifyDeviceHere}</span>
                    )}
                    <span className="set-dev-meta">{lastSentLabel(device)}</span>
                  </span>
                </span>
                {device.id !== here && (
                  <button
                    type="button"
                    className="set-edit"
                    aria-label={t.shell.account.notifyDeviceRemoveLabel(device.label)}
                    onClick={() => removeDevice(device)}
                  >
                    {t.shell.account.notifyDeviceRemove}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="set-hint-block">{t.shell.account.notifyDevicesHint}</div>
        </>
      )}
    </>
  );
}

/** The shipped `.set-note`: a glyph and ONE text child. Two text children would be two flex
 *  items — the defect the phase-1b mockup rendered before this shape was chosen. */
function note(icon: IconName, text: string) {
  return (
    <div className="set-note">
      <Icon name={icon} />
      <span>{text}</span>
    </div>
  );
}

function blocked(blocker: PushBlocker | null) {
  if (!blocker || blocker === PUSH_BLOCKER.SERVER) return null;
  return note(BLOCKED[blocker].icon, BLOCKED[blocker].text);
}

/** A date a person reads, or "not yet". `toLocaleDateString` with the app's locale rather
 *  than a hand-built string: this is a plain calendar date and `Intl` owns that. */
function lastSentLabel(device: PushDevice): string {
  if (!device.lastSentAt) return t.shell.account.notifyDeviceNeverSent;
  const when = new Date(device.lastSentAt).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
  });
  return t.shell.account.notifyDeviceLastSent(when);
}
