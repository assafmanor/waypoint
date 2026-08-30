// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NO_SENSITIVE_FIELDS, SHARE_DETAIL_LEVEL, type TripShareConfig } from '@waypoint/shared';
import { SHARE_LEVEL_SAVE_MS } from '../constants';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';

const CODE = '7Kq2mB9x';
const INVITE = '4Rn8pT2w';
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
  createInvite: vi.fn(),
  rotateInvite: vi.fn(),
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

/** **Join is the default audience** (ADR-0213's 2026-08-30 amendment), so every assertion
 *  about the read-only half has to cross the fork first. Written once here rather than at
 *  each call site, so what the fork costs the suite is one line and visible. */
const openRead = async () => {
  fireEvent.click(await screen.findByRole('radio', { name: t.share.owner.audience.read }));
};

describe('ShareItinerarySheet', () => {
  beforeEach(() => {
    auth.userId = ADMIN;
    api.fetchTripWithMembers.mockResolvedValue(members('admin'));
    api.createInvite.mockResolvedValue({ inviteUrl: `/join/${INVITE}` });
    api.rotateInvite.mockResolvedValue({ inviteUrl: '/join/New8Code' });
    api.fetchTripShare.mockResolvedValue(undefined);
    // **Echoes what it was sent**, so an assertion about what the sheet says after a save is
    // about the save and not about a fixture that always answers the same level.
    api.upsertTripShare.mockImplementation((_tripId: string, input: Record<string, unknown>) =>
      Promise.resolve({ ...config, ...input }),
    );
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
    await openRead();
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

  // **A LEVEL IS A SETTING ON A LIVE LINK, NOT A DRAFT** (owner, 2026-08-30: _"every time I
  // open the sharing menu it's on תקציר"_). `upsertTripShare` used to be reachable only from
  // the two send buttons, so changing the level and closing the sheet discarded it — and the
  // next open re-seeded from the stored config and looked like the control had never moved.
  it('writes a changed level to an already-live share, with no send press', async () => {
    api.fetchTripShare.mockResolvedValue(config);
    renderSheet();
    await openRead();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.summary }));

    await waitFor(() =>
      expect(api.upsertTripShare).toHaveBeenCalledWith('t1', {
        detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
        sensitive: NO_SENSITIVE_FIELDS,
        documentIds: [],
      }),
    );
    // …and it says so, because the link changed under whoever already holds it.
    expect(
      await screen.findByText(
        t.share.owner.levelSaved(t.share.owner.levels[SHARE_DETAIL_LEVEL.SUMMARY]),
      ),
    ).toBeTruthy();
    expect(systemShare.shareUrlOrCopy).not.toHaveBeenCalled();
  });

  // The other half of the same rule: with nothing live yet there is nothing to change, and
  // minting a link from a control the reader was only looking at is a grant nobody asked for.
  it('mints nothing when there is no share yet and the level is only browsed', async () => {
    renderSheet();
    await openRead();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.summary }));

    await new Promise((resolve) => setTimeout(resolve, SHARE_LEVEL_SAVE_MS + 60));
    expect(api.upsertTripShare).not.toHaveBeenCalled();
  });

  it('defaults to Full with every sensitive family off', async () => {
    renderSheet();
    await openRead();
    const full = await screen.findByRole('radio', { name: t.share.owner.levels.full });
    expect(full.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(t.share.owner.privateRows.bookingSecrets.title)).toBeNull();
  });

  it('reveals the four private rows only at Everything, all off', async () => {
    renderSheet();
    await openRead();
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
    await openRead();
    await screen.findByRole('radio', { name: t.share.owner.levels.summary });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.summary }));
    expect(api.fetchSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.everything }));
    await waitFor(() => expect(api.fetchSnapshot).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('כרטיסים.pdf')).toBeTruthy();
  });

  it('sends only the files that were ticked', async () => {
    renderSheet();
    await openRead();
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
    await openRead();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.pdf) });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.share.owner.actions.pdf) }));

    await waitFor(() => expect(api.fetchSharedItineraryPdf).toHaveBeenCalledWith(CODE));
    await waitFor(() => expect(systemShare.shareFileOrDownload).toHaveBeenCalledTimes(1));
  });

  it('says the link was copied when there is no native sheet, and nothing when it was shared', async () => {
    systemShare.shareUrlOrCopy.mockResolvedValue('copied');
    renderSheet();
    await openRead();
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
    await openRead();
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
    await openRead();

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
    await openRead();

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

  // **The two links are two GRANTS, and the sheet asks which one before anything else**
  // (ADR-0213's 2026-08-30 amendment). Everything here is about keeping them separable: a
  // press meant for one must never reach the other.
  describe('the audience fork', () => {
    it('opens on join, because that is the audience settings used to hide', async () => {
      renderSheet();
      const join = await screen.findByRole('radio', { name: t.share.owner.audience.join });
      expect(join.getAttribute('aria-checked')).toBe('true');
      expect(await screen.findByText(`localhost:3000/join/${INVITE}`)).toBeTruthy();
    });

    // `POST …/invite` is get-or-create (ADR-0067), so it is safe to ask — and it must be
    // asked ONCE. Crossing to the read branch and back is the same trip's same link, and a
    // second call per visit would be a write on every toggle.
    it('asks for the invite once, however many times the fork is crossed', async () => {
      renderSheet();
      await screen.findByText(`localhost:3000/join/${INVITE}`);
      expect(api.createInvite).toHaveBeenCalledTimes(1);

      await openRead();
      fireEvent.click(screen.getByRole('radio', { name: t.share.owner.audience.join }));
      await screen.findByText(`localhost:3000/join/${INVITE}`);
      expect(api.createInvite).toHaveBeenCalledTimes(1);
    });

    // The read branch's own lazy read is unaffected by the fork: a Summary link must still
    // never pay for the authenticated snapshot.
    it('still leaves the file list to Everything', async () => {
      renderSheet();
      await openRead();
      expect(api.fetchSnapshot).not.toHaveBeenCalled();
    });

    it('sends the join link, and never touches the read-only share', async () => {
      renderSheet();
      await screen.findByRole('button', { name: new RegExp(t.share.owner.join.action) });

      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.share.owner.join.action) }));

      await waitFor(() =>
        expect(systemShare.shareUrlOrCopy).toHaveBeenCalledWith(
          expect.objectContaining({ url: `https://localhost:3000/join/${INVITE}` }),
        ),
      );
      expect(api.upsertTripShare).not.toHaveBeenCalled();
      expect(api.fetchSharedItineraryPdf).not.toHaveBeenCalled();
    });

    // A `/join/` link has no second format — there is no PDF of a membership.
    it('offers one outcome on join and two on read', async () => {
      renderSheet();
      await screen.findByRole('button', { name: new RegExp(t.share.owner.join.action) });
      expect(
        screen.queryByRole('button', { name: new RegExp(t.share.owner.actions.pdf) }),
      ).toBeNull();

      await openRead();
      expect(
        await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.pdf) }),
      ).toBeTruthy();
    });

    it('confirms before it replaces the invite, and shows the new one', async () => {
      renderSheet();
      fireEvent.click(await screen.findByRole('button', { name: t.share.owner.join.rotate }));
      expect(screen.getByText(t.share.owner.join.rotateTitle)).toBeTruthy();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: t.share.owner.join.rotateConfirm }));
      });

      expect(api.rotateInvite).toHaveBeenCalledWith('t1');
      expect(await screen.findByText('localhost:3000/join/New8Code')).toBeTruthy();
    });
  });

  describe('a peer', () => {
    beforeEach(() => {
      auth.userId = PEER;
      api.fetchTripWithMembers.mockResolvedValue(members('peer'));
      api.fetchTripShare.mockResolvedValue(config);
    });

    // Not a new authorization rule: `POST …/invite` is already get-or-create for any
    // member and only `rotate` is the admin's (ADR-0067) — the same split this sheet
    // already draws for the read-only link.
    it('sees the whole invite branch, without the control that revokes it', async () => {
      renderSheet();
      expect(await screen.findByText(`localhost:3000/join/${INVITE}`)).toBeTruthy();
      expect(
        screen.getByRole('button', { name: new RegExp(t.share.owner.join.action) }),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.share.owner.join.rotate })).toBeNull();
    });

    it('can share an existing link but sees no configuration', async () => {
      renderSheet();
      await openRead();
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
