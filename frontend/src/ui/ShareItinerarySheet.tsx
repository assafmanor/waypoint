import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type ShareDetailLevel,
  type ShareSensitiveFields,
  type TripShareConfig,
} from '@waypoint/shared';
import { MEMBERSHIP_ROLE } from '@waypoint/shared';
import { t } from '../i18n/he';
import { useAuth } from '../state/auth-state';
import {
  createInvite,
  fetchSharedItineraryPdf,
  fetchSnapshot,
  fetchTripShare,
  fetchTripWithMembers,
  rotateInvite,
  rotateTripShare,
  stopTripShare,
  upsertTripShare,
} from '../lib/api';
import { inviteLink, publicAppLink } from '../lib/invite-link';
import { shareFileOrDownload, shareUrlOrCopy } from '../lib/system-share';
import { CONTROL_ICON } from '../constants';
import { useToast } from './Toast';
import { Icon } from './Icon';
import { TripLinkRow } from './TripLinkRow';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { Switch } from './primitives/Switch';
import { Sheet } from './Sheet';

type SensitiveKey = keyof ShareSensitiveFields;

const LEVELS: ShareDetailLevel[] = [
  SHARE_DETAIL_LEVEL.SUMMARY,
  SHARE_DETAIL_LEVEL.FULL,
  SHARE_DETAIL_LEVEL.EVERYTHING,
];

const SENSITIVE_KEYS: SensitiveKey[] = ['bookingSecrets', 'notesAndTasks', 'travelerIdentity'];

/**
 * **The two grants a trip link can carry, and the sheet's first question** (ADR-0213's
 * 2026-08-30 amendment).
 *
 * `join` adds a person to the roster — full live data, edit rights, a `Membership`
 * (ADR-0067). `read` hands a stranger a revocable projection and no account. They are not
 * two formats of one thing, which is exactly why the audience is asked ABOVE everything
 * else rather than offered as a third button beside `לינק חי` and `PDF`: those two ARE two
 * formats of one grant, and a row of three would teach that all three are interchangeable.
 * The cost of that lesson is not symmetric — a peek can be revoked, a person in the trip is
 * in it.
 */
const AUDIENCE = { JOIN: 'join', READ: 'read' } as const;
type Audience = (typeof AUDIENCE)[keyof typeof AUDIENCE];

interface DocumentChoice {
  id: string;
  title: string;
}

/**
 * **One sheet, two entry points, two peer outcomes** (ADR-0213).
 *
 * The short path is the whole design: pick how much to reveal, then press Live Link or PDF.
 * There is no Save — the first outcome press performs the idempotent `PUT` itself, which is
 * why the API had to be idempotent. Link management is a quiet disclosure underneath, not a
 * screen somebody has to visit before they can send a trip to their sister.
 *
 * A peer sees the link and both outcomes but no configuration: sharing is what the group
 * does, while changing what the world sees is the admin's. That split lives in the service;
 * this only refuses to draw controls that would 403.
 *
 * The document list is fetched **lazily, and only at Everything** — the authenticated trip
 * snapshot is a large read, and somebody sending a Summary link should never pay for it.
 */
export function ShareItinerarySheet({
  tripId,
  tripName,
  onClose,
}: {
  tripId: string;
  tripName: string;
  onClose: () => void;
}) {
  // Resolved here rather than passed in, because the two entries know different things: the
  // trip header already holds the roster, an All Trips card holds only a `Trip`. One small
  // read makes both callers identical instead of one of them fetching on the other's behalf.
  const [isAdmin, setIsAdmin] = useState(false);
  // Join is the default: it is the common audience for a live trip, and it is the one that
  // could not be reached at all without leaving this screen for Trip Settings.
  const [audience, setAudience] = useState<Audience>(AUDIENCE.JOIN);
  const [invite, setInvite] = useState<string | undefined>();
  const [config, setConfig] = useState<TripShareConfig | undefined>();
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<ShareDetailLevel>(SHARE_DETAIL_LEVEL.FULL);
  const [sensitive, setSensitive] = useState<ShareSensitiveFields>(NO_SENSITIVE_FIELDS);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentChoice[] | undefined>();
  const [busy, setBusy] = useState<'link' | 'pdf' | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [manage, setManage] = useState(false);
  const [confirming, setConfirming] = useState<'rotate' | 'stop' | 'invite-rotate' | undefined>();

  const myUserId = useAuth().me?.user.id;
  const toast = useToast();

  useEffect(() => {
    let live = true;
    void fetchTripWithMembers(tripId)
      .then(
        ({ members }) =>
          live &&
          setIsAdmin(
            members.some(
              (member) => member.userId === myUserId && member.role === MEMBERSHIP_ROLE.ADMIN,
            ),
          ),
      )
      .catch(() => undefined);
    void fetchTripShare(tripId)
      .then((existing) => {
        if (!live) return;
        setConfig(existing);
        if (existing) {
          setLevel(existing.detailLevel);
          setSensitive(existing.sensitive);
          setDocumentIds(existing.documentIds);
        }
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tripId, myUserId]);

  // **Get-or-create, once, for whoever opened the sheet** (ADR-0067). Join is the default
  // branch, so opening the sheet mints an `Invite` row for a trip that has never had one —
  // which is the same act Trip Settings' `הצגת הלינק` already performed, and no more of a
  // grant: the code is unreachable until somebody sends it. Guarded on `invite` rather than
  // on the branch, so crossing the fork twice is not a second write.
  useEffect(() => {
    if (audience !== AUDIENCE.JOIN || invite) return;
    let live = true;
    void createInvite(tripId)
      .then((res) => live && setInvite(inviteLink(res.inviteUrl)))
      .catch(() => live && setError(t.share.owner.failed));
    return () => {
      live = false;
    };
  }, [audience, invite, tripId]);

  // Only Everything needs the file list, and only once.
  useEffect(() => {
    if (level !== SHARE_DETAIL_LEVEL.EVERYTHING || documents || !isAdmin) return;
    void fetchSnapshot(tripId)
      .then((snapshot) =>
        setDocuments(
          snapshot.documents.map((document) => ({ id: document.id, title: document.title })),
        ),
      )
      .catch(() => setDocuments([]));
  }, [level, documents, isAdmin, tripId]);

  const link = config ? publicAppLink(config.shareUrl) : undefined;

  /** Persist the current draft and hand back the live config. A peer never reaches this —
   *  they have no controls to change, so their outcome presses use what already exists. */
  const ensureShare = useCallback(async (): Promise<TripShareConfig> => {
    if (!isAdmin) {
      if (!config) throw new Error('not shared');
      return config;
    }
    const everything = level === SHARE_DETAIL_LEVEL.EVERYTHING;
    const next = await upsertTripShare(tripId, {
      detailLevel: level,
      sensitive: everything ? sensitive : NO_SENSITIVE_FIELDS,
      documentIds: everything ? documentIds : [],
    });
    setConfig(next);
    return next;
  }, [config, documentIds, isAdmin, level, sensitive, tripId]);

  const run = useCallback(
    async (kind: 'link' | 'pdf', action: (config: TripShareConfig) => Promise<void>) => {
      setBusy(kind);
      setError(undefined);
      setNote(undefined);
      try {
        await action(await ensureShare());
      } catch {
        setError(t.share.owner.failed);
      } finally {
        setBusy(undefined);
      }
    },
    [ensureShare],
  );

  const shareLink = () =>
    run('link', async (live) => {
      const outcome = await shareUrlOrCopy({
        title: tripName,
        text: tripName,
        url: `https://${publicAppLink(live.shareUrl)}`,
      });
      if (outcome === 'copied') setNote(t.share.owner.copied);
    });

  const sharePdf = () =>
    run('pdf', async (live) => {
      const blob = await fetchSharedItineraryPdf(live.code);
      await shareFileOrDownload(new File([blob], `${tripName}.pdf`, { type: 'application/pdf' }));
    });

  const shareInvite = () =>
    void shareUrlOrCopy({ title: tripName, text: tripName, url: `https://${invite}` }).then(
      (outcome) => outcome === 'copied' && setNote(t.share.owner.copied),
    );

  const copyInvite = () => {
    if (invite) void navigator.clipboard?.writeText(invite);
    toast(CONTROL_ICON.clipboard, t.share.owner.copied);
  };

  const scope = t.share.owner.scope[level];
  const levelOptions = useMemo(
    () => LEVELS.map((value) => ({ value, icon: '', label: t.share.owner.levels[value] })),
    [],
  );
  // **Marked, where the level cards are not** — this is the one choice in the sheet whose
  // wrong answer cannot be taken back, so it gets a second channel besides its words. They
  // are `Icon`s and not emoji: a glyph on a control, in a sheet whose siblings already draw
  // SVG, is a control (design-language, ADR-0138's 2026-08-01 amendment).
  const audienceOptions = useMemo(
    () => [
      {
        value: AUDIENCE.JOIN,
        icon: '',
        lead: <Icon name="members" />,
        label: t.share.owner.audience.join,
      },
      {
        value: AUDIENCE.READ,
        icon: '',
        lead: <Icon name="eye" />,
        label: t.share.owner.audience.read,
      },
    ],
    [],
  );

  const joinBranch = (
    <>
      {/* **What the link is and how to send it are one group**, 8px apart, while the
          audience question above sits 16px away — the rhythm says which blocks belong
          together before a word is read. And the live fact lives INSIDE the explainer: a
          bordered box followed by a floating hint is two blocks about the same link. */}
      <div className="share-group">
        <div className="share-scope-note">
          <strong>{t.share.owner.join.scope.title}</strong>
          <span>{t.share.owner.join.scope.detail}</span>
          <span className="share-scope-live">
            <Icon name="link" />
            {t.share.owner.join.note}
          </span>
        </div>

        {/* The link and what you do with it are ONE object — the sheet's single prominent
            element, with everything above it the quiet that earns it. */}
        <div className="share-send">
          {invite ? <TripLinkRow url={invite} onCopy={copyInvite} /> : null}
          <div className="share-outcomes is-single">
            <button
              type="button"
              className="share-outcome primary"
              onClick={shareInvite}
              disabled={!invite}
            >
              <Icon name="share" />
              {t.share.owner.join.action}
            </button>
          </div>
        </div>
      </div>

      {note ? <div className="share-live-note">{note}</div> : null}
      {error ? <div className="share-error">{error}</div> : null}

      {/* Rotating the invite is the admin's, exactly as rotating the read-only link is —
          and for the same reason: sending an existing link is what the group does. */}
      {isAdmin && invite ? (
        <div className="share-manage-actions">
          <button
            type="button"
            className="share-manage"
            onClick={() => setConfirming('invite-rotate')}
          >
            {t.share.owner.join.rotate}
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <Sheet title={t.share.owner.title} onClose={onClose}>
      <div className="modal-form share-sheet">
        <div className="share-group">
          <p className="share-lead">{t.share.owner.audience.lead}</p>
          <ChoiceGrid
            options={audienceOptions}
            value={audience}
            onChange={setAudience}
            columns={2}
            ariaLabel={t.share.owner.audience.lead}
            disabled={busy !== undefined}
            className="share-audience"
          />
        </div>

        {audience === AUDIENCE.JOIN ? (
          joinBranch
        ) : (
          <>
            {/* The explainer belongs to the choice that produced it: it states what THIS
                level shows, so it is the level group's last line, not a block of its own. */}
            <div className="share-group">
              {isAdmin ? (
                <>
                  <p className="share-lead">{t.share.owner.lead}</p>
                  <ChoiceGrid
                    options={levelOptions}
                    value={level}
                    onChange={setLevel}
                    columns={3}
                    ariaLabel={t.share.owner.lead}
                    disabled={busy !== undefined}
                  />
                </>
              ) : null}

              <div className="share-scope-note">
                <strong>{scope.title}</strong>
                <span>{scope.detail}</span>
                <span className="share-scope-live">
                  <Icon name="link" />
                  {t.share.owner.liveNote}
                </span>
              </div>
            </div>

            {isAdmin && level === SHARE_DETAIL_LEVEL.EVERYTHING ? (
              <div className="share-private">
                {SENSITIVE_KEYS.map((key) => (
                  <div className="share-private-row" key={key}>
                    <span className="share-private-copy">
                      <strong>{t.share.owner.privateRows[key].title}</strong>
                      <span>{t.share.owner.privateRows[key].detail}</span>
                    </span>
                    <Switch
                      checked={sensitive[key]}
                      onChange={(next) => setSensitive((prev) => ({ ...prev, [key]: next }))}
                      ariaLabel={t.share.owner.privateRows[key].title}
                    />
                  </div>
                ))}
                <div className="share-private-row">
                  <span className="share-private-copy">
                    <strong>{t.share.owner.privateRows.documents.title}</strong>
                    <span>{t.share.owner.privateRows.documents.detail}</span>
                  </span>
                </div>
                {/* Each file is chosen by name. "Share my documents" is a promise nobody can
                check later, which is why there is no switch for the family as a whole. */}
                <div className="share-files">
                  {documents === undefined ? null : documents.length === 0 ? (
                    <span className="share-file-empty">{t.share.owner.noDocuments}</span>
                  ) : (
                    documents.map((document) => (
                      <label className="share-file" key={document.id}>
                        <input
                          type="checkbox"
                          checked={documentIds.includes(document.id)}
                          onChange={(event) =>
                            setDocumentIds((prev) =>
                              event.target.checked
                                ? [...prev, document.id]
                                : prev.filter((id) => id !== document.id),
                            )
                          }
                        />
                        <span dir="auto">{document.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {/* The same send unit as the invite branch — one block, two outcomes instead of
            one, because a read-only link has a second format and a membership has none. */}
            <div className="share-send">
              {link ? (
                <TripLinkRow
                  url={link}
                  onCopy={() => {
                    void navigator.clipboard?.writeText(link);
                    toast(CONTROL_ICON.clipboard, t.share.owner.copied);
                  }}
                />
              ) : null}
              <div className="share-outcomes">
                <button
                  type="button"
                  className="share-outcome primary"
                  onClick={shareLink}
                  disabled={busy !== undefined || loading || (!isAdmin && !config)}
                >
                  <Icon name="share" />
                  {t.share.owner.actions.liveLink}
                </button>
                <button
                  type="button"
                  className="share-outcome"
                  onClick={sharePdf}
                  disabled={busy !== undefined || loading || (!isAdmin && !config)}
                >
                  <Icon name="download" />
                  {busy === 'pdf' ? t.share.owner.pdf.preparing : t.share.owner.actions.pdf}
                </button>
              </div>
            </div>

            {note ? <div className="share-live-note">{note}</div> : null}
            {error ? <div className="share-error">{error}</div> : null}
            {!isAdmin ? <p className="share-lead">{t.share.owner.peerNote}</p> : null}
            {!isAdmin && !config && !loading ? (
              <p className="share-lead">{t.share.owner.notShared}</p>
            ) : null}

            {isAdmin && config ? (
              manage ? (
                <div className="share-manage-actions">
                  <button
                    type="button"
                    className="share-manage"
                    onClick={() => setConfirming('rotate')}
                  >
                    {t.share.owner.rotate}
                  </button>
                  <button
                    type="button"
                    className="share-manage"
                    onClick={() => setConfirming('stop')}
                  >
                    {t.share.owner.stop}
                  </button>
                </div>
              ) : (
                <button type="button" className="share-manage" onClick={() => setManage(true)}>
                  {t.share.owner.manage}
                </button>
              )
            ) : null}
          </>
        )}
      </div>

      {confirming === 'rotate' ? (
        <ConfirmDialog
          tone="neutral"
          title={t.share.owner.rotateTitle}
          body={t.share.owner.rotateBody}
          confirmLabel={t.share.owner.rotateConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            setConfirming(undefined);
            void rotateTripShare(tripId)
              .then(setConfig)
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
      {confirming === 'invite-rotate' ? (
        <ConfirmDialog
          tone="neutral"
          title={t.share.owner.join.rotateTitle}
          body={t.share.owner.join.rotateBody}
          confirmLabel={t.share.owner.join.rotateConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            setConfirming(undefined);
            void rotateInvite(tripId)
              .then((res) => {
                setInvite(inviteLink(res.inviteUrl));
                toast(CONTROL_ICON.done, t.share.owner.join.rotated);
              })
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
      {confirming === 'stop' ? (
        <ConfirmDialog
          tone="danger"
          title={t.share.owner.stopTitle}
          body={t.share.owner.stopBody}
          confirmLabel={t.share.owner.stopConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            setConfirming(undefined);
            void stopTripShare(tripId)
              .then(() => {
                setConfig(undefined);
                setManage(false);
              })
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
    </Sheet>
  );
}
