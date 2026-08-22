// **A day surface rendered for a day you are not on** (ADR-0200 §7) — the two providers the
// swipe's peek needs, and nothing else.
//
// The peek shows the day you are swiping toward, and the design's whole claim is that it
// shows it by rendering **the real surface** rather than a summary of it. That is what makes
// the seam at the end of the page-turn invisible: what the peek is drawing when the animation
// lands IS what the committed day draws, same components, same props, same stylesheet. A
// bespoke preview row would need a cross-fade to hide the difference, and would drift from
// the real one the first time either changed (`frontend/CLAUDE.md`: a third copy of the day's
// rows is the mistake ADR-0159 §1 exists to prevent).
//
// So the neighbour is the same `<DayView>` / `<PlanDay>`, given a different `activeDate` and
// told that it is a preview. Two providers, because those are two different questions:
//
//   `DayDate`    — WHICH day. Shadows one field of the trip context, so every component
//                  below reads the neighbour's date with no prop threaded through either
//                  screen (`DayView` is ~1200 lines, `PlanDay` ~2300; a `date` prop would
//                  have to reach every child that asks what day it is).
//   `DayPreview` — WHETHER it is real. Read by the two things that would otherwise reach out
//                  of the pane and act on the app: the arrival param, and "land on now".
//
// **The gate is one concept, not seven.** Every effect on both day screens is "an arrival
// landed on me" — `?event=` opening a card, `?idea=` opening a sheet, `landAtTop` aiming at
// the row, and today's now-line scroll. Counting them first is what found the one that would
// have shipped: `useArrivalParam` SPENDS the param it reads, so a mounted preview would eat
// the arrival and the day you actually land on would never see it.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { TripContext, useTrip } from './trip-state';

const DayPreviewContext = createContext(false);

/** True inside a peek. Read it to suppress anything that reaches OUT of the pane — a scroll
 *  on the shared body, a URL param, a sheet. Never to change how the day looks: the pane
 *  looking exactly like the real thing is the entire point of it. */
export function useIsDayPreview(): boolean {
  return useContext(DayPreviewContext);
}

/**
 * Render `children` as the day surface for `date`, inert.
 *
 * The trip context is re-provided with one field swapped. Cheap by construction — it is the
 * same object with a different `activeDate`, memoized on the pair, so nothing below re-renders
 * more often than it would have. Everything else about the trip (events, bookings, zones,
 * verbs) is deliberately the same reference: a preview is a different DAY, not different data.
 */
export function DayPreview({ date, children }: { date: string; children: ReactNode }) {
  const trip = useTrip();
  const value = useMemo(() => ({ ...trip, activeDate: date }), [trip, date]);
  return (
    <TripContext.Provider value={value}>
      <DayPreviewContext.Provider value={true}>{children}</DayPreviewContext.Provider>
    </TripContext.Provider>
  );
}
