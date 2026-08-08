// **Pick a document the trip already holds** (ADR-0173 §5's first entrance) — the common case
// once a passport or an insurance PDF is uploaded.
//
// It offers only what the reader can already see, which is §6's rule from the other side: the
// list it is given is the reader's own document list, so a private document nobody handed
// them is not offerable any more than it is renderable. Documents already attached here are
// shown as taken rather than hidden, because "it is already on this booking" is the answer
// the reader is looking for, and a silently short list is not.
//
// It also carries the UPLOAD entrance, so the empty slot's single 40px control reaches both
// (§5's amendment): with no documents in the trip at all, "pick an existing one" would
// otherwise be a dead end.
import type { DocumentSummary } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { FormActions } from './primitives/FormActions';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './attach.css';

export function DocumentPickerSheet({
  documents,
  taken,
  onPick,
  onUpload,
  onClose,
}: {
  documents: DocumentSummary[];
  /** Document ids already attached to (or staged for) this host. */
  taken: Set<string>;
  onPick: (documentId: string) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const empty = documents.length === 0;
  const allTaken = !empty && documents.every((d) => taken.has(d.id));

  return (
    <Sheet title={t.docs.attach.pickTitle} onClose={onClose}>
      <div className="doc-pick">
        {empty || allTaken ? (
          <p className="doc-pick-empty">
            {empty ? t.docs.attach.pickEmpty : t.docs.attach.pickAll}
          </p>
        ) : (
          <div className="doc-pick-list">
            {documents.map((doc) => {
              const isTaken = taken.has(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  className="doc-pick-row"
                  disabled={isTaken}
                  onClick={() => onPick(doc.id)}
                >
                  <span className="doc-pick-g" aria-hidden="true">
                    {DOCUMENT_TYPE_ICON[doc.type]}
                  </span>
                  <span className="doc-pick-t" dir="auto">
                    {doc.title}
                  </span>
                  {isTaken && <Icon name="check" />}
                </button>
              );
            })}
          </div>
        )}
        <FormActions
          primary={{ label: t.docs.attach.upload, onClick: onUpload }}
          secondary={{ label: t.docs.attach.cancel, onClick: onClose }}
        />
      </div>
    </Sheet>
  );
}
