// The Index's dedicated documents screen (ADR-0098): local view state inside
// Index.tsx, not a route — mounted only while the landing's documents tile is
// open. Registers as the topmost overlay (ADR-0098 §5) so one back/gesture/
// system-back returns to the landing before falling through to the normal
// tab → Home rule. Content is the existing DocumentsSection, unchanged (ADR-0098
// §2 — the documents screen keeps its present type-grouped list as-is). The
// encrypted badge moved up into the merged `idx-head` row (ADR-0100 §1/
// Consequences — the same merged header shape as bookings, for back-arrow-
// direction consistency); DocumentsSection no longer renders its own
// duplicate title/badge row. The header names this screen ("מסמכים", ADR-0101)
// rather than the generic "אינדקס".
import { useOverlay } from '../state/nav-state';
import { IndexBackRow } from './IndexBackRow';
import { DocumentsSection } from './DocumentsSection';
import { t } from '../i18n/he';

export function IndexDocumentsView({ onClose }: { onClose: () => void }) {
  useOverlay(onClose);
  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.docs.title}
        onBack={onClose}
        end={<span className="badge-offline">🔒 {t.docs.encrypted}</span>}
      />
      <DocumentsSection />
    </div>
  );
}
