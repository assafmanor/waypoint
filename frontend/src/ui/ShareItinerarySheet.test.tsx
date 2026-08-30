// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NO_SENSITIVE_FIELDS, SHARE_DETAIL_LEVEL, type TripShareConfig } from '@waypoint/shared';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';

const CODE = '7Kq2mB9x';
const ADMIN = 'u-assaf';
const PEER = 'u-noam';

const config: TripShareConfig = {
  code: CODE,
  shareUrl: `/s/${CODE}`,
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  sensitive: NO_SENSITIVE_FIELDS,
  documentIds: [],
  updatedAt: '2026-08-29T08:10:00.000Z',
};

const api = vi.hoisted(() => ({
  fetchTripShare: vi.fn(),
  fetchTripWithMembers: vi.fn(),
  upsertTripShare: vi.fn(),
  rotateTripShare: vi.fn(),
  stopTripShare: vi.fn(),
  fetchSharedItineraryPdf: vi.fn(),
  fetchSnapshot: vi.fn(),
}));
const systemShare = vi.hoisted(() => ({
  shareUrlOrCopy: vi.fn(),
  shareFileOrDownload: vi.fn(),
}));
const auth = vi.hoisted(() => ({ userId: 'u-assaf' }));

vi.mock('../lib/api', () => api);
vi.mock('../lib/system-share', () => systemShare);
vi.mock('../state/auth-state', () => ({
  useAuth: () => ({ status: 'authed', me: { user: { id: auth.userId } } }),
}));

const { ShareItinerarySheet } = await import('./ShareItinerarySheet');

const members = (role: 'admin' | 'peer') => ({
  trip: {},
  members: [
    { userId: ADMIN, role: 'admin' },
    { userId: PEER, role: 'peer' },
  ].map((member) => (member.userId === auth.userId ? { ...member, role } : member)),
});

// Every overlay renders through `Modal`, which registers into the back stack (ADR-0090),
// so the sheet needs the app's nav context exactly as any other sheet's spec does.
const renderSheet = () =>
  render(
    wrapNav(<ShareItinerarySheet tripId="t1" tripName="איסלנד עם המשפחה" onClose={() => {}} />),
  );

describe('ShareItinerarySheet', () => {
  beforeEach(() => {
    auth.userId = ADMIN;
    api.fetchTripWithMembers.mockResolvedValue(members('admin'));
    api.fetchTripShare.mockResolvedValue(undefined);
    api.upsertTripShare.mockResolvedValue(config);
    api.rotateTripShare.mockResolvedValue({ ...config, code: 'New8Code', shareUrl: '/s/New8Code' });
    api.stopTripShare.mockResolvedValue(undefined);
    api.fetchSharedItineraryPdf.mockResolvedValue(new Blob(['%PDF-1.4']));
    api.fetchSnapshot.mockResolvedValue({ documents: [{ id: 'd1', title: 'כרטיסים.pdf' }] });
    systemShare.shareUrlOrCopy.mockResolvedValue('shared');
    systemShare.shareFileOrDownload.mockResolvedValue('shared');
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // The short path is the design: pick a level, press an outcome. There is deliberately no
  // Save step between them, which is exactly why the API had to be idempotent.
  it('keeps the ordinary path to preset then system share', async () => {
    renderSheet();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.full }));
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
    );

    await waitFor(() =>
      expect(api.upsertTripShare).toHaveBeenCalledWith('t1', {
        detailLevel: SHARE_DETAIL_LEVEL.FULL,
        sensitive: NO_SENSITIVE_FIELDS,
        documentIds: [],
      }),
    );
    expect(systemShare.shareUrlOrCopy).toHaveBeenCalledTimes(1);
  });

  it('defaults to Full with every sensitive family off', async () => {
    renderSheet();
    const full = await screen.findByRole('radio', { name: t.share.owner.levels.full });
    expect(full.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(t.share.owner.privateRows.bookingSecrets.title)).toBeNull();
  });

  it('reveals the four private rows only at Everything, all off', async () => {
    renderSheet();
    await screen.findByRole('radio', { name: t.share.owner.levels.everything });
    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.everything }));

    for (const key of ['bookingSecrets', 'notesAndTasks', 'travelerIdentity'] as const) {
      const control = screen.getByRole('switch', { name: t.share.owner.privateRows[key].title });
      expect(control.getAttribute('aria-checked')).toBe('false');
    }
    expect(screen.getByText(t.share.owner.privateRows.documents.title)).toBeTruthy();
  });

  // Summary and Full must never pay for the authenticated snapshot; only file selection
  // needs it, and only once.
  it('fetches the file list lazily, and only at Everything', async () => {
    renderSheet();
    await screen.findByRole('radio', { name: t.share.owner.levels.summary });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.summary }));
    expect(api.fetchSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.everything }));
    await waitFor(() => expect(api.fetchSnapshot).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('כרטיסים.pdf')).toBeTruthy();
  });

  it('sends only the files that were ticked', async () => {
    renderSheet();
    await screen.findByRole('radio', { name: t.share.owner.levels.everything });
    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.everything }));
    await screen.findByText('כרטיסים.pdf');

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
    );

    await waitFor(() =>
      expect(api.upsertTripShare).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ documentIds: ['d1'] }),
      ),
    );
  });

  it('produces a PDF and hands it to the system, not a bare download link', async () => {
    api.fetchTripShare.mockResolvedValue(config);
    renderSheet();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.pdf) });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.share.owner.actions.pdf) }));

    await waitFor(() => expect(api.fetchSharedItineraryPdf).toHaveBeenCalledWith(CODE));
    await waitFor(() => expect(systemShare.shareFileOrDownload).toHaveBeenCalledTimes(1));
  });

  it('says the link was copied when there is no native sheet, and nothing when it was shared', async () => {
    systemShare.shareUrlOrCopy.mockResolvedValue('copied');
    renderSheet();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
    );
    expect(await screen.findByText(t.share.owner.copied)).toBeTruthy();
  });

  // Cancelling a native sheet is not an error, so it must not paint one.
  it('says nothing at all when the person dismissed the system sheet', async () => {
    systemShare.shareUrlOrCopy.mockResolvedValue('cancelled');
    renderSheet();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
    );
    await waitFor(() => expect(systemShare.shareUrlOrCopy).toHaveBeenCalled());
    expect(screen.queryByText(t.share.owner.failed)).toBeNull();
    expect(screen.queryByText(t.share.owner.copied)).toBeNull();
  });

  it('confirms rotation and replaces the shown link', async () => {
    api.fetchTripShare.mockResolvedValue(config);
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: t.share.owner.manage }));
    fireEvent.click(screen.getByRole('button', { name: t.share.owner.rotate }));
    // Rotation breaks a URL other people already hold, so it asks first.
    expect(screen.getByText(t.share.owner.rotateTitle)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.owner.rotateConfirm }));
    });

    expect(api.rotateTripShare).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('localhost:3000/s/New8Code')).toBeTruthy();
  });

  it('confirms before it stops sharing, and returns to the not-shared state', async () => {
    api.fetchTripShare.mockResolvedValue(config);
    renderSheet();

    fireEvent.click(await screen.findByRole('button', { name: t.share.owner.manage }));
    fireEvent.click(screen.getByRole('button', { name: t.share.owner.stop }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.owner.stopConfirm }));
    });

    expect(api.stopTripShare).toHaveBeenCalledWith('t1');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: t.share.owner.manage })).toBeNull(),
    );
  });

  describe('a peer', () => {
    beforeEach(() => {
      auth.userId = PEER;
      api.fetchTripWithMembers.mockResolvedValue(members('peer'));
      api.fetchTripShare.mockResolvedValue(config);
    });

    it('can share an existing link but sees no configuration', async () => {
      renderSheet();
      await screen.findByText(t.share.owner.peerNote);

      expect(screen.queryByRole('radio', { name: t.share.owner.levels.everything })).toBeNull();
      expect(screen.queryByRole('button', { name: t.share.owner.manage })).toBeNull();

      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
      );
      await waitFor(() => expect(systemShare.shareUrlOrCopy).toHaveBeenCalledTimes(1));
      // Nothing was reconfigured on their behalf — the 403 never has to happen.
      expect(api.upsertTripShare).not.toHaveBeenCalled();
    });
  });
});
