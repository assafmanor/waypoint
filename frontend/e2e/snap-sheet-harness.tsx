// Mounts the real `SnapSheet` for `snap-sheet-drag.spec.ts` — the app cannot host it in e2e
// (the sheet needs a canvas and the hermetic boot has no Maps key, ADR-0121 §13), and a
// markup copy of the component would measure the copy. Not part of the app bundle.
import { StrictMode, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import { SnapSheet } from '../src/ui/primitives/SnapSheet';
import {
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_STRIP_H,
  MAP_SHEET_VIEW,
  type MapSheetView,
} from '../src/constants';

const params = new URLSearchParams(location.search);
const initial = (params.get('view') ?? MAP_SHEET_VIEW.half) as MapSheetView;
const contentPx = Number(params.get('content') ?? 2000);

function Host() {
  const [view, setView] = useState<MapSheetView>(initial);
  return (
    // The Map reserves its strip height for the top row (`--snap-top-h`), so the handle row
    // here is the size a finger meets in the app.
    <div className="pane" style={{ '--snap-top-h': `${MAP_SHEET_STRIP_H}px` } as CSSProperties}>
      <SnapSheet
        stops={MAP_SHEET_STOPS}
        order={MAP_SHEET_ORDER}
        view={view}
        onViewChange={setView}
        grabLabel="גובה הרשימה"
        stopLabels={{ map: 'מפה', half: 'חצי', full: 'מלא' }}
      >
        <div className="content" style={{ height: contentPx }}>
          {Array.from({ length: Math.ceil(contentPx / 40) }, (_, i) => (
            <div key={i} style={{ height: 40 }}>
              שורה {i + 1}
            </div>
          ))}
        </div>
      </SnapSheet>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Host />
  </StrictMode>,
);
