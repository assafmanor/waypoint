# 0101 — Full-screen search mode (`Modal` `'full'` variant + `SearchOverlay`), and dedicated-screen headers name what's open

**Status:** Accepted
**Date:** 2026-07-21
**Supersedes:** [0100](0100-index-bookings-header-search-redesign.md) §3 (the covering-search-in-place mechanism on the bookings screen's chip row) — §1, §2, §4, §5, §6 (the merged header row, dense chip+search row layout, real-SVG search icon, mode-tinted accent, edge-fade) are unaffected.
**Touches:** [0079](0079-single-modal-primitive.md) (a third `Modal` variant, same overlay/focus machinery), [0090](0090-back-is-computed-from-nav-state.md) (no change — a `'full'` overlay still registers via the same `useOverlay`), [0098](0098-index-landing-and-dedicated-screens.md) §1 (`IndexBackRow`'s title)
**Relates:** [0096](0096-per-domain-claude-md-guides.md) (the reuse-existing-infrastructure rule this change follows)

## Context

Post-ADR-0100 feedback, in order:

1. **Search-in-place breaks down on a real phone.** ADR-0100 §3's design — tapping
   the search icon covers the category-chip row in place, in the same compact
   header area — reads fine on a static screenshot, but once the on-screen
   keyboard opens it covers most of the remaining screen, hiding almost every
   result. There was no room in that design for the keyboard at all.
2. **Both dedicated screens' header names the wrong thing.** `IndexBackRow`
   (shared by the bookings and documents screens, ADR-0098 §1) always renders
   the generic `"אינדקس"` label, regardless of which screen is actually open —
   confusing on the bookings screen especially, since "אינדקס" names the tab,
   not the content in front of you.
3. Several smaller Index-bookings issues surfaced alongside these: the
   category-chip row still renders a chip for a booking type the trip has zero
   of (ADR-0098 §2 deliberately initializes every type to 0 so the chip always
   renders — worth revisiting now that it reads as clutter rather than
   affordance); the past-bookings toggle gates on the trip's _global_ past
   count rather than the _currently filtered_ one, so selecting a category with
   bookings but no past ones still shows a "(0)" toggle; the "no matches" empty
   state text reads as if nothing exists when matches are simply collapsed
   under "past"; the zero-bookings-at-all empty state's copy/emoji felt
   unfinished next to the documents screen's warmer equivalent; and tapping
   "add booking" from within a category filter didn't carry that category into
   the new booking's type.

## Decision

**1. Search becomes a full-screen mode, not an in-place cover, via a new third
`Modal` variant.** `ui/primitives/Modal.tsx`'s `ModalVariant` gains `'full'`
alongside `'sheet'`/`'dialog'` — opaque (`var(--screen)`, matching the app's own
page background, not the translucent scrim the other two variants use, since
this variant _replaces_ chrome rather than floating over it), full viewport,
no backdrop-click-to-close (nothing "outside" it to tap-dismiss to; only the
screen's own explicit back control calls `onClose`). Built on the exact same
`useOverlay`/`useDialogFocus` machinery every other overlay uses — ADR-0090's
back-stack needs no change at all, a `'full'` overlay is closed by the same
"close the topmost registered overlay" rule as a sheet or dialog.

Because `.modal-overlay` was already `position: fixed; inset: 0; z-index: 20`
— above both the trip header (`.header`, `position: relative`) and the bottom
tab bar (`.nav`, `position: sticky`, no explicit `z-index`) — this variant
visually replaces both **for free**. No change to `AppShell`/`Shell`/`App.tsx`
was needed to "hide the header and nav" during search mode; it falls out of
the existing stacking order once the overlay is opaque instead of a dim scrim.

**2. A new generic primitive, `ui/primitives/SearchOverlay.tsx`, owns the
shell** (compact top bar: back control + title + optional context label →
pinned search field → `flex:1; overflow-y:auto` results region), built on
`<Modal variant="full">`. It is domain-agnostic on purpose (ADR-0096): query
state and result filtering stay with the caller, which passes the
already-filtered, ready-to-render list as `children` — the same shape
`IndexBookingsView` already had via `lib/index-bookings.ts`'s pure
`visibleRows`/`matchesQuery`. This is what makes it reusable for a future
document search or any other "type to filter, on a full screen" need, rather
than a second one-off search implementation.

**3. Entering search mode pops the keyboard immediately — an intentional,
narrow exception to `useDialogFocus`'s "never autofocus a field" rule.**
`useDialogFocus` (`lib/useDialogFocus.ts`) has always focused the dialog
_container_ on mount, specifically to avoid surprising a user with a keyboard
the moment an ordinary sheet opens. Search mode is the one case where popping
the keyboard on entry _is_ the point — the whole reason to tap the search icon
is to type. Rather than duplicate focus/Escape/restore logic in `SearchOverlay`
itself, `useDialogFocus` gained an optional `initialFocusRef`: when given, it
focuses that element instead of the container; every existing caller omits it
and keeps the old behavior. `Modal` gained a matching pass-through prop.

**4. The search-mode top bar wears the trip header's own mode-tinted chrome
identity, not a plain bar of its own.** An early build shipped a plain
light/white top bar, which read as a foreign overlay bolted onto the app
rather than a continuation of it — losing the header's "iconic" blue-in-Trip /
light-drafting-table-in-Plan identity (ADR-0028) the instant search mode
opens. Fixed by extracting that identity out of `.header`/`.gear-btn`/
`.offline-badge` (App.css) into three shared, self-contained classes — rather
than adding a second copy for the new bar (ADR-0096):

- **`.mode-chrome`** — the background/color/position + Plan-mode drafting-grid
  texture `.header` already had, generalized. Self-scoped on the surface's own
  `data-mode` attribute rather than `.app[data-mode='plan'] .header`, since
  `SearchOverlay` portals to `document.body`, outside the `.app` subtree — an
  ancestor selector could never reach it. `.header` now carries `data-mode`
  itself too (App.tsx) so both the real header and the portaled search bar
  read off the identical rule.
- **`.chrome-ghost-btn`** — the settings gear's borderless ghost-icon-on-chrome
  treatment, generalized for the search bar's back control.
- **`.chrome-chip`** — the header's translucent offline/pending pill treatment,
  generalized for the search bar's trip-name context label.

`.header`/`.gear-btn`/`.offline-badge`'s own rules stay as comma-joined
selectors alongside the new shared classes (e.g. `.gear-btn, .chrome-ghost-btn
{ … }`) — one declaration block, not two copies — so the real header's
existing, already-shipped behavior is provably unchanged (verified visually in
both modes) while the search bar picks up the identical treatment for free.

**5. `Modal`'s `full`-variant card needed its own background fix.** The base
`.modal-card` rule fills it with `var(--card)` (white); since a `full` card is
100% of the viewport, it fully hid the overlay's own `var(--screen)`
background the results area was supposed to show through — the "greyish
background" was silently missing. Fixed with an explicit `background:
var(--screen)` on `.modal-overlay[data-variant='full'] .modal-card`.

**6. The bookings screen's chip row goes back to being plain, permanent
content.** ADR-0100 §3's `chip-slot`/`chip-slot.searching`/`search-inline2`
cover-in-place mechanism is retired outright — the category chips (ChoiceGrid
pills) no longer need to fade/shift for anything, since search now exits to
its own full screen instead of displacing the chip row. `IndexBookingsView`
tapping the search icon now just opens `SearchOverlay`.

**7. `IndexBackRow` takes a required `title` prop instead of a hardcoded
label** — each dedicated screen names what's actually open:
`IndexBookingsView` passes `t.index.bookingsTitle` ("הזמנות"),
`IndexDocumentsView` passes `t.docs.title` ("מסמכים"). This is the standard
any future dedicated screen sharing this header follows — pass your own
title, don't reuse the generic "אינדקס" string.

**8. Four smaller Index-bookings refinements, bundled here since they were
raised in the same feedback pass:**

- The category-chip row omits a chip entirely for any `BookingType` the trip
  currently has zero of (`"הכל"` always stays). `countByCategory` (`lib/
index-bookings.ts`) still initializes every type to 0 — only the call site
  building the chip options now filters on count, so a category whose last
  booking gets deleted while its chip is selected falls back to `"הכל"`
  (derived at render time, not a separate reset effect).
- The past-bookings toggle gates on the _currently filtered_ past-match count,
  not the trip's global past count — a category with bookings but none of
  them past no longer shows an empty "(0)" toggle.
- The "no active bookings" empty state (reworded from "no matching bookings")
  fires whenever there's nothing upcoming to show — by a filter, a search, or
  simply because everything's already past — with an optional hint line
  pointing at the past toggle when that's specifically why the list looks
  empty; the true zero-bookings-at-all empty state got a copy/icon refresh to
  match the documents screen's voice.
- Tapping "add booking" while a category chip is selected seeds that type into
  the create form, via `BookingSheet`'s existing `seed?: BookingSeed` prop
  (already used by the Plan-home checklist for the same purpose, ADR-0061) —
  reused, not a new mechanism.

## Consequences

- `mockups/index-bookings-compact-v2.html` (ADR-0100's reference) still
  describes the chip+search _row_ layout accurately; its in-place search-open
  animation is no longer what ships — a follow-up mockup pass isn't required
  since the shipped behavior (a full-screen mode) is closer to what Assaf's
  original reference screenshot showed for search specifically.
- `Modal`/`useDialogFocus` are now used by four call shapes (`sheet`,
  `dialog`, `full`, and `full` with `initialFocusRef`) — still one primitive,
  no parallel overlay mechanism introduced.
- `docs/backlog.md`: no line existed for "port ADR-0100" (it had already
  shipped), so nothing to prune there for this ADR beyond what's covered by
  the session note. A follow-up backlog line is added for extending
  `SearchOverlay` to a documents search once one is needed, and for
  investigating the separately-reported general back-navigation inconsistency
  (out of scope here — see the session note).
- No backend or `@waypoint/shared` change — presentation and local
  view/animation state only, same scope as ADR-0098/0100.
- `App.css`'s `.header`/`.gear-btn`/`.offline-badge` rules are now split
  between their own layout-only declarations and the shared `.mode-chrome`/
  `.chrome-ghost-btn`/`.chrome-chip` classes (comma-joined selectors, same
  values, not duplicated) — any future surface needing "this is app chrome,
  tinted by mode" identity (Trip blue / Plan drafting-table) reuses these
  three rather than a fourth copy.

## Alternatives considered

- **Keep covering the chip row in place, just shrink the trip header too**
  (thread a "search mode" flag up through `AppShell`/`Shell` to conditionally
  hide `Header`/`nav`). Rejected: it would touch the app-wide shell for a
  single screen's need, duplicate what a `Modal` variant already gets for
  free via z-index/stacking, and break the "every overlay is a `Modal`"
  invariant (ADR-0090) by inventing a second, parallel way to hide chrome.
- **A bespoke full-screen component, not a `Modal` variant.** Rejected per
  ADR-0096: it would either hand-roll overlay-stack registration and focus
  handling a second time, or (worse) skip `useOverlay` and silently break
  back/Escape for that one screen — exactly the anti-pattern the frontend
  `CLAUDE.md` calls out.
- **Auto-focusing the search input via a `useEffect` inside `SearchOverlay`
  itself**, racing against `Modal`'s own container-focus effect. Rejected once
  traced: React fires a child's mount effect before its parent's, so a
  same-tick effect race would leave the LAST-run effect's focus target
  winning unpredictably. `initialFocusRef` avoids the race entirely by making
  `useDialogFocus` the single place that decides what gets focused.
- **A second, search-bar-only copy of the blue/checkered chrome treatment**
  (new rules scoped to `.search-overlay-bar` alone). Rejected per ADR-0096
  once the exact same identity was needed a second time — the mode-chrome
  extraction keeps it to one definition the real header and the search bar
  both read off, catching the next surface that needs it too instead of a
  third copy.
