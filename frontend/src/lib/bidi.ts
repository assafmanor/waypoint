// The frontend's handle on the bidi helpers. **They now live in `@waypoint/shared`**
// (moved 2026-08-31) so the A4 renderer can isolate a value exactly the way the app does
// rather than growing a second implementation of it. Pure string functions — no DOM, no
// copy — which is what makes the move legitimate under `packages/shared/CLAUDE.md`.
// Re-exported here so every call site keeps its import.
export {
  ltrIsolate,
  autoIsolate,
  measure,
  withoutBidiControls,
  baseDirection,
  bindPrefix,
} from '@waypoint/shared';
