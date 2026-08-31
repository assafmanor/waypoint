// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NO_SENSITIVE_FIELDS, SHARE_DETAIL_LEVEL, type TripShareConfig } from '@waypoint/shared';
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

/** An Everything policy, which is a FAMILY — these two reveal different things and are
 *  therefore two links on one level (ADR-0213's tenth amendment §1). */
const operational: TripShareConfig = {
  ...config,
  code: '2Wd6hL8m',
  shareUrl: '/s/2Wd6hL8m',
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
  sensitive: { ...NO_SENSITIVE_FIELDS, bookingSecrets: true },
  documentIds: ['d1'],
};
const bare: TripShareConfig = {
  ...config,
  code: '6Yb1xN4c',
  shareUrl: '/s/6Yb1xN4c',
  detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
};

const api = vi.hoisted(() => ({
  createInvite: vi.fn(),
  rotateInvite: vi.fn(),
  fetchTripShares: vi.fn(),
  fetchTripWithMembers: vi.fn(),
  upsertTripShare: vi.fn(),
  rotateTripShare: vi.fn(),
  stopTripShare: vi.fn(),
  stopAllTripShares: vi.fn(),
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

/** The card for a level, marked or not: a level that already holds a live link is named
 *  `<level> · לינק פעיל`, so an anchored prefix matches either state. */
const levelRadio = (level: keyof typeof t.share.owner.levels) =>
  screen.getByRole('radio', { name: new RegExp(`^${t.share.owner.levels[level]}`) });

describe('ShareItinerarySheet', () => {
  beforeEach(() => {
    auth.userId = ADMIN;
    api.fetchTripWithMembers.mockResolvedValue(members('admin'));
    api.createInvite.mockResolvedValue({ inviteUrl: `/join/${INVITE}` });
    api.rotateInvite.mockResolvedValue({ inviteUrl: '/join/New8Code' });
    api.fetchTripShares.mockResolvedValue([]);
    // **Echoes what it was sent**, so an assertion about what the sheet says after a save is
    // about the save and not about a fixture that always answers the same level.
    api.upsertTripShare.mockImplementation((_tripId: string, input: Record<string, unknown>) =>
      Promise.resolve({ ...config, ...input }),
    );
    api.rotateTripShare.mockResolvedValue({ ...config, code: 'New8Code', shareUrl: '/s/New8Code' });
    api.stopTripShare.mockResolvedValue(undefined);
    api.stopAllTripShares.mockResolvedValue(undefined);
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
    await screen.findByRole('button', {
      name: new RegExp(t.share.owner.actions.createAndShare),
    });

    fireEvent.click(levelRadio('full'));
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.createAndShare) }),
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

  /**
   * **THE INVERSION** (ADR-0213's tenth amendment §2). Until now, moving the level control
   * wrote to the live share immediately and the sheet announced it — the honest repair to a
   * model where one link carried the level. With one link per policy that repair is not
   * merely unnecessary, it is wrong: the control selects which link you are handing over,
   * and a URL already in somebody's hands must never change what it shows.
   */
  it('never writes to a live link when a control moves', async () => {
    api.fetchTripShares.mockResolvedValue([config]);
    renderSheet();
    await openRead();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) });

    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.summary }));
    fireEvent.click(screen.getByRole('radio', { name: t.share.owner.levels.everything }));

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.upsertTripShare).not.toHaveBeenCalled();
    expect(systemShare.shareUrlOrCopy).not.toHaveBeenCalled();
  });

  /** Selecting a level with no link yet offers to CREATE one, and still mints nothing until
   *  the press — a grant must never come from a control somebody was only looking at. */
  it('offers to create at a level with no link, and mints nothing before the press', async () => {
    api.fetchTripShares.mockResolvedValue([config]);
    renderSheet();
    await openRead();
    fireEvent.click(await screen.findByRole('radio', { name: t.share.owner.levels.summary }));

    const create = await screen.findByRole('button', {
      name: new RegExp(t.share.owner.actions.createAndShare),
    });
    expect(api.upsertTripShare).not.toHaveBeenCalled();

    fireEvent.click(create);
    await waitFor(() =>
      expect(api.upsertTripShare).toHaveBeenCalledWith('t1', {
        detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
        sensitive: NO_SENSITIVE_FIELDS,
        documentIds: [],
      }),
    );
  });

  /**
   * **The question the amendment exists to answer** (owner: _"The הכל category could have
   * different levels of detail based on what you allow, so maybe for that there could be
   * multiple different links"_). Two Everything policies are two rows, each titled by what
   * it reveals rather than by a name somebody typed.
   */
  it('lists several Everything links, each titled by its own policy', async () => {
    api.fetchTripShares.mockResolvedValue([config, operational, bare]);
    renderSheet();
    await openRead();
    await screen.findByRole('radio', { name: t.share.owner.audience.read });
    fireEvent.click(levelRadio('everything'));

    expect(
      await screen.findByText(`${t.share.owner.policy.secrets} · ${t.share.owner.policy.files(1)}`),
    ).toBeTruthy();
    expect(screen.getByText(t.share.owner.policy.none)).toBeTruthy();
    expect(document.querySelectorAll('.wp-listrow')).toHaveLength(2);
    // The switches are not on screen: this is a list of links, not a form.
    expect(
      screen.queryByRole('switch', { name: t.share.owner.privateRows.bookingSecrets.title }),
    ).toBeNull();
  });

  /** The dot says "at least one live link here" without a list and without a second screen.
   *  It is `aria-hidden` paint, so the card carries the fact in its accessible name. */
  it('marks the levels that already hold a live link', async () => {
    api.fetchTripShares.mockResolvedValue([config, operational]);
    renderSheet();
    await openRead();

    expect(
      await screen.findByRole('radio', {
        name: t.share.owner.levelLive(t.share.owner.levels.full),
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: t.share.owner.levelLive(t.share.owner.levels.everything) }),
    ).toBeTruthy();
    // Summary holds none, so it is named by its label alone.
    expect(screen.getByRole('radio', { name: t.share.owner.levels.summary })).toBeTruthy();
    expect(document.querySelectorAll('.share-level-live')).toHaveLength(2);
  });

  /**
   * **WHERE IS THE LINK** (owner, 2026-08-30, three times). Still asserted on the DOM rather
   * than argued from the source. At a level that already holds links the send unit IS the
   * list, and no form is on screen at all — which is the strongest possible answer to the
   * original report, since there is no variable-length file list left to push the link below
   * the fold.
   */
  it('puts the links themselves in the send unit at Everything, with no form in the way', async () => {
    api.fetchTripShares.mockResolvedValue([operational, bare]);
    api.fetchSnapshot.mockResolvedValue({
      documents: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, title: `קובץ ${i}` })),
    });
    renderSheet();
    await openRead();
    fireEvent.click(levelRadio('everything'));

    // `Sheet` renders through `Modal`'s portal, so the tree is on `document`, not on the
    // render's own container — which is why `screen.*` is what every other spec here uses.
    const send = await waitFor(() => {
      const found = document.querySelector('.share-send');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(send.querySelectorAll('.wp-listrow')).toHaveLength(2);
    expect(document.querySelector('.share-private')).toBeNull();
  });

  /** Composing another one puts the form ABOVE the send, because the form is what the press
   *  will create — the order is describe, then hand over. */
  it('opens the policy form above the send when composing another link', async () => {
    api.fetchTripShares.mockResolvedValue([operational]);
    renderSheet();
    await openRead();
    fireEvent.click(levelRadio('everything'));

    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.another) }),
    );

    const priv = await waitFor(() => {
      const found = document.querySelector('.share-private');
      expect(found).toBeTruthy();
      return found!;
    });
    const send = document.querySelector('.share-send')!;
    expect(priv.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.createAndShare) }),
    ).toBeTruthy();
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
    // No Everything link yet, so the level opens on its create form.
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
      screen.getByRole('button', { name: new RegExp(t.share.owner.actions.createAndShare) }),
    );

    await waitFor(() =>
      expect(api.upsertTripShare).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ documentIds: ['d1'] }),
      ),
    );
  });

  it('produces a PDF and hands it to the system, not a bare download link', async () => {
    api.fetchTripShares.mockResolvedValue([config]);
    renderSheet();
    await openRead();
    await screen.findByRole('button', { name: new RegExp(t.share.owner.actions.pdf) });

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.share.owner.actions.pdf) }));

    await waitFor(() => expect(api.fetchSharedItineraryPdf).toHaveBeenCalledWith(CODE));
    await waitFor(() => expect(systemShare.shareFileOrDownload).toHaveBeenCalledTimes(1));
  });

  it('says the link was copied when there is no native sheet, and nothing when it was shared', async () => {
    systemShare.shareUrlOrCopy.mockResolvedValue('copied');
    api.fetchTripShares.mockResolvedValue([config]);
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
    api.fetchTripShares.mockResolvedValue([config]);
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
    api.fetchTripShares.mockResolvedValue([config]);
    renderSheet();
    await openRead();

    fireEvent.click(await screen.findByRole('button', { name: t.share.owner.manage }));
    fireEvent.click(screen.getByRole('button', { name: t.share.owner.rotate }));
    // Rotation breaks a URL other people already hold, so it asks first.
    expect(screen.getByText(t.share.owner.rotateTitle)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.owner.rotateConfirm }));
    });

    expect(api.rotateTripShare).toHaveBeenCalledWith('t1', CODE);
    expect(await screen.findByText('localhost:3000/s/New8Code')).toBeTruthy();
  });

  it('confirms before it stops sharing, and returns to the not-shared state', async () => {
    api.fetchTripShares.mockResolvedValue([config]);
    renderSheet();
    await openRead();

    fireEvent.click(await screen.findByRole('button', { name: t.share.owner.manage }));
    fireEvent.click(screen.getByRole('button', { name: t.share.owner.stop }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.share.owner.stopConfirm }));
    });

    expect(api.stopTripShare).toHaveBeenCalledWith('t1', CODE);
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
      api.fetchTripShares.mockResolvedValue([config]);
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

      // One published level, so no chooser at all — a radiogroup with a single option is
      // not a choice. `הכל` is absent because nothing was published there.
      expect(screen.queryByRole('radio', { name: t.share.owner.levels.everything })).toBeNull();
      expect(screen.queryByRole('button', { name: t.share.owner.manage })).toBeNull();

      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
      );
      await waitFor(() => expect(systemShare.shareUrlOrCopy).toHaveBeenCalledTimes(1));
      // Nothing was reconfigured on their behalf — the 403 never has to happen.
      expect(api.upsertTripShare).not.toHaveBeenCalled();
    });

    /**
     * **THE REPORTED DEFECT** (owner, 2026-08-31). The sheet hid the level control from a
     * peer AND left `level` pinned at its `FULL` default, so a trip published only at
     * `תקציר` told its own travellers it was not shared — while the list this component had
     * already fetched held a live Summary link, and the primary above that line called
     * `ensureShare`, which throws for a peer before any request leaves.
     */
    it('lands on the level that holds a link, not on the pinned default', async () => {
      const summary = { ...config, code: 'SmRy1234', shareUrl: '/s/SmRy1234' };
      summary.detailLevel = SHARE_DETAIL_LEVEL.SUMMARY;
      api.fetchTripShares.mockResolvedValue([summary]);
      renderSheet();
      await openRead();

      expect(await screen.findByText(`localhost:3000/s/SmRy1234`)).toBeTruthy();
      // The two claims that contradicted each other on one screen.
      expect(screen.queryByText(t.share.owner.notShared)).toBeNull();
      expect(
        screen.queryByRole('button', { name: new RegExp(t.share.owner.actions.createAndShare) }),
      ).toBeNull();
      // …and the scope note states what THAT link shows, rather than Full's.
      expect(screen.getByText(t.share.owner.scope.summary.detail)).toBeTruthy();
    });

    it('chooses between the published levels, and only those', async () => {
      const summary = { ...config, code: 'SmRy1234', shareUrl: '/s/SmRy1234' };
      summary.detailLevel = SHARE_DETAIL_LEVEL.SUMMARY;
      api.fetchTripShares.mockResolvedValue([summary, config]);
      renderSheet();
      await openRead();

      // Every card a peer sees holds a link, so every one carries the live dot — and the dot
      // is `aria-hidden` paint, so the accessible name is `ChoiceGrid`'s `ariaLabel`
      // (ADR-0213's tenth amendment §4). Querying the bare word finds nothing, which is the
      // primitive working rather than a broken test.
      const live = (level: string) => t.share.owner.levelLive(level);
      const pick = await screen.findByRole('radio', { name: live(t.share.owner.levels.summary) });
      expect(screen.getByRole('radio', { name: live(t.share.owner.levels.full) })).toBeTruthy();
      // Never a card with no link behind it: a peer has no way to enliven one, so it would
      // be the dead control ADR-0150 §8 forbids. Asserted on the COUNT as well, because an
      // absence keyed to one name says nothing about a third card under another.
      // Scoped to the LEVEL grid: the audience fork above is a radiogroup too, so an
      // unscoped count answers 4 and means nothing.
      expect(document.querySelectorAll('.share-levels [role="radio"]')).toHaveLength(2);
      expect(
        screen.queryByRole('radio', { name: live(t.share.owner.levels.everything) }),
      ).toBeNull();

      fireEvent.click(pick);
      expect(await screen.findByText(`localhost:3000/s/SmRy1234`)).toBeTruthy();

      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
      );
      await waitFor(() => expect(systemShare.shareUrlOrCopy).toHaveBeenCalledTimes(1));
      expect(api.upsertTripShare).not.toHaveBeenCalled();
    });

    it('offers nothing to press on a trip with no links, and says who can make one', async () => {
      api.fetchTripShares.mockResolvedValue([]);
      renderSheet();
      await openRead();

      await screen.findByText(t.share.owner.notShared);
      // Not both lines: with nothing published there is no link for `peerNote` to describe.
      expect(screen.queryByText(t.share.owner.peerNote)).toBeNull();
      expect(
        screen.queryByRole('button', { name: new RegExp(t.share.owner.actions.createAndShare) }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: new RegExp(t.share.owner.actions.liveLink) }),
      ).toBeNull();
    });

    /** The owner's own reading of "maybe everything is made available by the admins, after
     *  they've created links for them": creating an Everything link WITH its switches on is
     *  the decision that the policy may be sent. The service already agrees — only create,
     *  rotate and revoke are `assertTripAdmin`'s — so refusing here would be the sheet lying
     *  about the API under it. */
    it('may send an Everything link, without the ⋯ that manages it', async () => {
      api.fetchTripShares.mockResolvedValue([operational, bare]);
      renderSheet();
      await openRead();

      await screen.findByText(`${t.share.owner.policy.secrets} · ${t.share.owner.policy.files(1)}`);
      expect(screen.getByText(t.share.owner.policy.none)).toBeTruthy();
      expect(screen.getAllByRole('button', { name: t.share.owner.sendLink })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: t.share.owner.manageLink })).toBeNull();
      expect(
        screen.queryByRole('button', { name: new RegExp(t.share.owner.actions.another) }),
      ).toBeNull();
    });
  });
});
