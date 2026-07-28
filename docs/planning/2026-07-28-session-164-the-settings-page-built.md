# Session 164 — the settings page, built (ADR-0133 Phase 2)

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Code** — Phase 2 of [ADR-0133](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md): `/settings` + `/settings/picture`, the `?from=` back rule, name editing, and the deletion of `AccountSheet`. First user-visible slice of the epic.

The ADR carries the design and session 163 built the substrate. This note carries what
Phase 2 learned, and the headline is that **running the app found things the tests could
not** — including a defect in session 163's own work.

## Running it was the point, and it earned its keep three times

The frontend suite passed 1524 tests before I opened a browser. Then I brought up a real
backend + Postgres with `DEV_AUTH=1` and looked:

1. **The account avatar wore a heavy black ring.** `Avatar` renders a `<button>` when
   interactive (session 163's own addition), and `avatar.css` never reset the UA button
   border. Every unit test asserted classes and structure; none could see a border the
   browser draws by default. `.wp-av` now resets `border`/`padding`/`appearance` and adds
   a real focus ring.
2. **The derivation clustered badly on the seed's own users.** `deriveAvatarHue` over
   `u-assaf`/`u-noam`/`u-dana`/`u-maor`/`u-ron` returned **plum, plum, rose, cocoa,
   plum** — three of five identical, on exactly the ~5-person trip this product is built
   for, which is the defect the whole derivation replaces. Plain djb2 barely mixes its
   low bits, so short ids sharing a `u-` prefix collapse onto the same `% 5`. Added
   murmur3's `fmix32` finalizer and a regression test using that exact input shape.
   **Real ids are cuids and would have hidden this** — the seed's human-readable ids are
   what exposed it, which is an argument for seeding with realistic-but-ugly ids.
   To be precise about what the fix buys: it removes the **clustering**, not collisions.
   Five hues over five people are all-distinct only ~4% of the time, so a repeat inside a
   group is normal and ADR-0133 §5 accepts it. A hash that ignores most of its input is
   the part that was wrong.
3. **The seed and the e2e boot fixture still wrote `avatarColor`.** Both are outside
   TypeScript's reach (`.mjs`, and a fixture the compiler does check but which I had not
   touched), so session 163's green typecheck said nothing about them — `prisma:seed`
   would have failed outright on the dropped column. The seed now writes **no** hue at
   all, which is both correct and the honest demo: it lets the derivation do its job, and
   its old hexes were amber, teal and two `--cat-*` collisions, all of which ADR-0133
   removed.

Then the round trips, against the real API rather than a mock: a rename persists
(`/me` returns it after the blur), a hue pick persists without touching `avatarChoice`,
and the back path **`/settings/picture?from=home` → `/settings?from=home` → `/`** lands
in the trip rather than at `/trips`. That last one is the ADR §2 rule working end to end,
and it is the thing a unit test of `resolveBack` can assert but not actually prove.

## The back rule, and why `NavSnapshot` grew a field

`/settings` is the first shell route with **more than one legitimate parent**, so
`parentRoute` stopped being a function of the pathname alone — it now reads `?from=`, and
`NavSnapshot` carries `search`. Two properties keep this inside ADR-0090 rather than
around it: the value is a **closed enum** (`home`/`trips`, never a path — an arbitrary
`?return=<path>` is an open-redirect shape and can strand back on a surface that no
longer exists), and it lives **in the URL**, so it survives a reload exactly as
`?tab=`/`?day=` do and back stays a pure function of nav state.

The picture page hands the target back up (`/settings/picture` → `/settings` + the same
search), which is what makes two backs land where you came from. Both are one rule each
in the one function — ADR-0090 §2's "changing the behavior is a one-function edit" held.

## What got deleted, not just added

`AccountSheet` **and both wrapper components** (`ZeroStateWithAccount`,
`AllTripsWithAccount`) — they existed only to hold the sheet's open state, so with the
sheet gone they became two tiny route components that hold nothing but a `useNavigate`.
The Shell lost its `accountOpen` state, its `logout` binding and the `Sheet` import, all
of which lint flagged the moment the sheet left. `app-shell.md` §6 is rewritten: it had
said "Profile editing is **deferred**" since the shell was first specified.

## Deliberate calls worth stating

**The name saves on blur, not behind a button.** One field, and a name is an LWW patch
(ADR-0012), so a save step would be ceremony. An emptied field is treated as a **revert**
rather than a rename to nothing — the alternative is a nameless user rendering a blank
circle to their whole group.

**`google`-with-no-URL is treated as no photo** on the picture page, not as a photo
state. Otherwise a revoked Google photo strands the page with neither a picture nor a way
to change one. That is §4's fallback rule showing up as a UI state rather than only as a
resolver branch, and it has its own test.

**`patchMe` lives on the auth context**, not in the screens, and writes the cached `Me`
as well as the live one — so the offline cold-load path renders the new name rather than
the pre-edit one. It is deliberately **not** outboxed: a `User` is not a syncable entity
type (§8), so there is no cache channel or WS echo to reconcile against and the response
is simply the truth.

## What Phase 3 inherits

The roster: the header cluster becomes a control, `MemberSheet` generalises into the one
member surface, and the two §10 defects (`+{n}` rendering as `n+` in the RTL chrome,
`.role.owner` spending amber on a role) get fixed there rather than propagated. `Avatar`
already renders a `<button>`, which is exactly what the cluster needs.

Still open and unchanged: a rename is not broadcast (§8), and the ramp's **dark values
have still not been judged on a real dark render** — I looked at these pages in light
mode only.
