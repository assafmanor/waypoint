// Moved to `@waypoint/shared` (2026-08-31) alongside `note-markdown.ts`, which is its only
// non-UI consumer and now has to run on the server too. Re-exported so call sites keep their
// import.
export { externalHref, prettyUrl } from '@waypoint/shared';
