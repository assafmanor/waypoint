-- ADR-0052 §6 (amended 2026-08-13): four types the four shipped ones had no room for.
--
-- The set was passport · insurance · visa · other, so every ticket, every booking
-- confirmation, every driving licence and every vaccination record was "אחר" — and with the
-- upload form defaulting to `passport`, most of them were filed as a passport instead.
--
-- Additive only (Postgres cannot remove an enum value without rewriting the type), and no
-- backfill: nothing stored distinguishes an "other" that is really a ticket from one that
-- is genuinely other. Existing rows keep their type; re-typing one is one tap in the edit
-- sheet.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'ticket' AFTER 'visa';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'reservation' AFTER 'ticket';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'license' AFTER 'reservation';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'health' AFTER 'license';
