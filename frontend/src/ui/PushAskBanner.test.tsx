// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { t } from '../i18n/he';
import { PUSH_BLOCKER } from '../lib/push';

/**
 * **The second door** (ADR-0197 §7): "immediately after a first deadline is set on a task —
 * once per install, dismissible, never re-asked."
 *
 * Every clause of that sentence is a test here, and the two that matter most are the ones
 * about NOT appearing: a prompt that re-asks somebody who said no is a nag, and a permission
 * refused at the platform level is not recoverable in-app on any platform.
 */
const blocker = vi.hoisted(() => ({ value: null as string | null }));
const calls = vi.hoisted(() => ({ subscribe: 0, fail: false }));
const session = vi.hoisted(() => ({ key: 'BEl62iUYgUivxIkv' as string | null, present: true }));

vi.mock('../lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/push')>();
  return {
    ...actual,
    // Honours its ARGUMENT the way the real one does — `pushBlocker(null)` is `SERVER`
    // before anything else is considered. A mock that ignored the key would let the
    // no-session case pass against a component that never checked it.
    pushBlocker: (key: string | null | undefined) =>
      key ? blocker.value : actual.PUSH_BLOCKER.SERVER,
    subscribeThisDevice: () => {
      calls.subscribe += 1;
      return calls.fail ? Promise.reject(new Error('denied')) : Promise.resolve();
    },
  };
});

vi.mock('../state/auth-state', () => ({
  useMaybeAuth: () => (session.present ? { me: { push: { vapidPublicKey: session.key } } } : null),
}));

import { PushAskBanner } from './PushAskBanner';

const ask = () => screen.queryByText(t.tasks.sheet.notifyAsk.text);
const action = () => screen.getByText(t.tasks.sheet.notifyAsk.action);

beforeEach(() => {
  blocker.value = null;
  calls.subscribe = 0;
  calls.fail = false;
  session.key = 'BEl62iUYgUivxIkv';
  session.present = true;
  localStorage.clear();
});
afterEach(() => cleanup());

describe('when it appears', () => {
  it('appears once a deadline is on the draft', async () => {
    render(<PushAskBanner visible />);
    expect(ask()).toBeTruthy();
  });

  it('does NOT appear before a deadline is set — the want has not been expressed', () => {
    render(<PushAskBanner visible={false} />);
    expect(ask()).toBeNull();
  });

  it('does not appear where this device could never receive', () => {
    // Including NEEDS_INSTALL: the settings section explains how to fix that, and a task form
    // is not the place to teach somebody to add a web app to their home screen.
    for (const value of [
      PUSH_BLOCKER.SERVER,
      PUSH_BLOCKER.DENIED,
      PUSH_BLOCKER.UNSUPPORTED,
      PUSH_BLOCKER.NEEDS_INSTALL,
    ]) {
      cleanup();
      blocker.value = value;
      render(<PushAskBanner visible />);
      expect(ask()).toBeNull();
    }
  });

  it('does not appear with no session at all', () => {
    // No session means no device to subscribe and nothing to offer — and it is why this
    // component reads `useMaybeAuth` rather than crashing where no provider is mounted.
    session.present = false;
    render(<PushAskBanner visible />);
    expect(ask()).toBeNull();
  });
});

describe('once per install, and a dismissal is an ANSWER', () => {
  it('never asks again after it was taken', async () => {
    render(<PushAskBanner visible />);
    await act(async () => {
      action().click();
    });
    expect(calls.subscribe).toBe(1);
    expect(ask()).toBeNull();

    cleanup();
    render(<PushAskBanner visible />);
    expect(ask()).toBeNull();
  });

  it('never asks again after it was DISMISSED', async () => {
    // The clause that separates a prompt from a nag.
    render(<PushAskBanner visible />);
    await act(async () => {
      screen.getByLabelText(t.feedback.dismiss).click();
    });
    expect(ask()).toBeNull();

    cleanup();
    render(<PushAskBanner visible />);
    expect(ask()).toBeNull();
    expect(calls.subscribe).toBe(0);
  });

  it('counts a REFUSED permission as answered', async () => {
    // A platform refusal is not recoverable in-app, so asking again would be asking for
    // nothing. The settings section is the only way back, and it says so.
    calls.fail = true;
    render(<PushAskBanner visible />);
    await act(async () => {
      action().click();
    });
    cleanup();
    render(<PushAskBanner visible />);
    expect(ask()).toBeNull();
  });

  it('survives a reload rather than living in component state', async () => {
    render(<PushAskBanner visible />);
    await act(async () => {
      screen.getByLabelText(t.feedback.dismiss).click();
    });
    // The store, not the component: a fresh mount in a fresh tab must still be silent.
    expect(localStorage.getItem('waypoint:push:asked')).toBe('1');
  });
});

describe('it reuses StatusBanner rather than adding a component', () => {
  it('carries its verb INSIDE the banner (ADR-0181)', () => {
    render(<PushAskBanner visible />);
    const banner = screen.getByRole('status');
    expect(banner.querySelector('.fb-banner-action')?.textContent).toBe(
      t.tasks.sheet.notifyAsk.action,
    );
    expect(banner.querySelector('.fb-banner-dismiss')).toBeTruthy();
  });

  it('is a polite live region, so it does not interrupt a form being filled in', () => {
    render(<PushAskBanner visible />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});
