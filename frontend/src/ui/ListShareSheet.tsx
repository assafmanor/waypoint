// **A list's own sheet** (ADR-0242 §2): one link and one action, built from the share sheet's
// parts. The scope is the whole policy, so there are no levels and no switches; the note says
// in words what crosses and what does not.
import { useState } from 'react';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type EventCategory,
  type TripShareConfig,
} from '@waypoint/shared';
import { CONTROL_ICON } from '../constants';
import { t } from '../i18n/he';
import { stopTripShare, upsertTripShare } from '../lib/api';
import { publicAppLink, publicAppUrl } from '../lib/invite-link';
import { shareUrlOrCopy } from '../lib/system-share';
import { Icon } from './Icon';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { TripLinkRow } from './TripLinkRow';

/** The one policy a list is: Summary, nothing sensitive, one kind. */
export const listPolicy = (category: EventCategory) => ({
  detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
  sensitive: NO_SENSITIVE_FIELDS,
  documentIds: [],
  scope: { category },
});

export function ListShareSheet({
  tripId,
  tripName,
  category,
  count,
  link,
  isAdmin,
  onLink,
  onClose,
}: {
  tripId: string;
  tripName: string;
  category: EventCategory;
  /** How many places the list holds: the rows the search shows, which are the rows it sends. */
  count: number;
  /** The list's live link, when there is one. */
  link: TripShareConfig | undefined;
  isAdmin: boolean;
  /** The link as it now is: created, or `undefined` once stopped. */
  onLink: (link: TripShareConfig | undefined) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const toast = useToast();
  const listName = t.share.list.name[category];

  const send = async () => {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      // Create-or-find, as the share sheet does: the press is what publishes.
      const config = link ?? (await upsertTripShare(tripId, listPolicy(category)));
      if (!link) onLink(config);
      const title = `${listName} · ${tripName}`;
      const outcome = await shareUrlOrCopy({
        title,
        text: title,
        url: publicAppUrl(config.shareUrl),
      });
      if (outcome === 'copied') setNote(t.share.owner.copied);
    } catch {
      setError(t.share.owner.failed);
    } finally {
      setBusy(false);
    }
  };

  const copy = (config: TripShareConfig) => {
    void navigator.clipboard?.writeText(publicAppUrl(config.shareUrl));
    toast(CONTROL_ICON.clipboard, t.share.owner.copied);
  };

  return (
    <Sheet title={listName} onClose={onClose}>
      <div className="modal-form share-sheet">
        <div className="share-group">
          <div className="share-scope-note">
            <strong>{t.share.list.places(count)}</strong>
            <span>{t.share.list.scope}</span>
            {link ? (
              <span className="share-scope-live">
                <Icon name="link" />
                {t.share.list.live}
              </span>
            ) : null}
          </div>
        </div>
        <div className="share-send">
          {link ? (
            <TripLinkRow url={publicAppLink(link.shareUrl)} onCopy={() => copy(link)} />
          ) : null}
          <div className="share-outcomes is-single">
            <button
              type="button"
              className="share-outcome primary"
              onClick={() => void send()}
              disabled={busy}
            >
              <Icon name="share" />
              {link ? t.share.list.again : t.share.list.create}
            </button>
          </div>
        </div>
        {note ? <div className="share-live-note">{note}</div> : null}
        {error ? <div className="share-error">{error}</div> : null}
        {isAdmin && link ? (
          <div className="share-manage-actions">
            <button type="button" className="share-manage" onClick={() => setConfirmingStop(true)}>
              {t.share.list.stop}
            </button>
          </div>
        ) : null}
      </div>
      {confirmingStop && link ? (
        <ConfirmDialog
          tone="danger"
          title={t.share.owner.stopTitle}
          body={t.share.list.stopBody}
          confirmLabel={t.share.owner.stopConfirm}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirmingStop(false)}
          onConfirm={() => {
            setConfirmingStop(false);
            void stopTripShare(tripId, link.code)
              .then(() => onLink(undefined))
              .catch(() => setError(t.share.owner.failed));
          }}
        />
      ) : null}
    </Sheet>
  );
}
