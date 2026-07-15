-- Trip glyph-only identity icon (ADR-0038). Nullable; the UI falls back to
-- DEFAULT_TRIP_ICON when unset, so existing trips need no backfill.
ALTER TABLE "Trip" ADD COLUMN "icon" TEXT;
