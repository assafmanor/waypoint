# 0133 — The user is a surface: one settings route, one `Avatar` primitive, an identity ramp, and a roster you can reach

**Status:** Accepted (design; build in the phases of §11)
**Date:** 2026-07-28
**Builds on:** [0086](0086-document-upload-pick-control-redesign.md) (the one file-pick control — upload + camera), [0020](0020-auth-session-architecture.md) (the two-token session, `GET /me`), [0028](0028-plan-violet-color-budget-dark-ready.md) (the semantic colour budget), [0039](0039-trip-settings-admin-governed-data-plane.md) (trip settings is the admin-governed plane), [0090](0090-back-is-computed-from-nav-state.md) (back is computed, `parentRoute`), [0017](0017-mobile-first-device-targets.md) (touch-first, no hover-only affordances)
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

The three existing mounts (`App.tsx:504` in-trip, `ZeroStateWithAccount:562`, `AllTripsWithAccount:575`)
become navigations. The entry points do not change — they already reach every shell, which is why "from
the trip and outside" needed no new affordance.

**Concretely: tapping your avatar is the way in, and the sheet it opens today is the thing being
replaced.** That sheet (name · email · `מחובר עם Google` · `התנתקות`) is not a step on the way to
settings and does not gain a "settings" row — every fact on it is already on the page, so keeping it
would mean one surface whose only job is to link to another. The avatar navigates straight to
`/settings` from all three shells, which also makes the gesture uniform: in a trip the avatar sits beside
the gear (**avatar = you, gear = this trip**), and on `/trips` and the zero state it is the only control
there.

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

**Build note (Phase 1, 2026-07-28) — two refinements this ADR's first draft got slightly wrong:**

1. **A hue is stored as its KEY, not as a hex.** The draft called the field `avatarColor` and treated it
   as a colour. But this section also requires the ramp to "join the dark remap table like every other
   token", and a stored `#8496B5` cannot follow a remap — it is a literal. So the column is `avatarHue`
   and it holds `plum|rose|moss|denim|cocoa`; the values live once, in `tokens.css`, under both theme
   blocks. The `Avatar` primitive paints `var(--id-<hue>)`, so dark mode reaches a stored pick for free.
   A key is also **validated**: an unknown hue is a 400 at the schema, where an unknown hex was simply an
   un-renderable string.
2. **"Always present" moved from the column to the wire.** The draft said the field is always present
   because initials need a ground. The column is in fact **nullable** — null is precisely "never chosen",
   which is what makes the default _derived_ rather than stored, and a stored default is the whole defect
   this ADR opened on. What is always present is the **DTO**: `toUserDto` resolves it
   (`resolveAvatarHue(id, stored)`), so a null column can never reach a render and no client owns the
   fallback. `resolveAvatarHue` also derives for a value **outside** the ramp, which is what makes the
   pre-ADR `#E9A63C` rows land on a real hue rather than a broken one.

### 6. The picture page has two states, and the ramp appears only when it is in effect

**Revised 2026-07-28 (owner), replacing a flat three-peer list.** The first draft showed Google-photo,
upload and the colour ramp as three peers and made the tap imply `avatarChoice`. That was too clever in
one direction and dishonest in another: it offered a colour choice that had **no visible effect** while a
photo was in use, and one tap silently did two things (switch source _and_ pick a hue).

The page now presents **the avatar you have, and what you can do to it** — one state at a time:

| State                                        | The page shows                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **A photo is in use** (`google` or `upload`) | the photo large · **upload / replace** (Phase 4) · **remove the photo**. **No colour ramp.**                          |
| **No photo is in use** (`initials`)          | the initials large on the current hue · **the ramp** · **use my Google photo** (when there is one) · upload (Phase 4) |

So the ramp is **revealed, not hidden** — it appears exactly when the colour is the thing being rendered.
And **choosing not to use a photo is its own act**, distinct from picking a hue: you remove the photo,
which lands you on initials, and _then_ the hue is a real choice.

**The defaults are unchanged and are what make this cheap:** Google gave a photo → `google`; it did not →
`initials`. Most members never open this page and still get a real face.

**Removal semantics, because "remove" means different things per source:**

- **Removing the Google photo** means "don't use it". Nothing is deleted at Google, and `googleAvatarUrl`
  is **kept** — which is what makes `שימוש בתמונה מגוגל` a real way back rather than a dead end. It is
  re-fetched at each sign-in regardless.
- **Removing an upload** deletes the blob and falls back to **the Google photo if there is one**, else
  initials — the least surprising landing, since the provider's photo is still true.

**The avatar is the control — a badge on it, not a drop-zone beside it.** `ui/primitives/FilePicker`
(ADR-0086) is the right **mechanism** and the wrong **presentation** here, and the difference is worth
stating because the first draft of this section got it backwards. FilePicker gives a document two
equal-weight, dashed, drop-zone-like tiles, and that is correct **for a document**: a document has no
on-screen representation yet, so there is nothing to point at and the tiles have to be the target. An
avatar is the opposite case — the thing you are changing is **already on screen, large, and round**. So:

- **The hero avatar is the primary affordance**, carrying a small filled **camera badge** on its lower
  edge (mirrored to the RTL side). This is the one convention that needs no label, and it is what every
  profile surface people already use does.
- **One primary action** beneath it (`העלאת תמונה` / `החלפת תמונה`) and **one subordinate link**
  (`שימוש בתמונה מגוגל`, or the `הסרת התמונה` link in `--miss`). **Stacked, never side by side** — a
  first pass put two pills in a row and they immediately read as a **segmented toggle**, i.e. as a
  source _choice_, which is the exact confusion this section exists to remove.
- **The ramp gets a label** (`צבע הרקע`) so it reads as "the colour behind your initials" rather than a
  free-floating swatch row.

**What is reused is FilePicker's mechanism, not its layout:** the off-screen `<input>`s, `accept="image/*"`,
`capture`, the coarse-pointer feature-detect that hides capture where there is no camera, and the
picked-file preview/clear handling. That belongs in the primitive as a **variant** (an avatar-shaped
trigger), not a second component and not a fork — one control, two presentations, which is what rule 8
asks for when a shared mechanism meets a genuinely different surface. **And "or camera" costs nothing**:
`capture` is already a FilePicker prop, and photographing yourself is the phone-first act ADR-0017 wants.

Two small additions it needs: the **label override** (`t.filePicker.upload` is the generic `העלאת קובץ`;
a photo wants `העלאת תמונה`), and **`camera` on `ui/Icon`** — FilePicker currently draws its tiles with
the `⬆️`/`📷` emoji, which design-language's "emoji are content, icons are UI" forbids on a control. The
badge uses a real SVG, so this ADR does not propagate the emoji; retrofitting the document tiles is a
separate, optional cleanup.

**What Phase 4 defers is the storage half, not the control.** The first draft said "upload is absent until
Phase 4" as though the UI were the work. It is not: the trigger is a badge and a pill, and what is
actually missing is somewhere to put the bytes — a size ceiling, a crop/resize step, and the trust-class
call against `storage.ts` (ADR-0015/0034). Phase 2 therefore ships the page **without** the upload
affordances, for the near-me reason (ADR-0109 §6 / ADR-0115's research half): a control that picks a file
nothing can persist is worse than no control, and it is **absent rather than greyed**, because a disabled
button invites a tap and explains nothing. In Phase 2 the photo state carries the remove link and the
initials state carries the ramp plus the way back. **The mockup shows the finished page**, since it is the
design reference and not a screenshot of the Phase 2 build.

`avatarChoice` survives this change unaltered — `initials` is precisely "chose not to use the photo". What
changed is that the page stopped exposing the enum as three peers and started showing its **effect**.

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

### 9. The roster names who is here; a tap opens the one member surface

**Revised 2026-07-28 (owner) on two points:** the roster row **drops the joined date** ("a little too
much" on a row whose job is _who is here_), and a row is **tappable** — you open a member to see their
details. The date is not deleted, it moves to where detail belongs.

So the two surfaces divide by question:

- **The roster** answers _who is on this trip_ — avatar, name, `admin`/`peer` role, and a `you` marker.
  Nothing else. Every member, no cap.
- **The member surface** answers _who is this_ — the avatar large, name, role, **joined date**, and, for
  an admin looking at someone else, the existing promote/remove verbs.

**That member surface is `MemberSheet` generalized, not a second one.** Trip settings already has it
(`TripSettings.tsx:640`) — a `Sheet` with a `.ms-who` identity header plus promote/remove, gated at the
call site by the `isAdmin && !isMe` condition already written there. It gains the detail rows and both
entry points open it. Rule 8: generalize the one-off rather than stand a near-identical sheet beside it,
and it is a small extraction (~35 lines), not the substantial refactor that rule says to ask about first.

**This corrects the first draft, which said "two surfaces would mean two gates".** That was wrong: the
gate is **one** and it is server-side (ADR-0039 enforces it in the service), so two entry points to one
component are not two gates. The real constraint is that there must be one member **component**, and the
admin verbs are gated by role — not by which surface you arrived from.

Three things follow, and one removes a mechanism:

- **`MEMBER_AVATAR_CAP` stops being a truncation and becomes a rendering detail.** Once one tap lists
  everyone, `+2` is no longer a dead end hiding half the group — the overflow problem is deleted rather
  than redesigned.
- **The cluster keeps showing _others_,** and the account avatar keeps its ring beside the gear. That
  split is app-shell.md §6's and it survives: avatar = you, cluster = them, gear = this trip.
- **The roster row and trip settings' `.set-member` share one rendering,** not two member-row components.

**Email is deliberately not on the member surface.** Joining is by link (ADR-0030/0067), so co-members
may never have exchanged addresses, and nothing in a trip needs one; showing it would publish an
account-identifying fact the app never promised to share. Reversible if a real need appears — it is a row,
not an architecture.

What the member surface still does not say, all three by decision: **presence** (already broadcast at
`sync.gateway.ts:165-173` and dropped by the client), **recent activity**, and **location** (ADR-0006).
Those are the natural growth slots, and the honest read is that a peer looking at a peer sees a thin
card today — identity, role, joined. That is what we actually know about a member.

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

### 12. Phase 4's trust-class call: an avatar is published, so it is not a document

**Added 2026-07-28 with the Phase 4 build.** §6 said what the control is; this is the
half it deferred, and the answer is a deliberate _divergence_ from the documents path
rather than a reuse of it.

**Documents are trip-scoped secrets. An avatar is a face we publish to the group.** That
one difference decides everything below, and getting it backwards in either direction
would be wrong — encrypting the avatar would be theatre, and serving a document the way
we serve an avatar would be a vulnerability.

|                   | Document (ADR-0015/0034)      | Uploaded avatar                         |
| ----------------- | ----------------------------- | --------------------------------------- |
| Encrypted at rest | **Yes**, `DOC_ENCRYPTION_KEY` | **No**                                  |
| Auth on read      | Bearer token                  | **None** — unguessable-capability URL   |
| Disposition       | `attachment`, always          | **`inline`**, so an `<img>` can draw it |
| Declared type     | Trusted from the upload       | **Sniffed from the bytes**              |
| Cacheable         | No                            | A year, `immutable`                     |

- **Not encrypted, because there is nothing to protect it from.** Encryption at rest
  guards a passport scan against blob-store compromise. This picture is shown to every
  co-member by design; encrypting it would buy no confidentiality and cost the hard
  caching an `<img>` wants, since every render would need a decrypt.
- **Unauthenticated, because an `<img>` cannot send a bearer token.** The alternative is
  what the document viewer does — fetch to a Blob, make an object URL — and putting that
  in `Avatar` would make a presentational primitive async, on every roster row, for a
  decoration. The key is a `randomUUID` handed out only in a `User` DTO, which is
  _precisely_ the trust class of the `googleAvatarUrl` this app already hotlinks: Google
  serves that photo unauthenticated to anyone holding the URL. Guarding ours harder than
  the photo it substitutes for would be theatre.
- **Inline is safe here because the type is proved, not believed.** A document can trust a
  declared `mimetype` only because it never renders what it stored. An avatar does render,
  so `sniffImageMimeType` reads the container signature, the response pins
  `Content-Type` to _that_ (never the client's claim) with `nosniff`, and the allow-list
  is the three raster types a browser draws — no SVG (a script document wearing an image
  type; it has no binary signature, so "unrecognised" already rejects it), no HEIC, no
  animated GIF. A JPEG/HTML polyglot is still only ever parsed as what we declare.
- **The key is in the path, which is what makes `immutable` honest.** The URL contains the
  blob's own id, so those bytes can never change at that URL; a replace mints a new key
  and therefore a new URL, and the retired one 404s. That is also what makes "remove the
  photo" actually stop serving the photo — the key is _matched_ against the user's
  current one, not merely looked up.
- **The ceiling is enforced twice, and neither is the interesting one.** The client
  centre-crops to a square and re-encodes to a ≤512px JPEG before anything leaves the
  phone, so a 4 MB camera photo arrives around 60 KB and the 512 KB server cap is a bound
  on a hostile client rather than a limit real users meet. The crop is also the only way
  to get a _square_ honestly — CSS cropping a rectangle into a circle just hopes the face
  is centred.
- **`storage.ts` moved to `common/`.** It was never document-specific — an opaque-keyed
  byte sink with a dev-disk fallback — and the second caller made its address a lie.
  `blob-cache.ts` moved with it, being purely its cache tier. The `DOC_`-prefixed env var
  and its default path stayed: it is one flat keyspace of UUIDs, and renaming them would
  strand every blob an existing dev install has written to buy a tidier word.
- **`usePickFile`, not a `FilePicker` variant.** §6 asked for the mechanism as a variant
  of the primitive. Building it showed the honest shape is a _hook_: the plumbing
  (off-screen inputs, `accept`, `capture`, coarse-pointer detect, reset-after-pick) is
  genuinely shared, while the two presentations — dashed tiles for a document that has no
  on-screen representation, a badge on the face for an avatar that does — share nothing.
  A `variant` prop switching between two unrelated trees would have been one component
  pretending to be one thing. Camera **facing** became a parameter in the process: a
  document wants the rear camera, a self-portrait the front one, and the original
  hardcoded `environment` would have pointed the camera away from the subject.
- **The label override §6 asked for turned out unnecessary.** With the hook holding no
  copy, the picture page names its own actions and `FilePicker` keeps its generic ones —
  so there is no override to add.

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
  palette that measured fine and read as one hue on a real screen.

  **Closed 2026-08-02 ([ADR-0158](0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md)
  §12), with no change to the values.** The pass this bullet owed has run, in both themes, at every
  size the ramp ships at. `plum`/`rose` is ΔE00 13.4 light / 12.1 dark and separable at 26px. Two
  corrections to what this ADR assumed: the dark remap values were **written** all along (Phase 1 put
  all five in the `[data-theme='dark']` block) — what was missing was that nothing set `data-theme`,
  so they had never rendered; and the risk was not plum-vs-rose but **identity-vs-category**, since
  §5's chroma margin measures collapsed in dark (`--id-moss` 25.5 against `--cat-leisure` 26.2). That
  one did not survive the render either — a saturated teardrop on a canvas and a muted disc with an
  initial stay different objects. What the pass did settle: §5's one-ink-for-every-hue rule is now
  **measured** — `#12203A` clears 5.42 minimum in light and 6.61 in dark.

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

## Amendment (2026-08-02) — a third §10 defect on the same row: the badge column was ragged

Reported off the shipped screens: _"משתתף and מנהל — the 3 dots make these titles become
unaligned."_ Same row, same reuse decision as §9/§10, and the same cost paid once.

`.set-member` is a flex row ending `… role → children`, and in the settings party list the
`children` slot holds a kebab only on rows that **aren't you** (yours has no admin verbs
aimed at it). So `מנהל` on your own row sat flush at the row's end while every `משתתף`
below it was inset by the kebab's width — a badge column that stepped in and out down a
list whose whole job is to read as one set of peers.

The trailing control is now a **fixed column that stays open when it is empty**
(`.member-act`, `MemberRow`'s `reserveAction`), which is `ListRow`'s sync column (ADR-0091)
applied to the other managed list rather than a second idea. It is reserved per **list**,
not per row: a row sees only its own missing control, so a row cannot make this call, and a
non-admin — where no row has a kebab — reserves nothing and keeps the tight edge. The
kebab also came up to the 44px touch floor (ADR-0017) via `.wp-listrow-kebab`'s negative-margin
trick, so its hit area grew inside the 32px the column is measured on; this copy of the
control had been missed when the other was raised.

**Holding the column open was only half of it, and the owner's follow-up named the other
half:** _"they're both left aligned in their own cells and should right align there."_ With
the kebab no longer moving them, the pills' **outer** edges lined up — and a pill hugs its
own text, so `מנהל` being shorter than `משתתף` left the two WORDS ragged where you actually
read them. The badge now rides a width-floored cell (`.member-role`) and sits at its inline
**start**, which in RTL is the right: the labels begin at one x, and the ragged edge is the
one facing the kebab, where nothing reads across rows. The floor is in `em` so it tracks the
badge's type size instead of snapshotting today's pixels, and a longer label grows the cell
rather than overflowing it. It lands on the roster too, since both lists render `MemberRow`
— the point of §9's shared row.
