// **The note parser now lives in `@waypoint/shared`** (moved 2026-08-31; owner: _"In the pdf,
// markdown not formatted"_).
//
// The A4 renderer cannot import a React app's lib, so paper printed `##` and `**` as literal
// characters while the screen rendered them — two surfaces disagreeing about what a marker
// MEANS, which is the drift ADR-0096 exists to stop. The parser is pure (no DOM, no clock,
// and its only Hebrew is a script range inside a regex rather than a word), so it belongs
// there. `NoteProse` stays here: painting is the frontend's half, and the header of that file
// already says so.
//
// Re-exported so every call site keeps its import.
export {
  parseNoteMarkdown,
  parseNoteInline,
  flattenNoteMarkdown,
  type NoteBlock,
  type NoteInline,
} from '@waypoint/shared';
