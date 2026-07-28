# 0132 — The user is a surface: one settings route, one `Avatar` primitive, an identity ramp, and a roster you can reach

**Status:** Accepted (design; build in the phases of §11)
**Date:** 2026-07-28
**Builds on:** [0020](0020-auth-session-architecture.md) (the two-token session, `GET /me`), [0028](0028-plan-violet-color-budget-dark-ready.md) (the semantic colour budget), [0039](0039-trip-settings-admin-governed-data-plane.md) (trip settings is the admin-governed plane), [0090](0090-back-is-computed-from-nav-state.md) (back is computed, `parentRoute`), [0017](0017-mobile-first-device-targets.md) (touch-first, no hover-only affordances)
**Scoped by:** `planning/2026-07-28-session-159-user-settings-and-member-info-scope-and-phasing.md` (the four scope calls and the rejected candidates)
**Design reference:** `mockups/user-settings-v1.html`

## Context

Three requests arrived together: a user settings page reachable from inside a trip and outside it, a
profile picture the user can choose or upload, and a way to reach the trip's members from the top bar
with more about them than a name. Session 159 traced them and cut the work into phases. This is the
design session that phasing named, and it covers **both** surfaces in one ADR because they share a
single vocabulary — the avatar — and splitting them would guarantee the two drift.

`app-shell.md` §6 has said "Profile editing is **deferred**" since the shell was specified. That
deferral is what this ADR ends.

### Four things the code says that the design has to answer to

1. **Every real user has the same avatar colour.** `avatarColor String @default("#E9A63C")`
   (`schema.prisma:87`), and `auth.service.ts:78` never sets it on create. So the `avatarColor` field
   that exists to tell members apart tells them apart **not at all** in production — a real trip is a
   row of identical circles distinguished only by their letter. Only `fixtures.ts` is varied, which is
   why no screenshot ever showed the problem.
2. **That shared default is the amber accent, and design-language.md already forbids it.** The
   decorative-palette rule (`design-language.md:62`) covers "avatar identity colors" explicitly and
   says **"always pastel/muted, never amber or teal"**. `#E9A63C` _is_ `--amber`. So this is not a rule
   we need to invent — it is a rule the code has been violating. The fixtures violate the teal half too
   (`#5EC5B6`), and `#8CB6E8`/`#9C8CE8` are **byte-identical to `--cat-transit`/`--cat-lodging`**, the
   map's pin-category hues. What is genuinely missing from the doc is not the rule but the **ramp**: it
   names the five category hues and leaves identity's unnamed, which is how eight call sites ended up
   inventing values.
3. **The member cluster is not a control.** `App.tsx:265-277` is a `<div className="avatars">`
   carrying a `title` — a hover affordance, on a phone-primary app, which root rule 6 / ADR-0017
   forbid outright. And `MEMBER_AVATAR_CAP = 2` means the ~5-person trip the product is built for
   renders **two faces and an inert `+2`**: most of the group is unreachable from the chrome.
4. **Google already returns the photo and we discard it.** Sign-in requests `openid email profile`
   (`auth-and-google.md:35`), which returns `picture`; `GoogleUserinfo` (`google-oauth.client.ts:27`)
   declares four fields and not that one. No new scope, no new consent, no re-auth.

## Decision

### 1. One route, `/settings`, and `AccountSheet` is retired

The account sheet becomes a full-page shell route. It is **not** a sheet that grows and not a sheet
plus an edit route: a surface hosting a name field and a picture picker is exactly the shape ADR-0090
warns about, and the sheet's three facts (email, the quiet Google line, sign out) sit fine on a page.

The route is `/settings` — user-scoped, deliberately **not** nested under a trip, because the thing it
edits is you and it must be reachable with no trip at all. `/trip/:id/settings` keeps its meaning
untouched: **gear = this trip, avatar = you** (app-shell.md §6), and ADR-0039's admin gating stays
where it is.

The three existing mounts (`App.tsx:496` in-trip, `ZeroStateWithAccount:554`, `AllTripsWithAccount:567`)
become navigations. The entry points do not change — they already reach every shell, which is why "from
the trip and outside" needed no new affordance.

### 2. Back: the entry writes its return into the URL, as a closed enum

ADR-0090 §1.4 resolves a shell route to `parentRoute`, a **static** parent per route. `/settings` is the
first shell route with more than one legitimate parent: from inside a trip back must land at `/` (in the
trip), from `/trips` at `/trips`, and from the zero state at `/`. A static parent would eject a member
from their trip to reach their own name.

So the entry writes `?from=` and `parentRoute` reads it. Two rules keep this inside ADR-0090 rather than
around it: the value is a **closed enum**, never a path (an arbitrary return URL in a query string is an
open-redirect shape, and it would let a link strand back anywhere), and it is **in the URL**, so it
survives reload exactly as `?tab=`/`?day=` do and back stays a pure function of nav state. `from=home`
→ `/`; absent or anything else → `/trips`, the safe default for a deep link nobody navigated to.

This adds one `parentRoute` rule, not a new mechanism — ADR-0090 §2's "changing the behavior is a
one-function edit" is the point.

### 3. `ui/primitives/Avatar` is the one renderer, extracted before either surface

Eight call sites draw this circle today (`App.tsx:271`/`:281`/`:530`, `TripSettings.tsx:282`/`:318` +
`MemberSheet`'s `color` prop, `AllTrips.tsx:157`, `ZeroState.tsx:38`), and both new surfaces add more.
Under root rule 8 it is extracted **first**, as its own slice with no screen changes — extract last and
there are eleven copies to chase, several already grown a picture branch. This repo carries four ADRs
(0078, 0079, 0094, 0095) that exist only to undo this shape of pile-up.

`Avatar` takes the user and a size from a named ramp, and owns **all** of: source resolution, the
initials fallback, the ink-on-colour pairing, and the ring the account avatar wears. No call site
computes a background or slices a name again.

### 4. Source is a stored choice, not a fallback chain

A user with a Google photo who prefers a letter must be able to say so, so the source cannot be inferred
from which fields are populated. `User` gains:

| Field                | Meaning                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `avatarChoice`       | enum `google \| upload \| initials` — what the user picked                                                |
| `googleAvatarUrl?`   | the `picture` Google returned; a **fact from the provider**, refreshed at each sign-in, never user-edited |
| `uploadedAvatarKey?` | set by Phase 4 only                                                                                       |
| `avatarColor`        | the identity-ramp pick; **always** present, because initials always need a ground                         |

Resolution order is: honour `avatarChoice`; if the chosen source has no value, **fall back to
initials**. Never render a broken image. The fallback is not decoration — it is the state a revoked
Google photo, a deleted upload, and an offline load all land in.

**The initials state is the designed offline state, stated rather than discovered.** The Google photo is
hotlinked (`referrerpolicy="no-referrer"`), so with no network there is no face. That is acceptable
here and nowhere else: rule 5's offline guarantee is about the trip's **data** — the roster still lists
every member, with their real name, role and colour, all of it out of the cached snapshot. Only the
decoration degrades. Copying the photo server-side at sign-in would fix it and would drag storage into
Phase 1 to buy an avatar; that trade is refused, and named in Alternatives.

**Default at first sign-in:** `google` when Google gave a photo, else `initials`. A user who has never
opened this page gets a real face for free — the cheapest half of the whole feature.

### 5. Identity colour: name the ramp, and derive the default

**The ramp is its own, and it is defined by two constraints rather than by taste:**

- **Outside the semantic budget** — never `--amber`, `--teal` or `--plan` (ADR-0028, and the rule that
  already exists at `design-language.md:62`).
- **Lower chroma than the five `--cat-*` pin hues.** Distinct hue angles alone cannot carry this: the
  palette is crowded (`--cat-services` sits on amber's angle, `--cat-lodging` on `--plan`'s), and a
  member avatar in the chrome and a category pin on the canvas **are on screen together** on the Map
  tab. Chroma is the channel that stays free. So an identity colour may share an angle with a category
  hue and still never read as one, because the pin is chromatic and the avatar is muted. This is the
  rule; the five values below are its instance.

| Token        | Value     | Note                                            |
| ------------ | --------- | ----------------------------------------------- |
| `--id-plum`  | `#B98AC9` | clear of `--plan` and `--cat-lodging` by chroma |
| `--id-rose`  | `#D98CA8` | clear of `--miss` / `--cat-food`                |
| `--id-moss`  | `#9DB585` | below `--cat-leisure`                           |
| `--id-denim` | `#8496B5` | below `--cat-transit`                           |
| `--id-cocoa` | `#B99483` | below `--cat-food`                              |

**Five, not six, and the sixth is why this ADR was rendered before it was accepted.** A near-zero-chroma
`--id-stone` `#A9A29A` was drawn as the neutral member of the ramp and **cut after looking at it**: beside
the other five it read as a **disabled control**, not a chosen colour, and a member assigned it would
look deactivated. A palette in which one option looks broken is worse than a smaller palette. Five hues
against a five-person trip is also the common case covered.

All five are pastel for one non-negotiable reason: **a single dark ink must meet contrast on every hue,
in both themes.** That is what keeps `Avatar` from carrying a per-hue ink table, and it is why the ramp
cannot simply be "five nice colours". They join the dark remap table like every other token.

**The default is derived from the user id, not a column default.** A stable hash into the ramp — so
identity is varied from the first render, with no coordination, no assignment table and no collision
management. Five hues against a five-person trip will sometimes repeat, and that is accepted: this is
"gentle variety", not identification. The letter and the name identify; the colour only helps the eye.
Anyone can change theirs on this page.

**The amber default is deleted.** Not remapped — removed, because a column default is what made every
user identical.

### 6. The picker is one control, and tapping is the choice

A large current avatar, then the sources in one list: the **Google photo** (rendered, when there is
one), **upload** (Phase 4), and the **ramp** as swatches each previewing your own initial. There is no
separate source radio — `avatarChoice` is implied by what you tap, so the model never shows through as
a second control.

**Upload is absent until Phase 4, not disabled.** This follows the near-me rule the Map tab already
set (ADR-0109 §6 / the research half of ADR-0115): a control that cannot work is not shown, because a
greyed row invites a tap and explains nothing.

### 7. The page holds identity and account facts, and nothing invented

**Identity:** the avatar and `displayName` (editable — non-empty, length-capped; it is shown to every
co-member, so it is shared, not private).
**Account:** email (read-only — it is the account-linking key, `auth-and-google.md:43`), the quiet
`מחובר עם Google` line, and sign out.

Every candidate beyond that was rejected with a reason in session 159 — a theme toggle, a language
picker, units, a user-level home timezone, a calendar-sync toggle, account deletion. The short version:
each is either fiction today, or belongs to a surface that already owns it. A switch that does nothing
is worse than a thin page.

### 8. A name change is not broadcast in v1, and this ADR says so out loud

`displayName` and the avatar render on every co-member's roster, so they are shared state — and
`entityTypeSchema` has no `user` member, so a change reaches other members only at their next snapshot
fetch. Making it live is not a small addition: a `Change` is **per-trip** while a user spans many, so
one rename fans out to one change per trip they belong to, plus a registry entry in the memory channel
_and_ `CACHE_CHANNELS` (ADR-0094).

That cost is refused for v1. Renaming yourself is rare, a few minutes of a stale name harms nothing,
and ADR-0065's grow-later mindset covers it. **Recorded as a stated limitation with a backlog line**,
not left for someone to discover as a bug — the revisit trigger is a member changing their identity and
someone else being confused by it.

### 9. The roster is a statement, and management stays where it is

The header cluster becomes a real `<button>` opening a **roster sheet** listing **every** member —
avatar, name, `admin`/`peer` role, joined date, and a `you` marker on yourself. It is
**read-only**: promote, remove, re-invite and the invite link all stay in trip settings, where
ADR-0039's server-enforced admin gating already lives. Two surfaces would mean two gates.

Three things follow, and one of them removes a mechanism:

- **`MEMBER_AVATAR_CAP` stops being a truncation and becomes a rendering detail.** Once one tap lists
  everyone, `+2` is no longer a dead end hiding half the group — the overflow problem is deleted rather
  than raised.
- **The cluster keeps showing _others_,** and the account avatar keeps its ring beside the gear. That
  split is app-shell.md §6's and it survives: avatar = you, cluster = them, gear = this trip.
- **The roster and trip settings share the row rendering,** not two member-row components.

What the roster deliberately does not say: **presence** (already broadcast at
`sync.gateway.ts:165-173` and dropped by the client — the cheapest live signal in the codebase, and
still out of scope, see Alternatives), **recent activity**, and **location** (ADR-0006, deferred, and
out of bounds until that ADR is revisited).

### 10. Two shipped defects the render exposed, both on surfaces Phase 3 touches

The mockup inlines the app's **real** stylesheets (`mockups/tools/inline-app-css.mjs`, per the tool's own
rationale — a hand-copied token drifts the day either side changes). Rendering it against the shipped
chrome surfaced two pre-existing defects that a hand-drawn mockup would have hidden, and both sit on
elements this ADR proposes to reuse. **Phase 3 fixes them rather than propagating them:**

1. **`+N` renders as `N+`.** `App.tsx:266` emits `+{overflowMembers.length}` as bare text inside the RTL
   chrome, so the `+` drifts to the far side of the digits — `+2` reads `2+`. This is exactly the class
   of bug ADR-0118 exists for (the `−3` case the frontend `CLAUDE.md` names), and the fix is the
   documented one: the numeric run is an isolate via `ltrIsolate`/`measure` in `lib/bidi.ts`, never a
   hand-built template.
2. **`.role.owner` is amber.** `screens.css:2218` gives the `admin` badge
   `background: rgba(233,166,60,.16); color: var(--amber-deep)` — that is `--amber`, and a role is
   neither time nor commitment (ADR-0028 / root rule 4). It has been wrong since trip settings shipped;
   what makes it this ADR's problem is that the roster **reuses `.role`**, so leaving it would spend
   amber on identity across a second surface. The badge moves to neutral ink-on-paper like
   `.role.mem`, distinguished by weight/border rather than by a reserved hue.

Neither is a blocker for Phases 1–2, and neither is invented scope: both are the cost of the "share the
row rendering" decision in §9, paid once.

### 11. Phases

| Phase | Content                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `Avatar` + the ramp tokens + the `User` fields/migration + `picture` at sign-in + `PATCH /me`. No screens. The amber default dies.        |
| 2     | `/settings`, the `?from=` back rule, name editing, the picker over Google-photo + ramp; `AccountSheet` deleted. Amends `app-shell.md` §6. |
| 3     | The roster: the cluster becomes a control, the sheet, the shared row, **plus the two §10 fixes**.                                         |
| 4     | Upload — a byte ceiling, a crop/resize step, and the trust-class call against `storage.ts`.                                               |

## Consequences

- One primitive owns the avatar, so the picture model has exactly one reader and Phase 4 changes one
  file rather than eleven.
- `design-language.md` gains the identity ramp beside the category hues, and its decorative-palette
  rule stops being a rule with no values. `tokens.css` gains five tokens in both theme blocks.
- Members are reachable in one tap from any tab, and the group is never truncated.
- Most members get a real photo with no consent prompt and no new scope.
- **The ramp had its first visual pass in this session, and it changed the answer.** The hues were
  chosen numerically against stated constraints, then **rendered against the shipped CSS** — which cut
  the sixth (§5) and found the two defects in §10. ADR-0125 is the precedent for why this matters: a
  palette that measured fine and read as one hue on a real screen. What is still unseen is the ramp on a
  **real device** and in **dark mode** (the remap values are unwritten), and at `xs` size in the chrome,
  where `plum` and `rose` are closest. Judge those before calling the values final.
- **The mockup is bound to the app's CSS, not a copy of it.** It carries an `APP-CSS` manifest, so
  `tokens.css` + `App.css` + `screens.css` are inlined verbatim and any shell change shows up in its
  `git diff`. Re-run `mockups/tools/inline-app-css.mjs` after touching those files.
- A co-member's renamed self stays stale until their next snapshot (§8).
- Offline, avatars fall back to initials; nothing else on the roster degrades (§4).

## Alternatives considered

- **Grow the sheet, or keep the sheet and add an edit route.** Rejected per the owner's call: the first
  puts a picture picker in an overlay (ADR-0090's warning shape), the second splits one concern across
  two surfaces and needs a back rule anyway.
- **A static `parentRoute` for `/settings`.** Simplest, and wrong: it ejects an in-trip member from
  their trip to edit their own name.
- **An arbitrary `?return=<path>`.** More flexible than the closed enum and strictly worse — an
  open-redirect shape, and it can strand back on a surface that no longer exists.
- **Copy the Google photo into our own storage at sign-in.** Fixes the offline face and removes a
  third-party request per render, at the cost of dragging `storage.ts`, an encryption trust-class call
  and a refresh policy into Phase 1 to buy a decoration. Refused for now; it is the natural thing to
  reconsider **with** Phase 4, which brings that infrastructure in anyway.
- **A shipped set of illustrated/emoji avatars.** Declined by the owner. It would also be the only
  part of the picker needing artwork, and the ramp already answers "I don't want my face here".
- **Reuse the five `--cat-*` hues for identity.** Smaller by one ramp, and rejected: the avatars in the
  chrome and the pins on the canvas co-occur on the Map tab, so identity would read as category. The
  chroma rule in §5 exists precisely so the two can share hue angles without sharing meaning.
- **Per-trip unique colour assignment.** Guarantees no repeat within a group, and needs an assignment
  table, a race on concurrent joins, and a rule for the seventh member. Rejected — colour is variety,
  not identification.
- **Presence on the roster.** Genuinely cheap (the payload is already on the wire; only
  `frontend/src/lib/ws.ts:38` drops it) and genuinely useful on a live-visibility app. Out of scope by
  the owner's call, kept as a backlog line — with the note that the FE/BE type mismatch is a trap
  either way: consume it or say in the type why it is ignored.
- **Recent activity per member,** from `Change.actorUserId`. Derivable, and `ChangeFeed` already
  narrates it — but it turns a roster into a scoreboard, which an invite-only app with no social layer
  should adopt deliberately rather than inherit.
- **Making `user` a syncable entity type in v1.** See §8 — the per-trip fan-out is the cost, and the
  benefit is a rare event resolving minutes sooner.
