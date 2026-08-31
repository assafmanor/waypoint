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
  fetchTripShares,
  fetchTripWithMembers,
  rotateInvite,
  rotateTripShare,
  stopAllTripShares,
  stopTripShare,
  upsertTripShare,
} from '../lib/api';
import { inviteLink, publicAppLink } from '../lib/invite-link';
import { shareFileOrDownload, shareUrlOrCopy } from '../lib/system-share';
import { CONTROL_ICON } from '../constants';
import { useToast } from './Toast';
import { Icon } from './Icon';
import { TripLinkRow } from './TripLinkRow';
import { ListRow, RowManageSheet, type RowAction } from './domain/ListRow';
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

const isEverything = (level: ShareDetailLevel) => level === SHARE_DETAIL_LEVEL.EVERYTHING;

/**
 * **What a link reveals, in the app's `·` grammar** (ADR-0213's tenth amendment §4).
 *
 * Derived, never typed. A title the app composes from the policy is checkable — it is
 * exactly what this link publishes — where a name somebody entered says who received it,
 * which nothing can verify and which goes stale in silence. Below Everything the level is
 * the whole policy, so the level's own word is the title.
 */
function policyLabel(config: TripShareConfig): string {
  if (!isEverything(config.detailLevel)) return t.share.owner.levels[config.detailLevel];
  const parts: string[] = [];
  if (config.sensitive.bookingSecrets) parts.push(t.share.owner.policy.secrets);
  if (config.sensitive.notesAndTasks) parts.push(t.share.owner.policy.notes);
  if (config.sensitive.travelerIdentity) parts.push(t.share.owner.policy.travelers);
  if (config.documentIds.length > 0)
    parts.push(t.share.owner.policy.files(config.documentIds.length));
  return parts.length > 0 ? parts.join(' · ') : t.share.owner.policy.none;
}

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
 * **One sheet, two entry points, and one link per POLICY** (ADR-0213's tenth amendment).
 *
 * The short path is unchanged: pick a level, then press Live Link or PDF. There is no Save —
 * the first outcome press performs the idempotent `PUT` itself, which is why the API had to
 * be idempotent, and why the same policy twice returns the same code.
 *
 * **Nothing here mutates a live link.** That is the amendment's whole point, and it is why
 * the debounced `upsertTripShare` effect and its `הלינק החי מעודכן` announcement are gone:
 * moving the level control, or a sensitive switch, selects the policy you are about to hand
 * over. A URL already in somebody's hands never changes what it shows.
 *
 * The body is asymmetric because the policy space is. Summary and Full have exactly one
 * policy each, so they keep the single loud send unit. Everything is a family — `2^3`
 * switch combinations times every subset of the files — so it renders `ListRow`/
 * `RowManageSheet`, the app's managed-list primitive, once a link exists.
 *
 * A peer sees the live links and both outcomes but no configuration: sharing is what the
 * group does, while changing what the world sees is the admin's. That split lives in the
 * service; this only refuses to draw controls that would 403.
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
  const [shares, setShares] = useState<TripShareConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<ShareDetailLevel>(SHARE_DETAIL_LEVEL.FULL);
  const [sensitive, setSensitive] = useState<ShareSensitiveFields>(NO_SENSITIVE_FIELDS);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentChoice[] | undefined>();
  const [busy, setBusy] = useState<'link' | 'pdf' | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  // The Everything create form. Open by default only when there is nothing to list yet —
  // otherwise a second link is an explicit act, not the screen you land on.
  const [composing, setComposing] = useState(false);
  const [managing, setManaging] = useState<TripShareConfig | undefined>();
  // The quiet disclosure under a single-policy level, exactly as it shipped: link
  // management is not a screen somebody has to visit before they can send a trip.
  const [manageOpen, setManageOpen] = useState(false);
  const [confirming, setConfirming] = useState<
    | { kind: 'rotate' | 'stop'; config: TripShareConfig }
    | { kind: 'stop-all' | 'invite-rotate' }
    | undefined
  >();

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
    // **A failed read says so, rather than reading as "not shared".** Under one link a
    // swallowed error and an absent share looked the same and mostly were; with a list they
    // are opposite claims, and the wrong one is the dangerous direction — an owner told
    // nothing is published while three links are live.
    void fetchTripShares(tripId)
      .then((existing) => live && setShares(existing))
      .catch(() => live && setError(t.share.owner.failed))
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
    if (!isEverything(level) || documents || !isAdmin) return;
    void fetchSnapshot(tripId)
      .then((snapshot) =>
        setDocuments(
          snapshot.documents.map((document) => ({ id: document.id, title: document.title })),
        ),
      )
      .catch(() => setDocuments([]));
  }, [level, documents, isAdmin, tripId]);

  const atLevel = useMemo(
    () => shares.filter((config) => config.detailLevel === level),
    [shares, level],
  );
  /** Summary and Full hold at most one, so "the link at this level" is a fact about them. */
  const single = isEverything(level) ? undefined : atLevel[0];

  /** The policy the controls currently describe — what a send would hand over. */
  const draft = useMemo(
    () => ({
      detailLevel: level,
      sensitive: isEverything(level) ? sensitive : NO_SENSITIVE_FIELDS,
      documentIds: isEverything(level) ? [...documentIds].sort() : [],
    }),
    [documentIds, level, sensitive],
  );

  const remember = useCallback((next: TripShareConfig) => {
    setShares((prev) => [...prev.filter((config) => config.code !== next.code), next]);
    return next;
  }, []);

  /** Persist the drafted policy and hand back its link. Idempotent: an existing policy
   *  returns its own code rather than minting a second URL. */
  const ensureShare = useCallback(async (): Promise<TripShareConfig> => {
    if (!isAdmin) {
      const existing = single ?? atLevel[0];
      if (!existing) throw new Error('not shared');
      return existing;
    }
    return remember(await upsertTripShare(tripId, draft));
  }, [atLevel, draft, isAdmin, remember, single, tripId]);

  const run = useCallback(async (kind: 'link' | 'pdf', action: () => Promise<void>) => {
    setBusy(kind);
    setError(undefined);
    setNote(undefined);
    try {
      await action();
    } catch {
      setError(t.share.owner.failed);
    } finally {
      setBusy(undefined);
    }
  }, []);

  const sendLink = (config: TripShareConfig) =>
    run('link', async () => {
      const outcome = await shareUrlOrCopy({
        title: tripName,
        text: tripName,
        url: `https://${publicAppLink(config.shareUrl)}`,
      });
      if (outcome === 'copied') setNote(t.share.owner.copied);
    });

  const sendPdf = (config: TripShareConfig) =>
    run('pdf', async () => {
      const blob = await fetchSharedItineraryPdf(config.code);
      await shareFileOrDownload(new File([blob], `${tripName}.pdf`, { type: 'application/pdf' }));
    });

  /** Create-or-find the drafted policy, then hand it over. The press is what publishes —
   *  opening the sheet, or moving a control somebody was only looking at, never does. */
  const createAndSend = () =>
    run('link', async () => {
      const config = await ensureShare();
      setComposing(false);
      const outcome = await shareUrlOrCopy({
        title: tripName,
        text: tripName,
        url: `https://${publicAppLink(config.shareUrl)}`,
      });
      if (outcome === 'copied') setNote(t.share.owner.copied);
    });

  const createAndPdf = () =>
    run('pdf', async () => {
      const config = await ensureShare();
      setComposing(false);
      const blob = await fetchSharedItineraryPdf(config.code);
      await shareFileOrDownload(new File([blob], `${tripName}.pdf`, { type: 'application/pdf' }));
    });

  const copyToClipboard = (config: TripShareConfig) => {
    void navigator.clipboard?.writeText(publicAppLink(config.shareUrl));
    toast(CONTROL_ICON.clipboard, t.share.owner.copied);
  };

  const shareInvite = () =>
    void shareUrlOrCopy({ title: tripName, text: tripName, url: `https://${invite}` }).then(
      (outcome) => outcome === 'copied' && setNote(t.share.owner.copied),
    );

  const copyInvite = () => {
    if (invite) void navigator.clipboard?.writeText(invite);
    toast(CONTROL_ICON.clipboard, t.share.owner.copied);
  };

  const scope = t.share.owner.scope[level];
  /**
   * The level row, each card marked when it already holds a live link — which is how "what
   * is exposed right now" is answered at a glance, with no list and no second screen. The
   * mark is `aria-hidden` paint, so the card carries the fact in its accessible name
   * instead (`ChoiceGrid`'s `ariaLabel`).
   */
  const levelOptions = useMemo(
    () =>
      LEVELS.map((value) => {
        const live = shares.some((config) => config.detailLevel === value);
        return {
          value,
          icon: '',
          label: t.share.owner.levels[value],
          ...(live
            ? {
                mark: <span className="share-level-live" aria-hidden="true" />,
                ariaLabel: t.share.owner.levelLive(t.share.owner.levels[value]),
              }
            : {}),
        };
      }),
    [shares],
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

  const liveNote = isEverything(level)
    ? atLevel.length === 0
      ? t.share.owner.noLinkYet
      : atLevel.length === 1
        ? t.share.owner.oneLive
        : t.share.owner.manyLive(atLevel.length)
    : single
      ? t.share.owner.liveNote
      : t.share.owner.noLinkYet;

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

      {/* Rotating the invite is the admin's, exactly as rotating a read-only link is —
          and for the same reason: sending an existing link is what the group does. */}
      {isAdmin && invite ? (
        <div className="share-manage-actions">
          <button
            type="button"
            className="share-manage"
            onClick={() => setConfirming({ kind: 'invite-rotate' })}
          >
            {t.share.owner.join.rotate}
          </button>
        </div>
      ) : null}
    </>
  );

  /** The switches and per-file checkboxes: a POLICY being described, not a live link being
   *  edited. Nothing here writes until a send. */
  const policyForm = (
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
      {/* Each file is chosen by name. "Share my documents" is a promise nobody can check
          later, which is why there is no switch for the family as a whole. */}
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
  );

  const outcomes = (onLink: () => void, onPdf: () => void, linkLabel: string) => (
    <div className="share-outcomes">
      <button
        type="button"
        className="share-outcome primary"
        onClick={onLink}
        disabled={busy !== undefined || loading}
      >
        <Icon name="share" />
        {linkLabel}
      </button>
      <button
        type="button"
        className="share-outcome"
        onClick={onPdf}
        disabled={busy !== undefined || loading}
      >
        <Icon name="download" />
        {busy === 'pdf' ? t.share.owner.pdf.preparing : t.share.owner.actions.pdf}
      </button>
    </div>
  );

  /** One policy, one link: the sheet's one loud element, unchanged from what ships. */
  const singleBranch = single ? (
    <div className="share-send">
      <TripLinkRow url={publicAppLink(single.shareUrl)} onCopy={() => copyToClipboard(single)} />
      {outcomes(
        () => sendLink(single),
        () => sendPdf(single),
        t.share.owner.actions.liveLink,
      )}
    </div>
  ) : (
    <div className="share-send">
      {outcomes(createAndSend, createAndPdf, t.share.owner.actions.createAndShare)}
    </div>
  );

  /**
   * Everything is a family, so once a link exists the branch is a managed list — you must
   * be able to find and revoke the second of three. The rows sit inside `.share-send`,
   * which is already a raised `overflow: hidden` container, and `.wp-listrow` already draws
   * its own hairline: the list costs no stylesheet.
   */
  const manyBranch =
    composing || atLevel.length === 0 ? (
      <>
        {isAdmin ? policyForm : null}
        <div className="share-send">
          {outcomes(createAndSend, createAndPdf, t.share.owner.actions.createAndShare)}
        </div>
      </>
    ) : (
      <div className="share-send">
        {atLevel.map((config) => (
          <ListRow
            key={config.code}
            title={policyLabel(config)}
            meta={
              <span dir="auto" className="share-link">
                {publicAppLink(config.shareUrl)}
              </span>
            }
            onOpen={() => sendLink(config)}
            openLabel={t.share.owner.sendLink}
            {...(isAdmin
              ? { onManage: () => setManaging(config), manageLabel: t.share.owner.manageLink }
              : {})}
          />
        ))}
        {isAdmin ? (
          <div className="share-outcomes is-single">
            <button
              type="button"
              className="share-outcome"
              onClick={() => setComposing(true)}
              disabled={busy !== undefined}
            >
              <Icon name="share" />
              {t.share.owner.actions.another}
            </button>
          </div>
        ) : null}
      </div>
    );

  const manageActions = (config: TripShareConfig): RowAction[] => [
    { label: t.share.owner.actions.liveLink, icon: 'share', onSelect: () => void sendLink(config) },
    { label: t.share.owner.copyLink, icon: 'clipboard', onSelect: () => copyToClipboard(config) },
    { label: t.share.owner.actions.pdf, icon: 'download', onSelect: () => void sendPdf(config) },
    {
      label: t.share.owner.rotate,
      icon: 'link',
      onSelect: () => setConfirming({ kind: 'rotate', config }),
    },
    {
      label: t.share.owner.stop,
      icon: 'lock',
      danger: true,
      onSelect: () => setConfirming({ kind: 'stop', config }),
    },
  ];

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
                    onChange={(next) => {
                      setLevel(next);
                      setComposing(false);
                    }}
                    columns={3}
                    ariaLabel={t.share.owner.lead}
                    disabled={busy !== undefined}
                    className="share-levels"
                  />
                </>
              ) : null}

              <div className="share-scope-note">
                <strong>{scope.title}</strong>
                <span>{scope.detail}</span>
                <span className="share-scope-live">
                  <Icon name="link" />
                  {liveNote}
                </span>
              </div>
            </div>

            {isEverything(level) ? manyBranch : singleBranch}

            {note ? <div className="share-live-note">{note}</div> : null}
            {error ? <div className="share-error">{error}</div> : null}
            {!isAdmin ? <p className="share-lead">{t.share.owner.peerNote}</p> : null}
            {!isAdmin && shares.length === 0 && !loading && !error ? (
              <p className="share-lead">{t.share.owner.notShared}</p>
            ) : null}

            {/* Per-link management for the single-policy levels; Everything's rows carry
                their own `⋯`. */}
            {isAdmin && single ? (
              manageOpen ? (
                <div className="share-manage-actions">
                  <button
                    type="button"
                    className="share-manage"
                    onClick={() => setConfirming({ kind: 'rotate', config: single })}
                  >
                    {t.share.owner.rotate}
                  </button>
                  <button
                    type="button"
                    className="share-manage"
                    onClick={() => setConfirming({ kind: 'stop', config: single })}
                  >
                    {t.share.owner.stop}
                  </button>
                </div>
              ) : (
                <button type="button" className="share-manage" onClick={() => setManageOpen(true)}>
                  {t.share.owner.manage}
                </button>
              )
            ) : null}

            {/* Only at two or more: with one live link the button beside it already stops
                everything, and two controls doing the same thing is how the wrong one is
                pressed. */}
            {isAdmin && shares.length > 1 ? (
              <div className="share-manage-actions">
                <button
                  type="button"
                  className="share-manage share-stop-all"
                  onClick={() => setConfirming({ kind: 'stop-all' })}
                >
                  {t.share.owner.stopAll(shares.length)}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {managing ? (
        <RowManageSheet
          title={policyLabel(managing)}
          subject={publicAppLink(managing.shareUrl)}
          actions={manageActions(managing)}
          onClose={() => setManaging(undefined)}
        />
      ) : null}

      {confirming?.kind === 'rotate' ? (
        <ConfirmDialog
          tone="neutral"
          title={t.share.owner.rotateTitle}
          body={t.share.owner.rotateBody}
          confirmLabel={t.share.owner.rotateConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            const stale = confirming.config;
            setConfirming(undefined);
            setManaging(undefined);
            void rotateTripShare(tripId, stale.code)
              .then((next) =>
                setShares((prev) => [...prev.filter((config) => config.code !== stale.code), next]),
              )
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
      {confirming?.kind === 'stop' ? (
        <ConfirmDialog
          tone="danger"
          title={t.share.owner.stopTitle}
          body={t.share.owner.stopBody}
          confirmLabel={t.share.owner.stopConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            const stale = confirming.config;
            setConfirming(undefined);
            setManaging(undefined);
            void stopTripShare(tripId, stale.code)
              .then(() => {
                setShares((prev) => prev.filter((config) => config.code !== stale.code));
                setManageOpen(false);
              })
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
      {confirming?.kind === 'stop-all' ? (
        <ConfirmDialog
          tone="danger"
          title={t.share.owner.stopAllTitle}
          body={t.share.owner.stopAllBody}
          confirmLabel={t.share.owner.stopAllConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            setConfirming(undefined);
            void stopAllTripShares(tripId)
              .then(() => {
                setShares([]);
                setComposing(false);
                setManageOpen(false);
              })
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
      {confirming?.kind === 'invite-rotate' ? (
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
    </Sheet>
  );
}
