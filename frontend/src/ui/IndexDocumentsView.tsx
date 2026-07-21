// The Index's dedicated documents screen (ADR-0098): local view state inside
// Index.tsx, not a route — mounted only while the landing's documents tile is
// open. Registers as the topmost overlay (ADR-0098 §5) so one back/gesture/
// system-back returns to the landing before falling through to the normal
// tab → Home rule. Content is the existing DocumentsSection, unchanged (ADR-0098
// §2 — the documents screen keeps its present type-grouped list as-is).
import { useOverlay } from '../state/nav-state';
import { IndexBackRow } from './IndexBackRow';
import { DocumentsSection } from './DocumentsSection';

export function IndexDocumentsView({ onClose }: { onClose: () => void }) {
  useOverlay(onClose);
  return (
    <div className="idx-screen">
      <IndexBackRow onBack={onClose} />
      <DocumentsSection />
    </div>
  );
}
