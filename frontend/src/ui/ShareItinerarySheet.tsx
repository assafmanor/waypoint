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
  fetchSharedItineraryPdf,
  fetchSnapshot,
  fetchTripShare,
  fetchTripWithMembers,
  rotateTripShare,
  stopTripShare,
  upsertTripShare,
} from '../lib/api';
import { publicAppLink } from '../lib/invite-link';
import { shareFileOrDownload, shareUrlOrCopy } from '../lib/system-share';
import { Icon } from './Icon';
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
  const [confirming, setConfirming] = useState<'rotate' | 'stop' | undefined>();

  const myUserId = useAuth().me?.user.id;

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

  const scope = t.share.owner.scope[level];
  const levelOptions = useMemo(
    () => LEVELS.map((value) => ({ value, icon: '', label: t.share.owner.levels[value] })),
    [],
  );

  return (
    <Sheet title={t.share.owner.title} onClose={onClose}>
      <div className="modal-form share-sheet">
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

        <div className="share-live-note">
          <Icon name="link" />
          {t.share.owner.liveNote}
        </div>

        {link ? (
          <div className="share-link" dir="auto">
            {link}
          </div>
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
              <button type="button" className="share-manage" onClick={() => setConfirming('stop')}>
                {t.share.owner.stop}
              </button>
            </div>
          ) : (
            <button type="button" className="share-manage" onClick={() => setManage(true)}>
              {t.share.owner.manage}
            </button>
          )
        ) : null}
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
