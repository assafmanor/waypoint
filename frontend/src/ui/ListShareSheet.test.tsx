// @vitest-environment jsdom
//
// **A list's own sheet** (ADR-0242 §2): one link and one action, no levels and no switches.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_CATEGORY,
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type TripShareConfig,
} from '@waypoint/shared';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';

const api = vi.hoisted(() => ({ upsertTripShare: vi.fn(), stopTripShare: vi.fn() }));
const systemShare = vi.hoisted(() => ({ shareUrlOrCopy: vi.fn() }));
vi.mock('../lib/api', () => api);
vi.mock('../lib/system-share', () => systemShare);

const { ListShareSheet, listPolicy } = await import('./ListShareSheet');

const food: TripShareConfig = {
  code: '4hQx8Rk2',
  shareUrl: '/s/4hQx8Rk2',
  detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
  sensitive: NO_SENSITIVE_FIELDS,
  documentIds: [],
  scope: { category: EVENT_CATEGORY.FOOD },
  updatedAt: '2026-09-29T08:00:00.000Z',
};

const open = (props: { link?: TripShareConfig; isAdmin?: boolean } = {}) => {
  const onLink = vi.fn();
  render(
    wrapNav(
      <ListShareSheet
        tripId="t1"
        tripName="יפן"
        category={EVENT_CATEGORY.FOOD}
        count={8}
        link={props.link}
        isAdmin={props.isAdmin ?? true}
        onLink={onLink}
        onClose={() => {}}
      />,
    ),
  );
  return onLink;
};

describe('ListShareSheet', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('says what crosses, and creates the list link on the one press', async () => {
    api.upsertTripShare.mockResolvedValue(food);
    systemShare.shareUrlOrCopy.mockResolvedValue('shared');
    const onLink = open();
    expect(screen.getByText(t.share.list.places(8))).toBeTruthy();
    expect(screen.getByText(t.share.list.scope)).toBeTruthy();
    // No level to pick and nothing to switch: the scope is the whole policy.
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.list.create }));
    });
    expect(api.upsertTripShare).toHaveBeenCalledWith('t1', listPolicy(EVENT_CATEGORY.FOOD));
    expect(onLink).toHaveBeenCalledWith(food);
    expect(systemShare.shareUrlOrCopy).toHaveBeenCalledWith(
      expect.objectContaining({ title: `${t.share.list.name.food} · יפן` }),
    );
  });

  it('sends a live link again without creating one, and lets an admin stop it', async () => {
    systemShare.shareUrlOrCopy.mockResolvedValue('shared');
    api.stopTripShare.mockResolvedValue(undefined);
    const onLink = open({ link: food });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.list.again }));
    });
    expect(api.upsertTripShare).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: t.share.list.stop }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.owner.stopConfirm }));
    });
    expect(api.stopTripShare).toHaveBeenCalledWith('t1', food.code);
    expect(onLink).toHaveBeenCalledWith(undefined);
  });

  it('gives a traveller who is not an admin the send and nothing to stop', () => {
    open({ link: food, isAdmin: false });
    expect(screen.getByRole('button', { name: t.share.list.again })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.share.list.stop })).toBeNull();
  });
});
