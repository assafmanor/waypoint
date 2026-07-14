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
- **When you're here:** the **landing** when authenticated with trips but **none live** (all upcoming/past — don't auto-open a future trip); and reached from inside a trip via the header — the **trip name is a tappable pill with a ▾ in a circle** (a clear switcher affordance, distinct from the ⚙ settings button), navigating to `/trips`. Returning is the header **‹ back** on the all-trips page or tapping a trip. Replaces the old switcher sheet (one surface, both entries). Single-trip: the name is plain text, no pill.
- **Contents:** a list of the user's trips (flag/name + destination/meta + a **now / soon / past** chip derived from dates); the trip you came from is marked "נוכחי". A single **＋ Create** (→ `/new`) — no Join button (joining starts from an invite link, ADR-0030; the zero-state keeps Join for first-run).
- **Flow:** tap a trip → set active-trip (`localStorage`) → navigate to its surface.
- **States:** landing (no current marked) · from-trip (current marked, its chip reads "עכשיו") · single trip (header shows the name, no ▾) · offline (switching among cached trips works; create disabled).
- **Design reference:** `mockups/all-trips-v1.html`.

### 6. Account — header sheet (not a route)

- **Purpose:** identity + sign-out, kept minimal.
- **Entry:** the account avatar in the in-trip header — a **ringed** avatar sitting after the member cluster, next to the **⚙ trip-settings** gear (two distinct controls: account = you, gear = this trip's settings).
- **Contents:** large avatar, display name, email, a quiet "מחובר עם Google" line (no Google logo), and **Sign out** (deletes the refresh session server-side, ADR-0020). Profile editing is **deferred**.
- **Google chrome is minimal:** Google is the auth mechanism, not a badge — member avatars carry **no** per-face Google dot; the connection is stated once, quietly, in the account sheet.
- **Design reference:** `mockups/trip-dashboard-v2.html` (header account avatar + ⚙ gear; the account sheet).

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
