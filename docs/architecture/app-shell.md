# App Shell & Trip Lifecycle

**Status:** PROPOSED (target — not yet built; the design half of the app shell, built alongside T-007 auth)
**Decision:** [ADR-0024](../decisions/0024-app-shell-and-trip-lifecycle.md) · **Related:** [ADR-0020 auth](../decisions/0020-auth-session-architecture.md), [ADR-0021 multi-trip](../decisions/0021-multi-trip-membership.md), [ADR-0005 roles](../decisions/0005-peers-not-roles-v1.md), [ADR-0004 integrations-are-pipes](../decisions/0004-integrations-are-pipes.md)

The **shell** is everything _outside_ a single trip: the auth gate, the no-trips zero-state, trip creation, the invite/join flow, the trip switcher, the account menu, and per-trip settings. It is chrome whose only job is to get you into a trip and back out to another — indigo/neutral only, **never amber or teal** (design-language.md). Design principle: minimize screens and minimize taps from "app open" to "inside a trip." The in-trip surfaces (Home / Days / Map / Index) are specified elsewhere; this doc stops at the trip boundary.

## Routing map

Client-side routing, single-origin PWA (ADR-0020). Only three shell routes are full pages; the switcher and account menu are header-invoked sheets.

```
app load
  ├─ not authenticated ─────────────► /login
  │                                     └─ (Google) ─► resume saved intent, else "/"
  │
  └─ authenticated ─► resolve active trip (ADR-0021)
        ├─ has trips ──► "/"  = in-trip surface of the active trip
        │                     ├─ header: [ active trip ▾ ]  → Switcher sheet
        │                     │          [ avatar ]         → Account sheet
        │                     └─ header ⚙ / members         → /trip/:id/settings
        └─ no trips ───► Zero-state home

full-page routes:  /login   /new (create)   /join/:token
deep-link intents (esp. /join/:token) are saved before /login and resumed after
```

Active-trip selection is `tripId` in `localStorage` — per-device, **not** synced (ADR-0021, same class as the mode override). Default when unset = ADR-0021 derivation: current in-progress → nearest upcoming → most recent.

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

### 3. Trip creation — `/new`

- **Purpose:** stand up a new trip. One form, no wizard.
- **Contents (= `createTripSchema`):** name, destination, start date, end date, timezone (default from device/destination, editable), and _optional_ currency + daily budget (display-only, ADR-0014). Validated with the shared zod schema (ZodValidationPipe on the server).
- **API:** `POST /trips` (exists). Creator's membership is `admin` (ADR-0005).
- **Flow:** on success → land _in the new trip_ (in Plan mode, being future-dated) → prompt to invite (deep-links into Trip settings' invite share).
- **States:** default · submitting · validation errors (inline, per field) · offline (creation is disabled offline — surfaced, not silently queued).

### 4. Join — `/join/:token`

- **Purpose:** turn an invite link into a membership, with a look before you leap.
- **Preview (new endpoint):** `GET /invites/:token` — **public/unguarded**, validates the stateless HMAC token (same scheme as the invite signer) and returns `{ tripName, destination, startDate, endDate, memberCount }`. Needed because `GET /trips/:id/snapshot` is membership-guarded and cannot preview a trip you have not joined.
- **Contents:** "You're invited to **{tripName}** · {destination} · {dates} · {n} members" + a single **Join** button.
- **Auth interaction:** if not signed in, save `/join/:token` as the intent, route to `/login`, and **resume** here after sign-in. Then Join → `POST /trips/join/:token` (exists) → land in the trip.
- **States:** loading preview · valid → confirm · **invalid/expired token** (friendly dead-end, offer to ask for a fresh link) · already a member (skip straight into the trip) · offline (preview may hydrate from cache if the trip is known; joining needs the network).

### 5. Trip switcher — header sheet (not a route)

- **Purpose:** navigate _between_ trip instances (ADR-0021). Explicitly not a dashboard.
- **Entry:** the active trip's name in the in-trip header, with a ▾ affordance.
- **Contents:** a list of the user's trips (name + a **now / soon / past** chip derived from dates), plus **＋ Create** (→ `/new`) and **Join with a link** at the bottom.
- **Flow:** tap a trip → set active-trip (`localStorage`) → navigate to its surface and close.
- **States:** single trip (header shows the name, no ▾ / no-op) · loading (from cached `GET /trips`) · offline (fully usable across already-cached trips — reads only).

### 6. Account — header sheet (not a route)

- **Purpose:** identity + sign-out, kept minimal.
- **Entry:** the avatar (initial on `User.avatarColor`) in the header.
- **Contents:** display name, email, **Sign out** (deletes the refresh session server-side, ADR-0020). Profile editing is **deferred**.

### 7. Trip settings & members — `/trip/:id/settings` (in-trip)

- **Purpose:** manage the current trip. Reached from the header ⚙ — **not** a bottom-nav tab (ADR-0004).
- **Contents:**
  - **Invite:** generate + share an invite link (`POST /trips/:id/invite`, exists; the link is `/join/:token`). Share sheet / copy.
  - **Members:** list with role badges (`admin` / `peer`); **remove member** is admin-gated (ADR-0005; `DELETE /trips/:id/members/:userId`, exists); **Leave trip** removes your own membership.
  - **Trip details:** edit name / dates / timezone / currency / budget (LWW, ADR-0012; these are control-plane edits until the sync core lands).
- **States:** default · admin vs. peer (remove/manage affordances gated) · offline (reads from cache; mutations queue per the offline model).

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
