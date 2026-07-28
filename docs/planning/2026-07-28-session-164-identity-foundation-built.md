# Session 164 — the identity foundation, built (ADR-0133 Phase 1)

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Code** — Phase 1 of [ADR-0133](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md): `Avatar`, the ramp tokens, the `User` fields + migration, `picture` at sign-in, `PATCH /me`. **No screens** — Phase 2 owns those.

The ADR carries the design. This note carries what the build learned, which is mostly
**two places the design was slightly wrong and one place the sandbox lied**.

## The two refinements (both now in ADR-0133 §5's build note)

**1. A hue has to be stored as a key, not a colour.** The ADR called the field
`avatarColor` and its table said "the identity-ramp pick". But §5 also requires the ramp to
"join the dark remap table like every other token" — and a stored `#8496B5` **cannot** follow a
remap, because it is a literal. Those two sentences were in conflict and the hex lost. So the
column is `avatarHue` holding `plum|rose|moss|denim|cocoa`; the values live once in
`tokens.css`, under both theme blocks; and `Avatar` paints `var(--id-<hue>)`. A key is also
**validatable** — an unknown hue is a 400 at the schema, where an unknown hex was just an
un-renderable string.

**2. "Always present" belongs on the wire, not on the column.** The ADR said the field is always
present because initials need a ground. But a stored default is precisely the defect this whole
epic opened on, so the column is **nullable** — null is "never chosen", which is what keeps the
default genuinely _derived_. What is always present is the **DTO**: `toUserDto` resolves it, so a
null column cannot reach a render and no client owns the fallback.

`resolveAvatarHue` derives for anything outside the ramp, not just for null — which is how the
pre-ADR `#E9A63C` rows land on a real hue instead of a broken one. That is also its most useful
test.

## What the build found in the code

**`getMe` was a second user-shaping path.** It returned `{ ...user, createdAt }` — a local spread
beside `toUserDto`. Harmless while a user was four flat fields; actively wrong the moment one
field became _resolved_, since the spread would have skipped the resolution and shipped a null
hue. Routed through `toUserDto`, so there is one answer to "what does a user look like on the
wire" (rule 8).

**Two more places carried a user's colour**, neither obvious from the ADR: the removed-member
list (`trips.service.ts`, ADR-0067's re-invite section) and `MemberSheet`'s `color` prop. The
sheet now takes a `person` rather than a name plus a hex, which is the shape Phase 3 needs
anyway. `RemovedMember` carries no picture fields at all, so `AvatarPerson.avatarChoice` is
**optional** — initials is the honest render for someone whose payload has no photo, rather than
borrowing one.

**`Avatar` needed two affordances the ADR did not anticipate**, both from real call sites rather
than from taste: `size="inherit"` (the in-trip chrome's 31px + indigo border + negative overlap
margin are **chrome** rules, not identity ones, so `.av` keeps owning them and takes only the
source resolution), and an `onClick` that makes it a real `<button>` — the account avatar is one
today and Phase 3's member cluster is one next, and the alternative was every caller nesting a
circle inside a circle.

**Dead weight removed rather than left:** `AVATAR_INITIAL_LENGTH` now has exactly one reader (it
had five), and `.acct-av` is gone — the account sheet's bespoke 64px circle is `Avatar size="lg"`.

## The sandbox lied about the backend tests, and checking mattered

`pnpm test` reported **10 files / 98 tests failing** in the backend. The failures are
`PrismaClientKnownRequestError` with an empty message, which reads like a schema break — exactly
what you would fear from a migration that drops a column.

It is not. There is no Docker in this environment, so nothing was listening on 5432. I brought up
a real Postgres 16 (`initdb` as the `postgres` user — it refuses to run as root, and the
scratchpad path is not readable by it, so the cluster lives under `/var/lib/postgresql`), created
the database, and ran `prisma migrate deploy`: **all migrations apply, including this one**, and
`\d "User"` shows exactly what `schema.prisma` declares — `avatarHue` nullable, `avatarChoice`
NOT NULL defaulting to `initials`, both URL columns nullable, `avatarColor` gone.

The tests still failed the same way. So I stashed the whole change and ran them on clean `main`
with the same database: **10 failed / 13 passed, 98 failed / 73 passed / 2 skipped — identical,
to the test.** The failures are environmental and pre-existing; this change adds none. Worth
recording, because "98 backend tests fail" is exactly the kind of number that gets attributed to
whoever touched the schema last.

Green here: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check`, the full frontend
suite (**1504 tests, 109 files**), and `@waypoint/shared` (57).

## What Phase 2 inherits

The substrate, and nothing user-visible: no `/settings` route, no picker, no name editing. The
account sheet still renders — through `Avatar` now, so the picture will simply appear there the
moment a user has one, before Phase 2 does anything.

Two things deliberately not done, both stated in the ADR: a rename still is **not** broadcast
(§8 — a `Change` is per-trip while a user spans many), and the ramp's **dark values are a first
pass** lifted the way the `--cat-*` hues are, not judged on a real dark render. That is the
backlog line, not this session's.
