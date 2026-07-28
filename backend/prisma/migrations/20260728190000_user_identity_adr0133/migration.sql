-- ADR-0133 — the user becomes a surface: identity fields on User.
--
-- `avatarColor` is dropped rather than migrated. Every row holds the column
-- default `#E9A63C` (which is `--amber`, a semantic hue avatars may never use):
-- nothing in the app ever wrote the field, so there is no user intent to keep.
-- `avatarHue` replaces it as a nullable ramp KEY, where null means "never chosen"
-- and the server derives a hue from the user id — one shared default is exactly
-- what made every real user identical.

CREATE TYPE "AvatarChoice" AS ENUM ('google', 'upload', 'initials');

ALTER TABLE "User"
  ADD COLUMN "avatarHue" TEXT,
  ADD COLUMN "avatarChoice" "AvatarChoice" NOT NULL DEFAULT 'initials',
  ADD COLUMN "googleAvatarUrl" TEXT,
  ADD COLUMN "uploadedAvatarKey" TEXT;

ALTER TABLE "User" DROP COLUMN "avatarColor";
