// "A drag is in flight" (ADR-0116 session-119). Exactly the shape of
// `map-scope-state`, and for the same reason: two components in different parts of
// the tree need one piece of ephemeral view state, and it belongs above both rather
// than duplicated in either.
//
// The consumers are the Plan day builder (which owns the drag) and the header's
// `DayStrip` (which spring-loads its day pills while one is live, so you can carry a
// card or a row to another day). Deliberately NOT synced, not in the URL, and not a
// back target — it exists only between a touchstart and a touchend.
//
// It carries only what the strip has to RENDER — whether a drag is live, and which of
// its pills is under the pointer. What is being dragged, what a drop means, and the
// dwell that switches days all stay with the builder, which is the only thing that can
// hit-test the pointer: a touch pointer is implicitly captured by the element the touch
// started on, so the pills' own `pointerenter` never fires during a drag.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DragState {
  dragging: boolean;
  setDragging: (value: boolean) => void;
  /** The day pill the drag is currently over, or null. */
  overDate: string | null;
  setOverDate: (value: string | null) => void;
}

const DragContext = createContext<DragState | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [overDate, setOverDate] = useState<string | null>(null);
  const value = useMemo(
    () => ({ dragging, setDragging, overDate, setOverDate }),
    [dragging, overDate],
  );
  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

export function useDragState(): DragState {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDragState must be used within a DragProvider');
  return ctx;
}
