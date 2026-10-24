import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KIND } from '@waypoint/shared';
import { DirectDispatcher } from './notification-dispatcher';
import type { DueSend } from './notification-kind';
import type { NotificationsService } from './notifications.service';

/** A `SendReport` as `sendToUser` returns one: how many devices were tried, how many took it. */
const report = (attempted: number, sent: number) => Promise.resolve({ attempted, sent });

const send = (over: Partial<DueSend> = {}): DueSend => ({
  userId: 'u1',
  tripId: 't1',
  kind: NOTIFICATION_KIND.TASK_DUE,
  subjectId: 'task-1',
  aimedAtMs: Date.parse('2026-08-21T09:00:00Z'),
  payload: { kind: NOTIFICATION_KIND.TASK_DUE, title: 'כותרת', body: 'גוף', url: '/' },
  ...over,
});

function dispatcherWith(sendToUser: NotificationsService['sendToUser']) {
  return new DirectDispatcher({ sendToUser } as NotificationsService);
}

describe('DirectDispatcher', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  it('reports nothing undelivered when a device took it', async () => {
    const undelivered = await dispatcherWith(() => report(1, 1)).dispatch([send()]);
    expect(undelivered).toEqual([]);
  });

  it('reports a send that had devices and reached NONE of them', async () => {
    // The transport told us, in-process, that nothing arrived — so the sweep may hand the
    // claim back and the next tick retries (ADR-0197 §10).
    const undelivered = await dispatcherWith(() => report(2, 0)).dispatch([send()]);
    expect(undelivered).toHaveLength(1);
  });

  it('reports a send that reached SOME device as delivered', async () => {
    // Two phones, one unreachable. The notification arrived; re-sending it would be a
    // duplicate on the phone that already buzzed.
    const undelivered = await dispatcherWith(() => report(2, 1)).dispatch([send()]);
    expect(undelivered).toEqual([]);
  });

  it('does NOT report a send for a user with no devices at all', async () => {
    // `attempted === 0` is not a failure, it is an empty audience — and releasing that claim
    // would re-derive the same candidate every tick until it went stale, for nobody. The one
    // branch here that a mutation of the sweep alone cannot see.
    const undelivered = await dispatcherWith(() => report(0, 0)).dispatch([send()]);
    expect(undelivered).toEqual([]);
  });

  it('reports a send whose delivery THREW, and keeps going', async () => {
    const calls: string[] = [];
    const undelivered = await dispatcherWith((userId: string) => {
      calls.push(userId);
      if (userId === 'u1') return Promise.reject(new Error('boom'));
      return report(1, 1);
    }).dispatch([send({ userId: 'u1' }), send({ userId: 'u2' })]);

    // One failure never stops the rest — that is this dispatcher's stated promise.
    expect(calls).toEqual(['u1', 'u2']);
    expect(undelivered.map((s) => s.userId)).toEqual(['u1']);
  });

  it('never logs the payload — it is what a lock screen shows', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    await dispatcherWith(() => Promise.reject(new Error('boom'))).dispatch([send()]);

    const line = String(warn.mock.calls.at(-1)?.[0] ?? '');
    expect(line).toContain(NOTIFICATION_KIND.TASK_DUE);
    expect(line).not.toContain('כותרת');
    expect(line).not.toContain('גוף');
  });
});
