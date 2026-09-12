-- Our own copy of the Google profile photo (ADR-0133 §13).
--
-- `googleAvatarUrl` is a hotlink to Google's CDN, which made a Google-photo avatar the one
-- thing on the roster that does not work offline — reported from a plane, where every
-- avatar in the app drew the browser's broken-image glyph. This column holds the blob key
-- of the bytes we fetched, served through the existing `/users/:userId/avatar/:key` route
-- so an avatar is same-origin and immutable like every other picture the app shows.
--
-- A SECOND column rather than a replacement: the URL is what the copy was fetched from, so
-- it is what says whether the person has changed their Google photo since, and a mirror
-- that failed must still leave something to render online.
--
-- Nullable with no backfill: the copy is made at sign-in (the refresh policy), so an
-- existing user's face keeps hotlinking until their next one.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleAvatarKey" TEXT;
