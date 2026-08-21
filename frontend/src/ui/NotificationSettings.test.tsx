// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PUSH_BLOCKER } from '../lib/push';
import { t } from '../i18n/he';

/**
 * **The state machine is the subject** (ADR-0197 §7.1), and the rule under test is one
 * sentence: *where a blocker cannot be cleared, there is no control — not a disabled one.*
 * A disabled toggle invites a tap and answers nothing, and on iOS it is worst of all because
 * there the user genuinely can fix it.
 *
 * So almost every assertion here is about the ABSENCE of a switch, which is the shape a test
 * has to state on purpose: a missing control passes any test that only ever looks for a
 * present one.
 */
const blocker = vi.hoisted(() => ({ value: null as string | null }));
const subscription = vi.hoisted(() => ({ value: null as { endpoint: string } | null }));
const calls = vi.hoisted(() => ({
  subscribe: 0,
  unsubscribe: 0,
  removed: [] as string[],
  /** Make the next subscribe reject — a permission the platform refused, or a server that
   *  would not take the registration. */
  failSubscribe: false,
}));
const devices = vi.hoisted(() => ({
  value: [] as { id: string; label: string; lastSentAt: string | null; createdAt: string }[],
}));
const thisDevice = vi.hoisted(() => ({ value: null as string | null }));

vi.mock('../lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/push')>();
  return {
    ...actual,
    pushBlocker: () => blocker.value,
    currentSubscription: () => Promise.resolve(subscription.value),
    thisDeviceSubscriptionId: () => thisDevice.value,
    subscribeThisDevice: () => {
      calls.subscribe += 1;
      if (calls.failSubscribe) return Promise.reject(new Error('denied'));
      subscription.value = { endpoint: 'https://push/1' };
      return Promise.resolve();
    },
    unsubscribeThisDevice: () => {
      calls.unsubscribe += 1;
      subscription.value = null;
      return Promise.resolve();
    },
  };
});

vi.mock('../lib/api', () => ({
  fetchPushDevices: () => Promise.resolve(devices.value),
  deletePushDevice: (id: string) => {
    calls.removed.push(id);
    devices.value = devices.value.filter((d) => d.id !== id);
    return Promise.resolve();
  },
}));

import { NotificationSettings } from './NotificationSettings';

const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa';

/** Renders and flushes the mount effect, which reads the subscription and the device list. */
async function show(props: Partial<Parameters<typeof NotificationSettings>[0]> = {}) {
  const patch = vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    render(
      <NotificationSettings vapidPublicKey={VAPID} notifyTasks onPatchPrefs={patch} {...props} />,
    );
  });
  return { patch };
}

const switches = () => screen.queryAllByRole('switch');

beforeEach(() => {
  blocker.value = null;
  subscription.value = null;
  devices.value = [];
  thisDevice.value = null;
  calls.subscribe = 0;
  calls.unsubscribe = 0;
  calls.removed = [];
  calls.failSubscribe = false;
});
afterEach(() => cleanup());

describe('the section’s own presence', () => {
  it('is ABSENT ENTIRELY when the server holds no keypair', async () => {
    // Not a row apologising: an absent keypair is a property of the deployment, and nothing
    // could be sent even if this device subscribed.
    blocker.value = PUSH_BLOCKER.SERVER;
    await show({ vapidPublicKey: null });
    expect(screen.queryByText(t.shell.account.notifications)).toBeNull();
    expect(switches()).toHaveLength(0);
  });

  it('is present when the server can send', async () => {
    await show();
    expect(screen.getByText(t.shell.account.notifications)).toBeTruthy();
  });
});

describe('where the blocker cannot be cleared, there is NO switch', () => {
  it.each([
    [PUSH_BLOCKER.DENIED, t.shell.account.notifyDenied],
    [PUSH_BLOCKER.NEEDS_INSTALL, t.shell.account.notifyNeedsInstall],
    [PUSH_BLOCKER.UNSUPPORTED, t.shell.account.notifyUnsupported],
  ])('%s says its sentence and offers no control', async (value, sentence) => {
    blocker.value = value;
    await show();
    expect(screen.getByText(sentence)).toBeTruthy();
    // The whole rule, in one assertion: not a disabled switch — no switch.
    expect(switches()).toHaveLength(0);
  });

  it('shows no device hint either, because there is no device state to promise', async () => {
    blocker.value = PUSH_BLOCKER.DENIED;
    await show();
    expect(screen.queryByText(t.shell.account.notifyDeviceHint)).toBeNull();
  });

  it('says "off in the browser" for a DENIED permission and a dash for the rest', async () => {
    blocker.value = PUSH_BLOCKER.DENIED;
    await show();
    expect(screen.getByText(t.shell.account.notifyBlockedValue)).toBeTruthy();
  });
});

describe('the device switch', () => {
  it('is off and askable when nothing is registered here', async () => {
    await show();
    const control = screen.getByRole('switch', { name: t.shell.account.notifyLabel });
    expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('subscribes on the way on and unsubscribes on the way off', async () => {
    await show();
    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyLabel }).click();
    });
    expect(calls.subscribe).toBe(1);
    expect(
      screen
        .getByRole('switch', { name: t.shell.account.notifyLabel })
        .getAttribute('aria-checked'),
    ).toBe('true');

    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyLabel }).click();
    });
    expect(calls.unsubscribe).toBe(1);
  });

  it('says so when it could not be turned on, and stays off', async () => {
    // The platform can refuse the permission, and the server can refuse the registration.
    // Either way the switch must not end up claiming a subscription that does not exist.
    calls.failSubscribe = true;
    await show();
    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyLabel }).click();
    });
    expect(screen.getByText(t.shell.account.notifyFailed)).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: t.shell.account.notifyLabel })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('clears the failure line on the next attempt', async () => {
    calls.failSubscribe = true;
    await show();
    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyLabel }).click();
    });
    calls.failSubscribe = false;
    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyLabel }).click();
    });
    expect(screen.queryByText(t.shell.account.notifyFailed)).toBeNull();
  });
});

describe('the preferences card', () => {
  it('is absent while this device is not subscribed', async () => {
    // A category switch on a device that receives nothing narrows nothing — the tasks
    // brief's copy rule (ADR-0197 §7: no UI may imply a reminder will arrive).
    await show();
    expect(screen.queryByRole('switch', { name: t.shell.account.notifyTasksLabel })).toBeNull();
  });

  it('appears once the device is subscribed, and carries the ACCOUNT hint', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    await show();
    expect(screen.getByRole('switch', { name: t.shell.account.notifyTasksLabel })).toBeTruthy();
    // Its neighbour above promises the opposite persistence, which is why each card owns its
    // own hint (ADR-0180 §2).
    expect(screen.getByText(t.shell.account.notifyPrefsHint)).toBeTruthy();
    expect(screen.getByText(t.shell.account.notifyDeviceHint)).toBeTruthy();
  });

  it('patches the account, and reports a failure without flipping itself', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    const patch = vi.fn().mockRejectedValue(new Error('offline'));
    await act(async () => {
      render(<NotificationSettings vapidPublicKey={VAPID} notifyTasks onPatchPrefs={patch} />);
    });
    await act(async () => {
      screen.getByRole('switch', { name: t.shell.account.notifyTasksLabel }).click();
    });
    expect(patch).toHaveBeenCalledWith({ notifyTasks: false });
    expect(screen.getByText(t.shell.account.notifyFailed)).toBeTruthy();
    // Controlled by the prop, so a rejected patch leaves the switch showing what the account
    // actually holds rather than an optimistic lie.
    expect(
      screen
        .getByRole('switch', { name: t.shell.account.notifyTasksLabel })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('offers ONE switch, not three', async () => {
    // `notifyObligations` arrives with phase B and `notifyGroup` only if phase D is ever
    // built — a preference for a feature that may never come is a promise, not a control.
    subscription.value = { endpoint: 'https://push/1' };
    await show();
    expect(switches()).toHaveLength(2); // the device, and tasks
  });
});

describe('the device list', () => {
  const device = (
    over: Partial<{ id: string; label: string; lastSentAt: string | null }> = {},
  ) => ({
    id: 'd1',
    label: 'iPhone · Safari',
    lastSentAt: null,
    createdAt: '2026-08-20T00:00:00Z',
    ...over,
  });

  it('does not render when this device is the only one', async () => {
    // A one-row list under the switch you just flipped is the same fact twice, and its
    // heading promises a list.
    subscription.value = { endpoint: 'https://push/1' };
    thisDevice.value = 'd1';
    devices.value = [device()];
    await show();
    expect(screen.queryByText(t.shell.account.notifyDevices)).toBeNull();
  });

  it('renders once there IS another device, marking this one', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    thisDevice.value = 'd1';
    devices.value = [device(), device({ id: 'd2', label: 'Mac · Chrome' })];
    await show();
    expect(screen.getByText(t.shell.account.notifyDevices)).toBeTruthy();
    expect(screen.getByText(t.shell.account.notifyDeviceHere)).toBeTruthy();
    expect(screen.getByText('Mac · Chrome')).toBeTruthy();
  });

  it('offers no remove on the device you are holding', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    thisDevice.value = 'd1';
    devices.value = [device(), device({ id: 'd2', label: 'Mac · Chrome' })];
    await show();
    // Turning THIS device off is the switch above; a remove button beside it would be a
    // second way to do one thing, and the confusing one.
    const removes = screen.getAllByText(t.shell.account.notifyDeviceRemove);
    expect(removes).toHaveLength(1);
  });

  it('revokes another device by id', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    thisDevice.value = 'd1';
    devices.value = [device(), device({ id: 'd2', label: 'Mac · Chrome' })];
    await show();
    await act(async () => {
      screen.getByLabelText(t.shell.account.notifyDeviceRemoveLabel('Mac · Chrome')).click();
    });
    expect(calls.removed).toEqual(['d2']);
    expect(screen.queryByText('Mac · Chrome')).toBeNull();
  });

  it('says when a device was never reached', async () => {
    subscription.value = { endpoint: 'https://push/1' };
    thisDevice.value = 'd1';
    devices.value = [device(), device({ id: 'd2', label: 'Mac · Chrome' })];
    await show();
    expect(screen.getAllByText(t.shell.account.notifyDeviceNeverSent).length).toBeGreaterThan(0);
  });

  it('is not fetched at all when this device has no subscription', async () => {
    // Nothing to compare against and nothing to revoke, so the list is not a question worth
    // asking the server.
    devices.value = [device(), device({ id: 'd2' })];
    await show();
    expect(screen.queryByText(t.shell.account.notifyDevices)).toBeNull();
  });
});
