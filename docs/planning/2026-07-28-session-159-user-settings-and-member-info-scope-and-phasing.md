# Session 159 — the user settings page and what a member is: scope + phasing

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Paper only** — no feature code, no ADR yet. Reads against ADR-0002, 0005, 0006, 0013, 0020, 0021, 0028, 0039, 0090; `architecture/app-shell.md` §6/§7, `architecture/auth-and-google.md`, `design/design-language.md`.

Three requests arrived together: **a user settings page reachable from inside a trip and outside it**,
**a profile picture the user can choose or upload**, and **a way to see the trip's members from the top
bar with more about them than a name**. The owner asked for a plan rather than a build, so this note
traces each against the code, records the four scope calls made in session, and cuts the work into one
design session plus three build slices.

Nothing here is a decision about how a surface **looks** — that is the design session (Phase 0), which
owes an ADR and a mockup. This note's job is to bound what that session may decide.

## What the code says today

| Claim                                               | Traced to                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A user is three fields, none editable               | `User { email, displayName, avatarColor }` (`backend/prisma/schema.prisma:83`), mirrored in `userSchema` (`packages/shared/src/entities.ts:80`). `displayName` is whatever Google returned at first sign-in  |
| There is no write path for a user                   | `auth.controller.ts:161` has `@Get('me')` and nothing else. `meSchema` is `{ user, memberships }` — a read shape (ADR-0020)                                                                                  |
| Google already returns the photo, and we discard it | Sign-in scope is `openid email profile` (`auth-and-google.md:35`); `GoogleUserinfo` declares only `sub, email, email_verified, name` (`auth/google-oauth.client.ts:27`). `picture` needs **no new consent**  |
| Profile editing was parked, not forgotten           | `app-shell.md:96` — "Profile editing is **deferred**." This task is that deferral coming due                                                                                                                 |
| The account sheet already reaches every shell       | `AccountSheet` (`App.tsx:532`) is mounted from the in-trip header, `ZeroStateWithAccount` and `AllTripsWithAccount` (`App.tsx:554`, `:567`). "From the trip and outside" is already solved for the **entry** |
| The member cluster is not a control                 | `App.tsx:265-277` — a `<div className="avatars">` carrying a `title`. Hover-only, so on a phone it is unreachable: a direct violation of root rule 6 (ADR-0017)                                              |
| …and it hides more of the group than it shows       | `MEMBER_AVATAR_CAP = 2` (`constants.ts:142`). On the ~5-person trip the product is built for, the header renders **2 faces and an inert `+2`**                                                               |
| Presence is broadcast and thrown away               | `sync.gateway.ts:165-173` broadcasts `{ userId, connected }[]` on every connect/disconnect; `frontend/src/lib/ws.ts:38` declares `PRESENCE` **with no payload** and no handler reads it                      |
| The avatar circle is copy-pasted ~8 times           | `App.tsx:271`/`:281`/`:530`, `TripSettings.tsx:282`/`:318` + `MemberSheet`'s `color` prop `:388`, `AllTrips.tsx:157`, `ZeroState.tsx:38`                                                                     |

### The two findings that change the design rather than just feeding it

**1. Today's avatar colours spend the semantic palette on identity.** `avatarColor`'s DB default is
`#E9A63C` — **that is the amber accent**. The fixtures then hand out `#5EC5B6` (teal) and `#9C8CE8`
(violet). ADR-0028 reserves amber for time & commitment, teal for location, `--plan` violet for plan
mode, and `app-shell.md:6` goes further: shell chrome is "indigo/neutral, **never** amber or teal" —
and the account surface **is** shell. So a "list of colours to pick from" cannot be drawn from the
hues the app already uses. Identity needs **its own ramp**, declared in design-language.md as a
non-semantic set, and the amber default has to go. This is the one place the work amends an adopted
ADR, so it belongs in the design session's ADR rather than in a build slice.

**2. `ui/primitives/Avatar` must come before either surface, not alongside them.** Eight call sites
render the same circle today, and both new surfaces add more (a settings page hero, a member row, a
member sheet). Under root rule 8 that is a primitive waiting to be extracted — and this repo carries
four ADRs (0078, 0079, 0094, 0095) that exist **only** to undo exactly this kind of pile-up. Extract
first and every later slice is a one-liner; extract last and there are eleven copies to chase, three
of which will already have grown a picture branch.

## The four scope calls (owner, in session)

1. **Picture sources: the Google photo, an upload, and an initials-and-colour** — the illustrated
   **preset set was declined**. So "a list of available options" resolves to _{your Google photo, an
   uploaded image, initials on a colour}_, and the **colour ramp is the choosable list**. No shipped
   avatar artwork.
2. **The member card states identity + role + joined date, and stops there.** Presence, recent
   activity and "their stuff in the trip" are all **out** — see Rejected below.
3. **A full `/settings` route; the sheet is retired.** Not a sheet that grows, and not a sheet plus an
   edit route.
4. **Profile + account facts only.** No account deletion, and **no forward-looking toggles.**

### Rejected, with the reason (so the next session doesn't re-propose them)

- **A theme / dark-mode toggle, a language picker, a units picker.** All fiction today: the UI is
  Hebrew-only (ADR-0009), dark mode is unbuilt (the authored night map style sits unimported for
  exactly this reason), and `lib/distance.ts` is metric-only. Root CLAUDE.md's "write only what a
  reader would otherwise get wrong" applies to controls too — a switch that does nothing is worse than
  a thin page.
- **A user-level home timezone.** ADR-0107 §3/§5 derives the origin/home zone from the outbound
  flight and deliberately does **not** store it. A user-level field would be a second, competing
  answer to a question that already has one.
- **A calendar-sync toggle on the user page.** `Membership.calendarSyncEnabled` is **per-trip** intent
  (`auth-and-google.md:47`), nothing reads it yet, and the feature itself is unbuilt. It belongs in
  trip settings when it lands, not here.
- **Presence on the member card** (`connected`). Rejected for now as scope, **not** as a bad idea: it
  is the cheapest live signal in the codebase — the backend already broadcasts it and only the FE type
  drops the payload. Kept as a backlog line, because the FE/BE mismatch is a latent trap either way.
- **Recent activity per member**, from `Change.actorUserId`. Derivable, and `ChangeFeed` already
  narrates changes — but it turns a roster into a scoreboard, which an invite-only trip app with no
  social layer should decide deliberately rather than inherit.
- **Member-to-member location.** ADR-0006, still deferred. Out of bounds for "more info about a
  member" permanently until that ADR is revisited.
- **Account deletion.** A real gap (the schema's cascades would mostly carry it), but it needs its own
  consequence design — what happens to a trip whose last admin deletes themselves. Backlog line.

## Phasing — one design session, then three slices, one PR each

**Phase 0 — design session → ADR-0133 + `mockups/user-settings-v1.html`.** One ADR for both surfaces:
they share the identity vocabulary, and splitting it guarantees they diverge. What it must settle:
the **identity colour ramp** (non-semantic, and the amend to design-language.md + the removal of the
amber default); how the three picture sources present as **one** control, including which wins when a
user has a Google photo and then uploads (and whether "back to my Google photo" is a state or a
re-fetch); what a **missing** picture looks like at each size the primitive serves; the page's section
order and how the retired sheet's three facts (email, "מחובר עם Google", sign out) sit on a full page;
whether `/settings` or `/me`, and the ADR-0090 back rule from all three shells; and for the member
surface, whether the top-bar cluster opens a **roster sheet** listing everyone or a per-member card,
plus what the cluster looks like once it is a real control (the `+2` has to stop being inert). Read
first: `app-shell.md` §6/§7, ADR-0028, ADR-0039, ADR-0090, ADR-0020, `design-language.md`.

**Phase 1 — identity foundation.** No new screens. `ui/primitives/Avatar` (size variants, picture
source, initials fallback, the ramp) replacing all ~8 copies; `User` gains the picture field(s) +
migration, mirrored in `@waypoint/shared`; `GoogleUserinfo` gains `picture` and sign-in stores it
(`auth.service.ts:78`); `PATCH /me` with its zod schema, and `meSchema` unchanged as the read shape.
The amber default dies here. **Not** the upload path.

**Phase 2 — the settings page.** The `/settings` route, `displayName` editing, the avatar picker over
Google-photo + colour-ramp, and the account facts; `AccountSheet` deleted and its three call sites
re-pointed. Amend `app-shell.md` §6 (it currently ends "Profile editing is deferred" and points at a
sheet).

**Phase 3 — members from the top bar.** The cluster becomes a control, the overflow stops being a dead
end, and the member surface states identity + role + joined. Reuses `ListRow`/`RowManageSheet` if the
design lands on a roster list — that is already the managed-row shape behind bookings, documents **and**
the settings member list, so a fourth managed list extends it (frontend CLAUDE.md).

**Phase 4 — upload, its own slice, deliberately last.** It is the only part with infrastructure
attached: a byte ceiling, a crop/resize step, and a **trust-class** call — documents are trip-scoped
and encrypted at rest (ADR-0015/0034) behind `storage.ts`, and an avatar is user-scoped and shown to
co-members, so whether it rides that path or a separate one is a real decision, not a detail. Keeping
it out of Phase 2 means the 80% case (a Google photo, or a colour) ships without waiting for it.

## What the owner should confirm at the top of Phase 0

The reading of call (1) — that no illustrated preset artwork is wanted, and the "list of options" is
the colour ramp plus the two real image sources. If a shipped set of avatar artwork **is** wanted, it
lands in Phase 2's picker and the design session owes the set itself.
