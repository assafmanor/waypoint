// The Index's dedicated documents screen (ADR-0098): local view state inside
// Index.tsx, not a route — mounted only while the landing's documents tile is
// open. Registers as the topmost overlay (ADR-0098 §5) so one back/gesture/
// system-back returns to the landing before falling through to the normal
// tab → Home rule. The encrypted badge lives in the merged `idx-head` row
// (ADR-0100 §1/Consequences — the same merged header shape as bookings, for
// back-arrow-direction consistency); DocumentsSection renders no title row of
// its own. The header names this screen ("מסמכים", ADR-0101) rather than the
// generic "אינדקס".
//
// **The type filter's state lives here, and that is a back-stack decision, not a
// preference** (ADR-0052 §7). Back peels a filter before it leaves a screen
// (ADR-0102), and a back arrow, a system back and a gesture must all run the SAME
// handler (ADR-0103) — so the state sits with the one `useBackLayer` and with the
// header's own back control, exactly as `IndexNotesView`/`IndexBookingsView` hold
// theirs. `DocumentsSection` is told the filter and reports changes; it keeps the
// chips, because it is the half that knows the counts.
import { useState } from 'react';
import { useBackLayer, type BackResult } from '../state/nav-state';
import { DOCUMENT_TYPE_ALL, type DocumentTypeFilter } from '../lib/documents';
import { IndexBackRow } from './IndexBackRow';
import { DocumentsSection } from './DocumentsSection';
import { t } from '../i18n/he';
import { Icon } from './Icon';

export function IndexDocumentsView({
  onClose,
  initialDocumentId,
}: {
  onClose: () => void;
  /** Opened straight onto this document's viewer, for a note that points at it
   *  (ADR-0153 §8's way-in amendment) — the same shape the bookings screen already has. */
  initialDocumentId?: string;
}) {
  const [filter, setFilter] = useState<DocumentTypeFilter>(DOCUMENT_TYPE_ALL);

  // A filtered screen is not ready to leave, it is ready to show everything again
  // (ADR-0102). `remainsActive` keeps this screen registered so the NEXT back peels here
  // again rather than leaking past it (ADR-0103). Replaces the plain `useOverlay(onClose)`
  // this screen had while it had nothing to peel.
  const backOrResetFilter = (): BackResult => {
    if (filter !== DOCUMENT_TYPE_ALL) {
      setFilter(DOCUMENT_TYPE_ALL);
      return { remainsActive: true };
    }
    onClose();
    return { remainsActive: false };
  };
  useBackLayer(backOrResetFilter);

  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.docs.title}
        onBack={backOrResetFilter}
        end={
          <span className="badge-offline">
            <Icon name="lock" /> {t.docs.encrypted}
          </span>
        }
      />
      <DocumentsSection
        initialDocumentId={initialDocumentId}
        filter={filter}
        onFilterChange={setFilter}
      />
    </div>
  );
}
