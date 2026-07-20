# App Shell & Trip Lifecycle

**Status:** Routing map + auth gate + login built (T-039); zero-state (T-040) and create (T-041) built. The all-trips home (`/trips`, ADR-0033), account sheet, and `/join/:token`, `/trip/:id/settings` surfaces are stubs — their content is T-027/T-042–T-044.
**Decision:** [ADR-0024](../decisions/0024-app-shell-and-trip-lifecycle.md) · **Related:** [ADR-0020 auth](../decisions/0020-auth-session-architecture.md), [ADR-0021 multi-trip](../decisions/0021-multi-trip-membership.md), [ADR-0005 roles](../decisions/0005-peers-not-roles-v1.md), [ADR-0004 integrations-are-pipes](../decisions/0004-integrations-are-pipes.md)

The **shell** is everything _outside_ a single trip: the auth gate, the no-trips zero-state, trip creation, the invite/join flow, the trip switcher, the account menu, and per-trip settings. It is chrome whose only job is to get you into a trip and back out to another — indigo/neutral only, **never amber or teal** (design-language.md). Design principle: minimize screens and minimize taps from "app open" to "inside a trip." The in-trip surfaces (Home / Days / Map / Index) are specified elsewhere; this doc stops at the trip boundary.

## Routing map

Client-side routing, single-origin PWA (ADR-0020). Login, all-trips, create, join, and settings are full-page routes; the account menu is a header-invoked sheet.

```
app load
  ├─ not authenticated ─────────────► /login
  │                                     └─ (Google) ─► resume saved intent, else "/"
  │
  └─ authenticated ─► resolve active trip (ADR-0021)
        ├─ a trip is live ──► "/"  = in-trip surface of the in-progress trip
        │                     ├─ header: [ trip name ▾ ]   → /trips (all-trips home)
        │                     │          [ avatar ]        → Account sheet
        │                     └─ header ⚙ / members        → /trip/:id/settings
        ├─ trips, none live ► /trips = all-trips home (ADR-0033)
        └─ no trips ────────► Zero-state home

full-page routes:  /login   /trips (all-trips home)   /new (create)   /join/:token
deep-link intents (esp. /join/:token) are saved before /login and resumed after
```

Active-trip selection is `tripId` in `localStorage` — per-device, **not** synced (ADR-0021, same class as the mode override). Default when unset = ADR-0021 derivation: current in-progress → nearest upcoming → most recent.

The in-trip **tab** (`?tab=` — home/map/index/days) lives in the URL for reload/deep-link survival, but is written with `replace` (flat in-trip history): "back" is _computed_ from the current nav state, not walked through history (ADR-0090, superseding ADR-0035's history-owned mechanism).

The selected **day** is deep-linkable + reload-surviving via **`?day=YYYY-MM-DD`** (UI/UX review J7 / open Q5): `resolveActiveDate` seeds `activeDate` from the param on load, and `setActiveDate` mirrors the selection back onto the _current_ history entry (`replace`, not a new entry — day scrubbing doesn't inflate the back stack). A missing, malformed, or out-of-range `?day=` falls back to today. The idle-resume reset-to-today (ADR-0060) and Plan-mode day preservation are unchanged; today keeps its amber anchor wherever you browse (ADR-0043).

## Back & the return gesture (ADR-0090, behavior from ADR-0035)

Back is a **pure function of the current navigation state** — `resolveBack(snapshot)` where the snapshot is `{ hasOverlay, insideTrip, tab, pathname, armed }` — executed as an explicit navigation. It never reads or traverses the browser history stack (whose contents are unknowable and get polluted by OAuth round-trips / PWA cold launches / `idx` desyncs — the class of bug ADR-0035's history-owned mechanism kept re-patching). Every "back" trigger resolves the same `resolveBack` and runs the same `runBack` executor:

1. open **overlay** (sheet/dialog/picker) → close it;
2. a **non-Home tab** in a trip → back to **Home** (the anchor — Home-anchor / Material bottom-nav rule: Home→tab pushes, tab→tab replaces);
3. **Home base** in a trip → **confirm, then leave to `/trips`** (ADR-0033): the first back arms a "swipe again to leave" toast, a second within ~3s exits — so an accidental swipe doesn't yank you out of the trip you're using;
4. a **shell route** (`/new`, `/join/:token`, `/trip/:id/settings`) → its parent;
5. **`/trips` / zero-state** → **no-op** (back never falls out to `/login` or exits).

Because the app is a `display: standalone` PWA (ADR-0007) with **no system back on installed iOS**, a **return gesture** triggers the same `resolveBack`: a trailing-edge horizontal pull. Full RTL (ADR-0009) mirrors the convention — the activation edge is the **right** edge, the pull goes **leftward**; it reads `dir`, never hard-codes a side. It activates from a narrow trailing-edge zone so it doesn't fight the day-strip scroll or the Plan-builder pointer drag — **except while a sheet is open, where it may start anywhere** (nothing to scroll under a modal), so back-to-dismiss feels natural. The screen tracks the finger ~1:1 with a trailing shadow; a committed **structural** back (`backSlides`: tab→Home / shell-parent / leave-trip) slides the screen fully off before the content swaps, while overlay-dismiss and the leave-trip confirm spring back.

**Android / desktop system back.** The OS owns the screen edges there, so it pre-empts the custom swipe, and the system back button/gesture traverses history. We intercept that **traversal at its source** with the **Navigation API** (`navigation` `'navigate'`, Chromium; absent on Safari/iOS, where the gesture covers it) and run the same `resolveBack`: a cancelable backward traverse is `preventDefault()`-cancelled and replaced with the computed action (a forward traverse and a `none` pass through). We never `allow` a structural traverse — in-trip history is flat and its contents are exactly what we refuse to trust — so there is no history-index reasoning left. Our own programmatic navigations are `push`/`replace`, not `traverse`, so they don't re-enter the handler. **The one limit:** a non-Chromium desktop browser tab (no Navigation API) can't be intercepted, so its back button leaves the trip in one step — accepted graceful-minimum (ADR-0017); installed iOS (gesture) and Chromium (intercepted) are fully covered. Day selection on the header strip is a lateral view change, **not** a back layer.

## Surfaces

### 1. Sign-in — `/login`

- **Purpose:** the auth gate. Google-only (ADR-0013).
- **Contents:** product mark, one **"Continue with Google"** button, nothing else.
- **Flow:** OAuth (PKCE + `state`, ADR-0020) → on success, resume the saved deep-link intent (see Join) or fall through to `/`.
- **States:** default · signing-in (button busy) · error (auth failed → retry) · offline ("You're offline — sign-in needs a connection").

### 2. Zero-state home — no trips

- **Purpose:** first landing for an authenticated user with zero memberships. In the ~5-friend model most people arrive here to **join**, one to **create** — so both are primary.
- **Contents:** a short welcome line + **two equal actions: "Create a trip" (→ `/new`)** and **"Join with a link"**. "Join with a link" explains that a trip-mate sends an invite link; if the OS handed us a link we'd already be on `/join/:token`, so this is the "I was told to open the app first" path (paste/await link).
- **States:** default · offline ("Creating a trip needs a connection — you can still open a link a trip-mate shares").
- **Design reference:** `mockups/zero-state-v1.html` — the dormant departure board ("הלוח עוד כבוי"): the board is present but unpowered (no amber/teal/pulse; shell stays chrome per ADR-0028), two equal CTAs with role subtitles, a teach line, and the offline + powered-preview states.

### 3. Trip creation — `/new`

- **Purpose:** stand up a new trip. One form, no wizard — **three inputs, everything else derived or deferred (ADR-0032)**.
- **Contents:** destination → dates → name (**auto-suggested** from destination + year, editable inline). Timezone derives from the destination (schema default); currency derives later; daily budget is deferred to settings (display-only, ADR-0014). Validated with the shared zod schema (ZodValidationPipe on the server).
- **Feel:** a live **draft-trip preview card** assembles as you type, in the soft grammar (dashed — provisional), turning solid on create. Shell chrome stays indigo/neutral.
- **API:** `POST /trips` (exists, unchanged — `createTripSchema` already defaults timezone and makes currency/budget optional). Creator's membership is `admin` (ADR-0005).
- **Flow:** on success → land _in the new trip_ (in Plan mode, being future-dated) → prompt to invite (BoardingPass share, link-only per ADR-0030).
- **States:** default · submitting · validation errors (inline, per field) · offline (creation is disabled offline — surfaced, not silently queued).
- **Design reference:** `mockups/create-trip-v1.html` (form + post-create invite prompt).

### 4. Join — `/join/:token`

- **Purpose:** turn an invite link into a membership, with a look before you leap. Joining is **link-only** — no short invite codes (ADR-0030); the app-first arrival is served by pasting the same link (see §2).
- **Preview (new endpoint):** `GET /invites/:token` — **public/unguarded**, validates the stateless HMAC token (same scheme as the invite signer) and returns `{ tripName, destination, startDate, endDate, memberCount }`. Needed because `GET /trips/:id/snapshot` is membership-guarded and cannot preview a trip you have not joined.
- **Contents:** "You're invited to **{tripName}** · {destination} · {dates} · {n} members" + a single **Join** button.
- **Auth interaction:** the preview renders **first, regardless of auth state** (the endpoint is public) — there is no eager redirect before anything is shown. For a signed-in visitor, the CTA is **Join** → `POST /trips/join/:token` → land in the trip. For an anonymous visitor, the same CTA reads **"Continue with Google"**: tapping it saves `/join/:token` as the deep-link intent **plus a pending-join flag**, then starts OAuth; sign-in **resumes** here, now authenticated, and the join **auto-completes** (the "Continue with Google" tap on the preview was the confirm — no redundant second tap; ADR-0024 §5). A fresh signed-in visit (no pending-join flag) still shows the Join button. **No consent/settings step** — joining is one tap; calendar-sync and other per-member prefs are set later in trip settings (T-044). Mockup: `s-linkjoin` in `mockups/screens-v1.html`.
- **States:** loading preview · valid → confirm · **invalid/expired token** (friendly dead-end, offer to ask for a fresh link) · already a member (skip straight into the trip) · offline (preview may hydrate from cache if the trip is known; joining needs the network).

### 5. All-trips home — `/trips` (ADR-0033)

- **Purpose:** the home base for your trips — see them as a set, switch between them, create. A navigation list, **not a dashboard**; no departure board (nothing is live here — a live trip opens directly).
- **When you're here:** the **landing** when authenticated with trips but **none live** (all upcoming/past — don't auto-open a future trip); and reached from inside a trip via the header — the **trip name is a tappable pill with a ▾ in a circle** (a clear switcher affordance, distinct from the ⚙ settings button), navigating to `/trips`. Returning is the header **‹ back** on the all-trips page or tapping a trip. Replaces the old switcher sheet (one surface, both entries). **2026-07-14 (Assaf):** the pill always shows, even with exactly one trip — a single-trip user whose only trip is live has no other path to `/trips`/`/new` (no pill + landing always opens the live trip directly = a dead end for "create a second trip"), so collapsing it to plain text was reversed.
- **Contents:** the trips **sectioned** by date-derived status — `עכשיו` / `בקרוב` / `הסתיים`. A **live trip is a prominent indigo hero** (chrome-`--indigo`, elevated, enter affordance — a loud nav card, not a board; ADR-0033 revision) under the `עכשיו` header (no on-card "active" caption — the header + prominence carry it); `בקרוב`/`הסתיים` trips are paper rows with a **soon / past** chip. Each shows flag/name + a meta line of `[destination ·] dates · member-count`, dates in mono `dir="ltr"`. A single **＋ Create** (→ `/new`) — no Join button (joining starts from an invite link, ADR-0030; the zero-state keeps Join for first-run).
- **Flow:** tap a trip → set active-trip (`localStorage`) → navigate to its surface.
- **States:** landing (no `עכשיו` section) · from-trip (the live trip is the indigo hero under `עכשיו`) · offline (switching among cached trips works; create disabled).
- **Design reference:** `mockups/all-trips-v2.html` (supersedes v1).

### 6. Account — header sheet (not a route)

- **Purpose:** identity + sign-out, kept minimal.
- **Entry:** the account avatar in the in-trip header — a **ringed** avatar sitting after the member cluster, next to the **⚙ trip-settings** gear (two distinct controls: account = you, gear = this trip's settings).
- **Contents:** large avatar, display name, email, a quiet "מחובר עם Google" line (no Google logo), and **Sign out** (deletes the refresh session server-side, ADR-0020). Profile editing is **deferred**.
- **Google chrome is minimal:** Google is the auth mechanism, not a badge — member avatars carry **no** per-face Google dot; the connection is stated once, quietly, in the account sheet.
- **Design reference:** `mockups/trip-dashboard-v2.html` (header account avatar + ⚙ gear; the account sheet).

### 7. Trip settings & members — `/trip/:id/settings` (in-trip)

- **Purpose:** manage the current trip. Reached from the header ⚙ — **not** a bottom-nav tab (ADR-0004).
- **Governance (ADR-0039):** trip-settings editing is **admin-only, enforced server-side** (peers get a read-only screen); everyday soft-plan/event editing stays open to all. Chrome is **mode-neutral** ink-on-paper (reached from both modes; route sits outside the mode Shell).
- **Contents:**
  - **Trip details:** admins edit name / destination / dates / timezone / currency / budget as **one form → one `PATCH /trips/:id`** (LWW, ADR-0012). Timezone & currency are editable now; auto-derivation from the destination is a future update. Date fields reuse PR #92's native-date handling (`lang` = `DEVICE_LOCALE`, end `min` linked to start, shared `endDate >= startDate` refine) but **do not floor to today** (an existing trip may be under way or past).
  - **Members:** list with role badges (`admin` / `peer`); a per-member **kebab opens a bottom action sheet** (the `Sheet` pattern) — **promote to admin** and **remove member**, both admin-only (`PATCH /trips/:id/members/:userId` for role; `DELETE /trips/:id/members/:userId` for removal). **Leave trip** removes your own membership; when the **last admin leaves**, another member is auto-promoted.
  - **Invite:** generate + share an invite link (`POST /trips/:id/invite`, exists; the link is `/join/:token`). Share sheet / copy.
  - **Delete trip:** admin-only, double-confirm (`DELETE /trips/:id`); removes the trip for everyone.
- **Realtime + offline (ADR-0039):** every settings mutation routes through `ChangeService` — WS broadcast after commit + client optimistic outbox — so edits appear immediately to everyone and work offline. This moved `Trip` + roster `Membership` onto the data plane (partially supersedes ADR-0022).
- **States:** default · admin vs. peer (edit/remove/manage affordances gated) · offline (reads from cache; mutations queue per the offline model).

## Cross-cutting

- **Auth boundary:** the shell is the only place the two-token session (ADR-0020) is visible to the user — sign-in creates it, Sign out destroys it, everything in between assumes it. No shell surface shows authz claims; role gating is per-trip (settings).
- **Active-trip resolution** is computed, never stored server-side (ADR-0021): derive on load, persist only the user's manual override in `localStorage`.
- **Mode-agnostic:** the shell never shows Plan/Trip mode; mode is derived _inside_ a trip from its dates (ADR-0016). Creation simply lands you in a (usually Plan-mode) trip.
- **Offline (sync-and-offline.md):** switching among already-cached trips is a first-class offline path; sign-in / create / join require the network and say so rather than silently queueing.
- **RTL / Hebrew (ADR-0009):** all shell copy is Hebrew, full RTL; Latin runs (dates, codes) wrapped `dir="ltr"`.
- **Design (design-language.md):** indigo/neutral chrome; hard/soft grammar and amber/teal do not appear in the shell.

## What this adds to the build

- **Backend:** one new endpoint — public `GET /invites/:token` (preview). Everything else (`POST /trips`, `join`, `invite`, `members` delete, `GET /trips`) already exists.
- **Frontend:** the shell router + the seven surfaces above; finalizes **T-027** (switcher), and widens **T-008** (Home) / **T-019** (mode) to be active-trip-aware. Built alongside **T-007** (auth).
- **Deferred (recorded, not built):** profile editing; a rich trips archive/search; overlapping in-progress trips (ADR-0021 already defers the "which trip is primary now" resolution).
