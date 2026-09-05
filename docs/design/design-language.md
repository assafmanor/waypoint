# Design Language

**Status:** ACCEPTED. Core values were extracted from the reference mockup `mockups/trip-dashboard-v2.html`; the mode-identity, color-budget, scale, and dark-mode rules were adopted in [ADR-0028](../decisions/0028-plan-violet-color-budget-dark-ready.md). The mockups predate those rules (colors retrofitted in place, marked in-file) — **where a mockup and this doc conflict, this doc wins.**

## Principle: one loud element, everything else quiet

The **departure-board "Now/Next" card** is the single expressive, glowing element. Everything else is calm and paper-like, so the eye goes straight to _what's happening now_.

## Signature concept

A **departure-board hero** (dark, glowing, monospace times) with a live countdown to the next thing and a progress bar for the day. It borrows the visual language of an airport board because that's the exact feeling we want: _the next departure, the time, the gate, at a glance._

## Mode identity: Night vs. Day

The two modes must be identifiable **at a glance, from any screen**, without reading.

|                            | **Trip mode**                       | **Plan mode**                   |
| -------------------------- | ----------------------------------- | ------------------------------- |
| Metaphor                   | Night — the glowing departure board | Day — the drafting table        |
| Chrome (header/status bar) | Dark indigo `--indigo`              | Light paper with violet accents |
| Accent energy              | Amber (live, pulsing)               | Violet (calm, no pulse)         |
| Texture cue                | Board glow                          | Subtle drafting-grid on chrome  |
| Mode pill                  | 🧭 טיול                             | ✏️ תכנון                        |

**Rules:**

- **Teal is location-only.** Anything using teal to mean "planning" or "progress" is wrong — it belongs to `--plan`.
- Plan mode never uses the pulsing live blip. Nothing in plan mode is "live".
- The status bar and header always follow the mode — the mode is readable from the chrome alone, before any content.
- Mode is signaled by **at least two channels** (chrome color + mode pill + texture), never color alone.

## Color palette

| Token                  | Hex                   | Role                                                                                                        |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--ink`                | `#16233D`             | Primary text                                                                                                |
| `--indigo`             | `#1B2A4A`             | Base / chrome (header, status bar)                                                                          |
| `--board`              | `#0E1729`             | Departure-board background                                                                                  |
| `--board-2`            | `#152137`             | Board gradient top                                                                                          |
| `--screen`             | `#E7EAEF`             | App background ("cool paper")                                                                               |
| `--card`               | `#FFFFFF`             | Card surface                                                                                                |
| `--paper`              | `#F3EFE6`             | Badge / warm paper accents                                                                                  |
| **`--amber`**          | **`#E9A63C`**         | **Time & commitment — this color only**                                                                     |
| `--amber-deep`         | `#915E1E`             | Amber's **paper** variant — mono times and labels on a card (ADR-0158 §6)                                   |
| **`--teal`**           | **`#2C9C90`**         | **Location / map — this color only**                                                                        |
| `--muted`              | `#61687A`             | Secondary text — and **all persistent hint text** (ADR-0158 §7)                                             |
| **`--plan`**           | **`#6E59D6`**         | **Plan mode — this color only** (`--plan-deep` `#5747B4`, `--plan-tint`)                                    |
| `--cta` / `--cta-text` | `--ink` / `#FFF`      | Neutral primary button (semantic colors are never CTAs)                                                     |
| `--ok` / `--miss`      | `#3C9A6B` / `#C2584E` | Status mini-palette (positive/negative). As **text** use `--miss-deep` `#9B463E` — the fill fails AA as ink |

**The ink ramp has three steps and the third one is narrow** (ADR-0158 §7).
`--ink` for content, `--muted` for secondary **and every persistent hint**, and
`--faint` `#808694` for **transient** text only — a placeholder or ghost value
the user's own input replaces, a disabled control, or a bare glyph. That
narrowing is what lets `--faint` stay visibly lighter (11.9 L\* below `--muted`)
while nothing that needs AA relies on it: taken to a 4.5 floor it would land
**0.6 L\*** from `--muted` and the step would stop existing. A persistent hint
is content, so it reads `--muted`.

### Functional color coding: a budget, not a paint bucket

Color carries meaning so the eye can parse a screen **without reading**. Each semantic color has one meaning-family, and spending it elsewhere devalues it everywhere:

- **Amber = the clock & the commitment.** Now, countdowns, the live blip, the `🔒 קשיח` lock, ripple suggestions, the selected "today". One coherent family: _things bound to time._ Nothing else uses amber.
- **Teal = the place.** Map, navigation, location affordances, "near me". Nothing else.
- **Violet (`--plan`) = the plan.** Plan-mode chrome, readiness, builder and scheduling affordances. Nothing else.
- **`--ok` / `--miss` = status.** Positive/negative states (FX ▲/▼, budget health, checklist ✓/✗) are _statuses_, not places — they never borrow teal.
  - **A refused field is `--miss`** (ADR-0150): outline + a 20% halo on the control, the label with it, and a caption below — plus one 240ms nudge, because a mark already on screen says nothing new when you press save a second time. One attribute, `data-invalid`, carries all of it, and it out-ranks the teal focus border, since a refusal focuses the field it names.
- **Per-entity sync = the `--sync-*` tokens.** The `SyncBadge` is a **cloud glyph** — `cloud-check` (saved) / `cloud-up` (pending) / `cloud-bang` (failed) — on a booking, document, event, or any syncable, wired via `EntitySyncBadge`. It's an **exception indicator: silent when synced**, shown only for pending/failed, the same on lists and the timeline. Shape carries the state (legible without color); color comes only from `--sync-synced`/`--sync-pending`/`--sync-failed` (which track `--ok`/`--muted`/`--miss`), never amber. A **pending** item also reads as _provisional_ — the whole row/card **dims (~0.6 opacity)** until the write lands, so "not saved yet" is felt, not only badged; a **failed** item stays full-opacity so it keeps calling for action (ADR-0092). Distinct from the day-view **done ✓** (a green circle, a completion record). See ADR-0080 / ADR-0091 / ADR-0092.
- **Generic primary buttons are neutral.** "＋ טיול חדש", "הצטרף לטיול", form submits use `--cta`/`--cta-text` — never amber. Amber on a button is allowed only when the action itself is time-semantic (e.g., "דחה 30 דק׳" confirmation, ripple "כן").

A small **decorative palette** (avatar identity colors, **map pin categories**) exists alongside these — always pastel/muted, never amber or teal, so it reads as gentle variety rather than a second meaning system. See the Map pins entry below (the 5 category hues; ADR-0038/0109).

**The two decorative ramps, named** (ADR-0133 — before it, only the pin hues had values, and the eight call sites drawing an avatar invented their own; two of them landed byte-identical to `--cat-transit`/`--cat-lodging`, and the `avatarColor` column default was `--amber` itself):

- **Map pin categories** — `--cat-food` / `--cat-lodging` / `--cat-transit` / `--cat-leisure` / `--cat-services` (ADR-0038 §2 / ADR-0109).
- **Avatar identity** — `--id-plum` `#B98AC9` · `--id-rose` `#D98CA8` · `--id-moss` `#9DB585` · `--id-denim` `#8496B5` · `--id-cocoa` `#B99483`. A user's default is **derived from `user.id`**, never a column default — one shared default is what made every real user the same colour. Repeats within a group are accepted: this is variety, not identification (the letter and the name identify).

Two rules govern the identity ramp, and they are why it is a ramp rather than a taste:

- **Chroma, not hue angle, is what separates it from the pin hues.** The palette is crowded — `--cat-services` sits on amber's angle, `--cat-lodging` on `--plan`'s — and a member avatar in the chrome co-occurs with a category pin on the canvas on the Map tab. So an identity colour **may** share an angle with a category hue and still never read as one, because the pin is chromatic and the avatar is muted. Adding a hue means checking chroma, not just hue.
- **One dark ink must clear contrast on every hue, in both themes.** That is why all of them are pastel, and it is what keeps the `Avatar` primitive from carrying a per-hue ink table. A candidate that needs its own ink does not belong in the ramp. A near-zero-chroma sixth hue was cut for a different reason worth remembering: rendered beside the others it read as a **disabled control** rather than a chosen colour.

## The board is rationed

The dark departure-board surface means **"the trip is speaking."** It keeps its power only if it is scarce:

- **Max one board surface per screen.**
- Trip dashboard: the Now/Next hero. Lobby: the single active-trip card. Join/link: the trip-preview card. Never two on one screen.
- The pre-login landing teaser is the one marketing exception.
- Everything else — lists, settings, forms — stays on paper (`--card` / `--screen`).

The scarcity is on the **board surface + its live grammar** (dark `--board`, amber glow, pulse, Now/Next), not on the chrome color itself. Prominent chrome-`--indigo` elements are fine where hierarchy needs them — e.g. the all-trips live-trip hero (ADR-0033 revision): loud, indigo, but glowless and pulseless, so it reads as a nav card, not the board.

## Pulse means live — right now

The pulsing blip is a claim: _something is happening this minute._

- Pulse only in active trip mode (or a genuinely live signal such as a flight update).
- Future trips, invites, and plan-mode elements get **static** badges.
- One pulsing element per screen, maximum.

## Typography & scales

| Family           | Use                                      |
| ---------------- | ---------------------------------------- |
| `Secular One`    | Headings / titles                        |
| `Assistant`      | Body                                     |
| `JetBrains Mono` | Times & codes (the departure-board feel) |

**Full RTL.** Layout, icons, and directionality are Hebrew-first. A Latin/numeric **run** inside Hebrew text (a time, a code, a flight number, a signed offset) is an LTR island — `ltrIsolate` / `measure` from `frontend/src/lib/bidi.ts`, and `dir="auto"` on its element, never `dir="ltr"` (ADR-0118).

**The island is the run, never the run plus its unit.** `dir="ltr"` sets the base direction of the whole element, so a token that also carries a Hebrew unit lays out left-to-right and the Hebrew reader meets the unit first: `9 ק״מ` reads `ק״מ 9`, `+3 ש׳` reads `ש׳ 3+`. So a number-and-unit token is built with `measure(9, 'ק״מ')` — the numeral isolated, the unit outside the isolate in the RTL flow — and its element carries no forced direction. `dir="ltr"` in JSX is lint-blocked outside `<input>` for exactly this reason; the same care applies to `direction: ltr` in CSS, which lint can't see (its three current uses are Latin-only content: a date input, an IANA zone name).

**Stored content sniffs its own direction — that is not optional** (ADR-0118's 2026-08-04 amendment). A value the app did not write — a place's address or name, a trip's destination, a provider, a room — arrives in whatever script the world gave it, so the element rendering it carries `dir="auto"`. With none, it inherits the page's RTL and a value that opens with a numeral run comes apart: `2-14-5 Kabukicho, Shinjuku, Tokyo` renders `Kabukicho, Shinjuku, Tokyo 2-14-5`. Two rules bound it: the `dir` goes on the element holding **the value and nothing else** (a box that also holds Hebrew labels or links would lay those out left-to-right too), and never on an `<input>`, where `auto` sniffs the _value_ and so left-anchors a Hebrew placeholder while the field is empty.

New screens must pick from these ramps instead of inventing values.

**Type ramp** (Assistant unless noted):

| Step      | Size  | Use                                                               |
| --------- | ----- | ----------------------------------------------------------------- |
| display   | 34    | Landing hero (Secular One)                                        |
| h1        | 26    | Screen titles (Secular One)                                       |
| h2        | 21    | Board now-title (Secular One)                                     |
| h3        | 17–18 | Card titles (Secular One)                                         |
| reading   | 16    | Prose on a surface that holds nothing else (a note's full screen) |
| body      | 14.5  | Default text                                                      |
| secondary | 12–13 | Meta, descriptions                                                |
| caption   | 11    | Labels, hints                                                     |
| micro     | 10.5  | Tags, badges                                                      |

JetBrains Mono is reserved for **times, dates, codes, and money** — never prose. And only for **Latin/numeric runs**: the face has no Hebrew glyphs, so Hebrew text must never sit inside a mono element (it silently falls back to a generic monospace and reads foreign). Mixed lines — e.g. the day progress's `07:00 · עכשיו · 23:00` — set the row in Assistant and wrap only the numeric runs in mono + `dir="auto"` (ADR-0118: `auto` resolves LTR for a numeral exactly as `ltr` did, and stays correct if Hebrew ever lands in that span).

**Radius ramp:** `8` chips/tags · `12` inner elements (badges, inputs) · `16` cards · `22` hero surfaces · `999` pills. (Phone frame `38` is a mockup artifact, not a token.)

**Spacing:** 4px base grid; component padding from `{8, 12, 16, 20, 24}`.

**Elevation:** three levels only — `flat` (border, no shadow: list cards), `raised` (soft shadow: interactive cards), `floating` (strong shadow: board, toasts, sheets).

## Hard vs. soft visual grammar

This is the most important visual rule after the color coding:

- **Hard 🔒** — solid card, a `🔒 קשיח` badge, and a monospace confirmation code chip. Feels committed.
- **Soft** — dashed border, diagonal-hatch background, lighter type. Feels provisional and movable.

## States are first-class, offline is a feature

Trip mode assumes bad connectivity abroad. Every component ships with its states designed, not improvised:

- **default · active/now · offline · empty · loading.**
- Offline grammar (already started on the map): desaturated surface + "last saved" banner + stale-data labels. Apply the same grammar to index, board, and glance cards.
- Empty states teach ("היום ריק — גרור מהמדף"), never dead-end.

### Loading is one language in three weights (ADR-0105)

Boot (full screen) · snapshot (chrome-preserving) · upload row (inline) read as one motif — a filling departure-line — not three unrelated treatments. Shipped so far (`mockups/loading-states-v1.html`, `ui/feedback/`):

- **Boot — `BootScreen`.** The loud "board power-on": a genuinely light cool-paper (`--screen`) ground, ink mono clock + a small amber halo that **ramps** (a warm-up, distinct from the reserved live pulse), and an indeterminate departure-line sweep. Theme-aware, not mode-aware — mode is derived from a trip this screen hasn't loaded yet, so it reads as brand. Replaces every `shell.booting` site (auth check, route-chunk `Suspense`, trips-list load). Dark theme is designed (ADR-0105) but ships only with the `data-theme='dark'` toggle (U-08).
- **Snapshot — `HomeSkeleton` + `ChromeSkeleton`, inside `LoadingState`.** A content-shaped skeleton pre-draws Home per mode instead of anonymous shimmer bars: Trip = the dark board hero + quick-access tiles + glance rail; Plan = the violet prep hero + readiness bar + checklist rows. The header bar behind it reuses the real `.header`/`.mode-chrome` chrome (so it's already mode-themed) and shows the real trip name/icon immediately when the caller already knows them, so only the avatar shimmers.
- **Upload row — not yet built.** Still the indeterminate `מעלה…` spinner; the determinate `NN%` + mini-bar needs upload-progress reporting from ADR-0056's outbox upload, which hasn't landed.

## Core components (from the mockup)

- **Departure-board hero** — live pill ("עכשיו"), clock, now-title, next-row with countdown chip, day progress bar with knob.
- **Quick-access grid** — **real shortcuts into data/surfaces we have**, not concierge fixtures (ADR-0045). It ships **four**: next confirmation code (→ index), WiFi copy, **navigate-to-next** (a Maps directions deep-link), documents (→ index). Navigate-to-next was 3-up-deferred until events carried real place data; with picked places it is a **coordinate** deep-link, never the fuzzy title-search one ADR-0045 refused, so it follows the derived-tile rule — **absent** when nothing upcoming has a mappable location, and the grid reflows (ADR-0045 session-104 amendment / ADR-0106 §6). The original "nearby ATM" is gone (needs live location — ADR-0006).
- **Day-at-a-glance card** — the Trip-Home glance, **derived 100% from `events`** (ADR-0045): a **proportional time rail** + a lead **"נותרו"** count + the next hard anchor + a free-until / end-of-day line. Offline-safe, no fixtures. The rail is a true timeline (block width = duration, gaps = free time) with an amber **now-marker** at the true clock position (past = filled, future = hollow); window = 07:00/earliest → 23:00/latest, stretching to an overnight end (ADR-0037, `+1`, never padded to 07:00). Honesty rules: counts are **phase-derived** (a passed-but-unmarked event drops out of "נותרו"), and the rail runs on **top-level containment-forest roots, not raw events** (ADR-0041) — any cluster/envelope collapses to one block + a layered cue + count (`×N` / `כולל N`), so the day never looks busier than it is and detail stays in the day view. **Skipped** shown struck, uncounted. **Empty day** = a calm teach state ("היום עוד פתוח"), never a hidden card or a 0/0 rail; no amber. It **replaces** the old weather / FX / today's-budget glance row (fixtures for unbuilt pipes; budget deferred — ADR-0014 amendment). Weather/FX return as their own cards when the pipes land (ADR-0004). Impl: `lib/glance.ts`.
- **Itinerary item** — tap to expand into quick-verb actions; hard items show an edit warning; `now` item gets an amber ring. Its **badge is the thumbnail's frame** ([ADR-0167](../decisions/0167-the-badge-is-the-thumbnails-frame.md) §1, extended to both day surfaces by [ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md) §1): a fetched photograph fills the 40px square at 0px of layout cost, and a glyph a human PICKED — on the event or on the place — beats it. No category ring on a day row: those badges were always `--paper`.
- **Day head** — the head of a day on all three surfaces that have one ([ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md) §2/§3, the Component lexicon's `DayHead`): the day's photograph when a stop clears the gate, a date tile (day of month · weekday · amber `עכשיו` on today, in both modes) beside the day's derived name, and a footer band with the day's facts and its one action. It replaced a 12px muted `.sec-title` heading and the teal ambient strip under it; measured at 124px, or 240px with the shot, at 360.
- **Ripple bar** — amber suggestion strip after moving an event.
- **"Maybe" shelf** — horizontal scroll of dashed cards to schedule onto a day.
- **Map** (designed in ADR-0109, refining the `trip-dashboard-v2.html` sketch) — a **quiet neutral base, loud category pins**: a warm-paper canvas against cool water, with a low-chroma land-cover vocabulary (forest / shrub / crops / ice / sand) so cities read differently from nature, and Google's own sights re-enabled as **achromatic** grey pins so "exists" never looks like "on your trip" (redesigned in [ADR-0125](../decisions/0125-map-canvas-terrain-vocabulary.md), which replaced the original desaturated cool-paper canvas after it measured as one hue in a four-point lightness band); **pin fill = the category** (the 5-hue pastel palette, ADR-0038 §2 / the decorative palette above — `food`/`lodging`/`transit`/`leisure`/`services`, "never amber or teal"). Category comes from the referencing entity (`Event.category` etc. — events carry it independently of bookings, chosen via an explicit selector per ADR-0038's 2026-07-23 amendment, not from the icon), most-committed reference wins on ties, uncategorised → neutral `leisure`. **Commitment is the hard/soft grammar, not a colour** (solid + 🔒 hard / dashed maybe / muted ambient base / hollow-dashed coordless "Place-lite"). Two form factors: in the **list** a rounded category **badge**; on the embedded map a category **teardrop, tip pointing down**. **Teal** stays for location _affordances_ (near-me, distance chips, the "נווט" button) — and, since [ADR-0168](../decisions/0168-the-search-answers-on-the-canvas.md) §2, for the one MARK on the canvas that is purely a location: an unsaved Google search result. It carries no day, no time, no commitment and no category (the field mask does not buy place types, ADR-0115 §2), and the rule immediately above — the category palette is never amber or teal — is exactly what makes teal safe for it, since a sixth category can never arrive and collide. It replaced a `--card`/`--ink` ring that was, unnoticed, the day style's own POI palette (`#c9ccd4`/`#4b5568`/`#ffffff`), so our result mark read as part of the basemap; **amber** for time (route ETA + a single amber ring on the next committed stop). The blue "me" dot is an OS-map convention outside the budget. Day scope = the **shared header day strip** (focus-in-place) + a map-local "all days" chip; the filter chips (**type · maybes**) **reuse the Index chip/search/mode-accent grammar** (ADR-0098/0100), not a second copy. Cached Google **rating** shows as a small `★` meta tag (ADR-0109 §9). "Near me now" (Phase 4) is a list re-sort + teal distance chips, not a spatial dot, until the embedded map (Phase 6) lands. Offline: desaturated backdrop + "last saved locations" banner + "distance unavailable" labels.
- **Index** — booking cards tagged by type (`tag-type` chip: flight/lodging/restaurant/train), a reusable `badge-offline` pill on section headers, normalized source tags (Gmail-import vs. manually-added, same chip shape), and a documents list with an "add document" affordance.
- **Bottom nav** — 4 tabs, blurred translucent bar. **Their glyphs became `Icon` SVGs in [ADR-0138](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §4** (`home` · `map` · `cards` · `calendar`, replacing 🏠 🗺️ 📇 📅). Navigation is the case "icons are UI" names first, and this is the app's most-seen surface — the one place a platform's emoji font showed through loudest. The active tab **thickens its stroke** as well as taking the pill, so shape carries state alongside colour. `map` is deliberately a folded map and not `Icon`'s `pin`, which already means "our marker" (ADR-0121 §8); `cards` carries two content rules, because a bare pair of offset rectangles is the universal COPY mark and the Index is a directory. The active ("you are here") tab carries a **tinted pill** behind its icon plus a bold accent label; the marker **follows mode identity** — chrome indigo in Trip mode, `--plan` violet in Plan mode (`--nav-accent`/`--nav-tint`, scoped by `[data-mode]`). It never borrows amber (time) or teal (location). Every icon reserves the pill box so filling only the active one causes no layout shift. **Selecting a tab settles its icon + label a few px down** (a `transform`, so no reflow — the deselected tab rides back up); disabled under `prefers-reduced-motion`. Options studied in `mockups/nav-active-states-v1.html`.
- **Toast** — dark pill for lightweight confirmations.

## Plan-mode components (from `mockups/plan-mode-v1.html`)

Plan mode reuses the same tokens/grammar as Trip mode, adding builder/entry components. The **light "drafting table" chrome** (light paper header/toggle/day-strip + violet accents + a faint drafting grid), the **prep-dashboard Home** (violet hero + derived readiness/checklist), and the **Day-by-day builder** (structural rows + gap chips + empty-day markers + shelf) are implemented — `App.css`'s `[data-mode='plan']` block, `screens/PlanHome.tsx`, `screens/PlanDay.tsx`, `lib/readiness.ts`. Readiness and the checklist are **derived from the trip snapshot, never stored** (same reasoning as the derived Now/Next); rows that would need data we don't collect yet (Gmail-import, documents, per-member Google-connection) are deliberately absent rather than faked. Builder editing reuses `EventForm` (add/edit, hard↔soft flip, retime, cross-day via its date field). **Reorder** = drag a soft row's grip (or the ▲/▼ a11y fallback) to reassign the day's **soft** time slots to the new order (`verbs.reorder` → `lib/reorder.ts`'s `planReorder`, one atomic `REORDER` + undoable); the list stays time-ordered and **hard events are pinned anchors** (not draggable — ADR-0011). The **maybe shelf** schedules an idea onto a day via the event-form picker (day/time/kind) and lets you add/remove ideas; a **scheduled idea leaves the shelf** (ADR-0027 — parked _or_ placed, never a "שובץ" tombstone). **The tablet two-column layout is deferred** (the shell is still phone-capped).

- **Mode toggle** — a pill (✏️ תכנון / 🧭 טיול) in the header showing the manual override, with an "auto-switches on <date>" hint (ADR-0016).
- **Prep dashboard hero** — countdown to departure + a **readiness bar** (% complete). **Plan violet** rather than amber, since it's not "now" (teal is location-only).
- **Completeness checklist** — rows with status (✓ done / warn / missing) and inline CTAs ("הוסף", "בנה יום", "תזכורת").
- **Itinerary builder rows** — event rows with a **drag grip** (⠿), hard/soft tag, editable time, edit affordance; **gap chips** between events ("פער של שעתיים · ＋ שבץ").
- **Add-event / booking-entry forms** — inline forms with a **hard/soft kind selector** (amber=hard; soft = dashed + muted, per the soft grammar — never teal) and per-type booking fields.
- **Place research** — a search bar + result cards with rating and "＋ אולי" (add to the maybe-shelf).
- **Day selector strip** — days 1–N with an **empty-day** marker (dashed, red number) surfacing gaps to fill.

**Tablet layout:** the builder becomes two columns (itinerary + research/maybe side panel) — see the tablet frame in the mockup (ADR-0017).

## Component lexicon

Canonical names, for docs / code / tickets — one vocabulary end to end:

`Board` (Now/Next hero) · `CountdownChip` · `VerbRow` (tap-to-expand actions) · `RippleBar` · `MaybeShelf` · `GapChip` · `ReadinessBar` · `BoardingPass` (link-invite card) · `PermRow` (permission toggle row) · `ModePill` · `DayStrip` · `DayHead` · `GlanceCard` · `RateCard` · `Toast`.

**`DayHead`** ([ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md) §2/§3) is the head of a day on all three surfaces that have one — both day surfaces and the public reader's day card. Three bands in one frame: the day's photograph when a stop clears `dayPhoto`'s gate, then a grid of the date tile (day of month, weekday, amber `עכשיו` on today) beside the day's name, then a footer band carrying the day's facts and its one action. Lifted out of the reader's own sheet rather than twinned; a host supplies the copy-column lines (the reader's stay) or the footer facts (the app's total and verdict), never both.

**Two of those names are a trap for each other.** `GlanceCard` was repurposed by [ADR-0045](../decisions/0045-trip-home-real-data-only.md) to mean the derived **day-at-a-glance time rail** and nothing else — so the FX card that ADR-0045 §4 promised would "return as its own glance card" cannot be called one. It is **`RateCard`** ([ADR-0180](../decisions/0180-currency-is-derived-and-a-rate-is-a-glance-card.md) §3): the first real tenant of the restored `מבט מהיר` section, neutral chrome, one `<button>` that opens the converter sheet. Weather is the second tenant of the same row, and it will want its own name too.

## Emoji are content, icons are UI

In mockups emoji do both jobs; in the build they split:

- **UI controls** (nav, verbs, edit/back/settings) use a consistent icon set, inheriting text color. In the build this is **inline SVG via the shared primitives `ui/NavArrow.tsx`** (directional nav arrows — forward/back, RTL-mirrored) **and `ui/Icon.tsx`** (caret, undo, reset, download, …; sized `1em`, `currentColor`). **Never render a raw Unicode arrow/caret/triangle glyph** (`→ ← › ‹ ↩ ↺ ⬇ ▾ ▴ ▲ ▼`) for a control: the Assistant body font has no glyphs for them, so the browser substitutes a fallback that sits low and drifts off-centre. Add new shapes to `Icon` rather than reaching for a glyph. A lint rule (`no-restricted-syntax`) fails CI on raw arrow/caret glyphs in JSX.
- **Emoji remain as content**: trip identity (🇯🇵), event category badges, group flavor. This keeps warmth without making controls look inconsistent across platforms.

**True everywhere since [ADR-0138](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md) (2026-07-29), not just for arrows.** For years this rule was enforced only for arrow/caret glyphs and aspirational for the rest, so ✏️ 🗑️ 📥 🔄 👑 🚪 ⬆️ 📷 🔗 all drew controls. Three things changed:

- **The vocabulary is split at its source.** `constants.ts` holds `GLYPH` (content, strings) and `CONTROL_ICON` (controls, `IconName`s). One `ICONS` object holding both is what made the drift invisible: a call site could not tell which rule applied to what it had imported. **The test for a new entry is whether the user aims at it.**
- **The types carry the rule where they can.** `RowAction.icon` and `ShowToast`'s mark are `IconName`, so an emoji literal does not compile. That beats lint, and it is why the lint guard has no `icon=`-prop selector — that prop legitimately carries content nearly everywhere.
- **The lint guard is positional in JSX text, a denylist in JSX expressions.** Any emoji typed straight into markup fails — content flows in from entity data or a named constant, so a glyph written into the JSX is decoration by construction. Expressions keep a named list, because content legitimately flows through them (`{e.icon ?? …}`). Non-test source only. Note the trap ADR-0138 §9 records: these selector regexes have no `u` flag, so a character class of astral emoji is a class of surrogate _halves_ and matches the whole plane — match a surrogate PAIR, or use an alternation.

**The two places this doc itself named emoji both crossed** on the owner's call: the **bottom nav** (see the Bottom nav entry below) and the **verb-row / toast** marks. A toast's mark is now the icon of the action it confirms.

**The line moved once more (2026-08-01 amendment).** The first pass filed the Index/Home tile markers as content, and the code disproved it: Home's quick-action row shipped as three emoji beside one SVG compass, four sibling buttons rendering two ways. So the test is now sharper than "is it a control" — **if a glyph has a sibling control already drawing an icon, it is a control.** `GLYPH` is down to a single entry (`5 👥`, a unit inside a sentence). And note the corollary: **a mark baked into a copy string can only ever be an emoji**, so a string that wants one is split and the call site renders the icon.

**And once more, dropping a carve-out (2026-08-02 amendment).** The line above used to end "…and empty-state _illustrations_". `Map.tsx` disproved that in the same commit: four `EmptyState`s in one ternary, two drawing `<Icon name="search" />` and two drawing 🗺️/🗓️ — the sibling test again, one file over. **An empty state is chrome the app draws, not content it holds**, so its mark is an icon. What stays emoji is per-entity badges, trip identity, and the warmth in copy. An empty state that owns a whole region passes `size="pane"` to `EmptyState`, which grows the icon (and only the icon) to fill it.

**A third move, and the first one that is about COLOUR (2026-09-02 amendment).** The daylight widget shipped with 🌅 🌇 ✨ ☀️ 🌑 on its foot, filed as content. The owner reversed that — _"the app forbids using emojis as ui, they're content"_ — and the test above already decided it: **a mark the app COMPUTES is chrome.** Nothing stands behind a sunrise glyph; the app derived it from a latitude and a date, the same way it derives an empty state. The 2026-08-01 corollary applied too, and is worth restating because it is the half people forget: _a mark baked into a copy string can only ever be an emoji_, so `polarDay`/`polarNight` gave theirs up and the call site draws them.

What is new is the second half of the request — _"I also like the colourfulness"_ — which forced the rule to say what it had always meant:

- **The rule is not "an icon is monochrome".** It is that **a control** inherits text colour, so it looks like the text around it. `ui/Icon.tsx` is one `<path>`, `fill: none`, `currentColor`, and that is the right shape for everything a finger aims at.
- **An illustration's marks are not controls**, so they may carry colour — but only **their own surface's** colour. `ui/domain/SunGlyph.tsx` is the first of these: five circular tiles painted from `sun-widget.css`'s four sky rungs over its `--card` ground, so each mark is literally a slice of the gradient above it. It lives beside its surface in `ui/domain/`, never in `Icon`, whose contract it would have to break.
- **The bound is chroma, and it is measured, not asserted.** The first version was drawn in literal saturated hex and rendered beautifully; composited over `--card` it measured **58.7-62.3** against `--amber`'s **63.6**, where the decorative palettes sit at **18.3-24.9** and that card's own sky at **10.4-21.5**. A mark cannot be licensed as illustration at a chroma that reads as a semantic hue — that is the "chroma, not hue angle" rule above, applied to a glyph. Repainting from the surface's ramp puts it inside the budget **by construction**, which is why "draw from the surface, not from a new palette" is the rule rather than "keep it under N".

The cost is real and was accepted rather than hidden: muting a pair costs separation, so `SunGlyph`'s two crossings lean on different ramp rungs and on the sun's height against the horizon to buy it back.

## Voice and register (Hebrew UI copy)

**Three voices, each with a job, and no gendered singular.** Adopted 2026-08-17, and it
[amends ADR-0138](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md)'s §6, which had made row-menu copy an imperative:

| where                    | register    | example                               |
| ------------------------ | ----------- | ------------------------------------- |
| a control                | verbal noun | `עריכה` · `מחיקה` · `שמירה` · `ניקוי` |
| a dialog title           | infinitive  | `למחוק את הפתק?` · `לצאת בלי לשמור?`  |
| a sentence to the reader | plural      | `נסו שוב` · `בדקו את החיבור`          |

Two reasons, and the second is the one no consistency argument covers. `he.ts` had drifted into a
near 50/50 split — ~60 singular-masculine imperatives against ~46 plural ones, colliding on the
same screens (`הוסף מסמך` beside `העלו`; `שמור` beside the canonical `שמירה`; one clear action
spelled three ways). And **a Hebrew imperative singular picks a gender**, so every `ערוך` and
`שמור` addressed one member of a mixed group of five as masculine. The repair is therefore not
plural imperatives (`ערכו`/`מחקו` read stiffer than what they replace) but a register carrying no
grammatical person at all.

Two carve-outs, deliberate — do not "finish" them:

- **A disclosure toggle keeps `הצג`/`הסתר`** — one matched pair for one job (owner, 2026-08-16);
  `הצגה`/`הסתרה` on a caret row reads like a setting rather than a switch.
- **A stepper keeps its imperative** (`דחה 15 דק׳`): `דחייה 15 דק׳` is not a thing anyone says.
- **An act on someone else's state takes the infinitive** (`להפוך למנהל`): the noun forms of
  those verbs are the formal register, and `מינוי כמנהל` was rejected on exactly that.

**The app's own nouns are fixed too, because seven words for one thing is its own defect.** The
group is `החבר'ה`; the people in it are `נוסעים` — `משתתפים` reads like a webinar, not a trip. And
an **invitation is a `לינק`, never a bare `הזמנה`**: that word is a _booking_ everywhere in the
Index, so the join screen's `טוען הזמנה…` read as "loading booking".

**The one gendered verb left is the change feed**, and the narration forces it: it reports what a
_named_ person did, so Hebrew demands a grammatical subject. A verbal noun drops the actor and so
does the passive. Masculine by convention, documented at `changeFeed` in `he.ts`.

The full rule, with the counts that motivated it, is at the top of `frontend/src/i18n/he.ts` —
which is where a copy change is actually read. Also non-negotiable there, from the root
`CLAUDE.md`: **no em dashes in UI copy**, ever.

## Device targets & responsive strategy

**Mobile-first, phone-primary** (ADR-0017). The design is authored for the phone and scales up — never the reverse.

| Device                 | Priority         | Design intent                                                                                                                                                                                                      |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phone** ~360–430px   | **Primary**      | The baseline. One-handed, touch-first, glanceable. Trip mode is effectively phone-only. Primary actions sit in thumb reach; the bottom tab bar is the main nav.                                                    |
| **Tablet** ~768–1024px | Secondary        | Supported and _nice_, **especially Plan mode** (building/entry/research use the width — wider columns, side-by-side lists, a roomier itinerary builder). Scale up gracefully, don't just stretch the phone column. |
| **Desktop** >1024px    | Graceful minimum | Must work and look intentional (centered/max-width), but gets no bespoke effort.                                                                                                                                   |

Rules that follow from this:

- **Touch-first:** generous tap targets, no hover-only affordances (hover is a desktop luxury, not a dependency).
- **Breakpoints, not a separate UI:** one responsive codebase; layouts adapt at tablet width.
- **Phone-authored mockups:** design at ~390px first; add the tablet layout for Plan-mode-heavy screens.
- The current scaffold's fixed ~480px column is a **phone-first placeholder** — real breakpoints arrive with the screen work.

## Motion & designed transitions

Subtle fades on view change; pulsing "live" blip; countdown/clock tick. Respects `prefers-reduced-motion` (all animation disabled).

### Motion tokens (the vocabulary)

New motion picks from a small ramp instead of inventing values — the same discipline as the type ramp and color budget. Wired in `tokens.css`:

| Token               | Value                          | Used for                                                                            |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `--t-quick`         | 140ms                          | Nav settle, toggles, hovers, focus                                                  |
| `--t-base`          | 240ms                          | Tab cross-fade, toast, ripple bar, sheets                                           |
| `--t-deliberate`    | 400ms                          | Return-gesture slide (ADR-0035); Trip→Plan stand-down                               |
| `--t-cinematic`     | 600ms                          | Plan→Trip going-live — **the only cinematic moment**                                |
| `--ease-standard`   | `cubic-bezier(.2,0,0,1)`       | Default / entrances / hue melts                                                     |
| `--ease-exit`       | `cubic-bezier(.4,0,1,1)`       | Exits — toast out, glow extinguishing                                               |
| `--ease-emphasized` | `cubic-bezier(.16,1,.3,1)`     | The glow ignite                                                                     |
| `--ease-arrive`     | `cubic-bezier(.22,1.16,.36,1)` | The only **overshooting** easing — an arriving object that must _settle_ (ADR-0140) |
| `--stagger-step`    | 40ms                           | One step of a staggered entrance; cap the multiplier ~5 so a long list never drags  |
| `--dir`             | −1 (RTL) / 1 (LTR)             | The inline axis's PHYSICAL sign — `translateX(calc(var(--dir) * …))`                |
| `--press-scale`     | 0.97                           | Press feedback on a control                                                         |
| `--press-scale-lg`  | 0.985                          | Press feedback on a card- or full-width-sized surface                               |
| `--route-offset`    | 28px                           | How far an arriving shell screen travels                                            |

The three original easings are all monotone, which is why `--ease-arrive` was added rather than reused: an object that should come to rest had nothing to come to rest _with_, so it stopped dead. Use it for entrances of real objects — a sheet, a card, a stamp — never for an exit (leaving does not overshoot) and never for a colour or opacity ramp.

**Timing an animation from JS reads the token, never a literal** — `lib/motion.ts`'s `motionDurationMs`, which answers **0** both under reduced motion and when the token is unreadable. Any state that exists only _during_ an animation has to resolve when there is no animation, or it outlives its reason (ADR-0140 §5).

**Budget rule:** exactly one `--t-cinematic` moment exists in the product — the Plan→Trip switch. Spending "cinematic" elsewhere devalues it, same discipline as amber / teal / violet. Motion mirrors "one loud element": everything else stays quick and quiet.

### The mode switch — temperature & energy, not luminance

The Plan⇄Trip switch is the product's most meaningful moment. Crucially it is **not a light-to-dark flip** — that would conflate **mode** with **theme**, two orthogonal axes:

- **Mode** (Plan/Trip) rides on **durable, theme-independent** channels: the chrome's **temperature** (violet ⇄ indigo+amber), the **drafting grid** (plan only), and the board's **glow + pulse** (trip "live"), plus the mode pill. In the light theme the app **body stays paper in both modes** — only the header hue, the hero, the grid, and the glow move.
- **Theme** (light/dark) is the separate **luminance** axis (see "Dark mode"): in dark mode _both_ modes go dark (plan = violet-tinted dark, trip = indigo dark + amber glow). A transition built on luminance would break the moment dark mode ships — so the switch must never touch it, and must read identically in either theme.

**"Go live / Stand down", direction-aware** (studied in `mockups/mode-switch-transition-v1.html`, implemented in `App.css` `[data-switching]` + `screens.css` `board-power`, driven by the Shell in `App.tsx`):

- **Plan→Trip (going live), `--t-cinematic` 600ms:** the chrome warms violet→indigo and the drafting grid dissolves, **then** the board's amber glow ignites and the pulse starts — the climax lands on the "live" energy, not on brightness.
- **Trip→Plan (stand-down), `--t-deliberate` 400ms:** the quieter return — the chrome cools to violet and the drafting grid re-draws (the board leaves with the hero swap). No fanfare; you're back at the desk.
- The transition is **armed only during a switch** (`data-switching` on `.app`, set by the Shell for the animation's duration) so steady-state hovers keep their own timing, and is **fully disabled under `prefers-reduced-motion`** (mode identity still flips, instantly). The board power-on mirrors the zero-state's dormant board — one surface, off → on.
- The **automatic** date-driven switch (ADR-0016) should use a gentler, non-staged version — a flip the user didn't ask for shouldn't perform. _(Currently the same transition serves both; a softened auto variant is a follow-up.)_

### Filtering a list is a reveal (ADR-0120)

**Every** control that changes a list is animated — filter, search, scope, or order alike. There is no category of list control that rearranges rows without motion, and no per-screen choice about it: `lib/filter-reveal.ts` + `ui/primitives/RevealList` (`.wp-reveal`) carry it, and any list built on them inherits it.

Two kinds of change, two mechanisms, both in the same primitive:

- **Rows entering and leaving** — a row that stops matching shrinks and fades in place; one that starts matching comes back with a small per-row stagger (`--t-base`, `--ease-standard`, capped so a long list doesn't drag). This covers filters, search, and scope changes (the Map's `כל הימים` and the day strip's own day), which are predicates over the full set rather than a different list.
- **Rows moving** — a re-order (the Map's `קרוב עכשיו`) changes only positions, so there is nothing to collapse or expand: each moved row slides from where it was to where it now is (FLIP, same duration and easing).

### Overlays arrive and leave (ADR-0140)

Every overlay animates in **and out**, from the one `Modal` primitive — scrim and card on separate channels, one keyframe pair per channel played `reverse` to leave, and the exit briefer than the entrance (`--t-quick` out, `--t-base` in) because you have already decided to leave. Each variant arrives the way its shape implies: a **sheet** rises from the edge it came from, a **dialog** has no edge so it is summoned in place, and **`full`** replaces a screen so it arrives like one, from the inline-end edge.

The exit hangs off `onClose`, which is already the single owner of leaving (ADR-0103 §2) — never a second close path. An in-card `✕`/`ביטול` takes the wrapped close via `Modal`'s children-as-function, or it snaps.

### A tap is answered (ADR-0140)

The mobile tap-flash is killed app-wide, so **every** tappable owes its own acknowledgement — and one element-level rule provides it rather than each surface remembering. Two steps, because the ratio is what should read as constant, not the transform: `--press-scale` for controls, `--press-scale-lg` for card- and full-width-sized surfaces, which override the var rather than writing a transform. Scale rather than colour, so it composes with the board, paper, amber tints and violet chrome without a per-surface table and without spending from the semantic budget.

### A transition is answered, a status is not decorated (ADR-0140 §6)

The small beats all answer the same question: **did something just change?** A sync badge
resolving, a banner arriving, a chip becoming selected, a count reaching its value — each
marks a transition, so each gets **one settle and never a loop**. A looping animation says
"this is still happening", which is why the pulse is reserved for live (see "Pulse means
live") and why `pending` and `failed` sync states deliberately stay still: a spinner on
pending reads as strain, and a flourish on failure competes with the thing asking for
action.

Note the distinction from press feedback: a press answers the **tap**, a settle answers the
**outcome**. A control can be pressed without its answer changing.

**A settle can be asymmetric, and usually should be** (ADR-0195). A task's tick is completed with a beat — `BEAT.TICK`, the ink squashing in, overshooting and settling while the ✓ is drawn — and **un-ticked with nothing but a 140ms drain on `--ease-exit`**. Finishing something is an achievement; taking it back is a correction, and a mechanism that plays the same motion both ways says they are the same event. Express it by declaring the quiet half's `transition` on the **destination** state — that is what makes the asymmetry one rule instead of a flag, and it leaves the beat a pure entrance.

**And two numbers worth knowing before reaching for an easing on something small:** `--ease-arrive` overshoots **0.073px on a 26px disc**, and a stroke drawn under `--ease-standard` is **61% complete at 60ms of 240**. The ramp's curves were tuned on sheets and cards; at control size, liveliness has to be written as keyframes with interior stops (and then `linear`, so the offsets _are_ the timing). Measured in `mockups/a-tick-that-is-seen-v1.html`, whose filmstrip freezes a beat at sampled times — the technique to reuse when a motion decision needs to be _looked at_ rather than described.

### A shell route arrives with a direction (ADR-0140)

Forward and back must not look the same, or the motion carries no information. The direction rides `location.state` (stamped by a back that moves) — never read from history, which ADR-0090 forbids. Forward arrives from the inline-**end** edge (the platform push, mirrored: LTR from the right, RTL from the left); back from inline-start. Because `translateX` has no logical form, the sign comes from the one `--dir` token, so both directions share one set of keyframes instead of a mirrored copy each.

Scoped to **pathname** changes, so an in-trip tab switch keeps `.body`'s fade and never gets two animations at once. It is an offset and a fade rather than a full-width push, because the outgoing screen is already unmounted — the receding half is deferred, with the cost stated in the ADR.

## Accessibility: non-color redundancy

- Hard/soft is triple-coded (border style + badge + color) — preserve this pattern everywhere a color carries meaning, including mode identity.
- Amber small text on the dark board is near the contrast floor — amber on `--board` is for **numbers and short labels only** (mono, ≥12px, bold); body text on the board stays in the light blues.
- Touch targets ≥ 44×44px. Focus-visible outlines stay teal on light surfaces, amber on dark; keep them.
- The mockup uses tap-to-expand rather than swipe (swipe breaks in prototypes); revisit real swipe gestures in the build with care.

## Dark mode

Dark mode is a **token remap, not a redesign**: every component reads
`var(--token)`, so the theme ships by re-mapping the same names under
`:root[data-theme='dark']`. **Designed to shippable in [ADR-0158](../decisions/0158-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md); the build is phased in that ADR's §10 and has not started.** Until phase 4 lands, the block in
`tokens.css` is still inert.

**Principles:**

- **The board stays the loudest — but not by being the darkest.** This is the
  correction ADR-0158 made by rendering it. Board→screen measures **ΔL\* 2.6** in
  dark (against 84.8 in light), which is not a visible edge: the board has no
  boundary against the body at all. What carries it is **amber density** — every
  amber element on the screen is inside the board. So the hierarchy **inverts**
  rather than weakening: in light the board is the object and the cards are
  quiet; in dark the cards are the objects and the board is the field they sit
  above.
- **Therefore amber density _is_ the ration in dark mode.** In light, a stray
  amber accent elsewhere is survivable because the board's darkness still
  separates it. In dark there is no second channel, so amber spent anywhere else
  comes straight out of the board's prominence. "Amber = time & commitment" stops
  being only a semantic rule and becomes a hierarchy one.
- **Ink/paper swap.** `--ink` becomes light text, `--screen`/`--card` become deep
  surfaces. `--paper` keeps its _warmth_ in a dark value so badges stay warm.
- **Semantic hues survive, brightened** — and a brightened fill therefore takes
  **dark** ink. That is `--on-fill`, below. Never introduce new meanings in dark.
- **Pulse and mode rules unchanged.** Mode identity holds via hue temperature +
  drafting grid + mode pill. Note what ADR-0158 found: ADR-0028 never listed
  luminance as one of the channels, which is what lets mode identity survive a
  remap — but it is also why the plan hero rendering _brighter_ than the trip
  board inverted the modes until `--plan-surface` fixed it.
- **Trip mode wants dark.** OLED battery savings matter abroad; the default is
  `system`.

### The ink a surface carries is a token

The rule ADR-0158 added, and the one that governs everything below: **when a
colour is painted _onto_ something, the ink is its own token, named for what it
sits on.** Three families, all shaped like the `--amber` / `--amber-ink` pair
that already existed:

| Family                        | Tokens                                                                                                          | For                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On a semantic fill**        | `--on-fill` (`#FFFFFF` / `#12203A`), `--on-amber` (`#3A2405` both)                                              | Ink on `--cta`/`--plan`/`--ok`/`--miss`/`--teal`/`--muted`. The fill re-maps **across the midpoint**, so the ink flips with it. `--cta-text` is an alias of `--on-fill`.                                                                  |
| **On an always-dark surface** | `--on-dark-strong` `#FFFFFF` · `--on-dark` `#EAF0FF` · `--on-dark-dim` `#93A2C4` · `--on-dark-faint` `#7688AC`  | Ink on the board, the indigo chrome, the day strip, `/login`, `/join`, the ticket, the trip hero, the plan hero. **Theme-fixed in both themes** — these surfaces are dark in light mode too. Folds 18 drifted hex values across 53 sites. |
| **The chrome's contract**     | `--chrome-bg` · `--chrome-ink` · `--chrome-ink-mid` · `--chrome-ink-num` · `--chrome-ink-dim` · `--chrome-ring` | Set once per mode, per theme. Six names replacing 53 declarations that assumed a dark chrome and 19 that plan had re-specified by hand. A surface inside the chrome reads these and never learns which mode or theme it is in.            |

**The distinction that had been written down as one rule and is two:** a
_re-mapping fill_ flips its ink with it (`--on-fill`); _always-dark chrome_ keeps
light ink in both themes (`--on-dark-*`). Dark ink on dark `--indigo` measures
**1.01:1**, which is what conflating them costs.

**Deep variants are the same rule for accents.** `--amber-deep`, `--plan-deep`
and `--miss-deep` are what those hues become when a surface **writes** with them
instead of painting with them: `--miss` `#C2584E` is right as a dot and 4.38:1 as
text on white. "Deep" means _further from the ground_, so it darkens in light and
**lightens** in dark. If you are typing `color: var(--amber)`, `var(--plan)` or
`var(--miss)`, you almost certainly want the deep one — and if you are typing
`color: var(--indigo)` or `var(--card)`, you want `--ink` or `--on-fill`: a
surface token used as ink follows the surface into invisibility exactly when the
page does (ADR-0158 §12 found four families of that, worst at 1.10:1).

### The trip chrome is light in light mode (ADR-0158 §12)

`--chrome-bg` is **a band per mode** — trip blue, plan violet — set in
`tokens.css` under each theme block, with App.css naming only which mode is
speaking. Mode identity rides **hue**, which is what lets both bands be pale in
light and both be dark in dark without the modes colliding.

**In light both bands are literals, and that is deliberate.** `--indigo` is a
near-neutral navy (chroma 22.4) chosen to be a _dark surface_, so no mix of it
yields a light band with hue left. And the counter-intuitive part: because indigo
and violet sit only ~20° apart, **making trip more colourful at indigo's own
angle makes it LESS distinct from plan** — chroma-matching collapses the pair to
ΔE00 1.2. Trip's band is therefore pushed _away_ from violet, which buys colour
and separation together (ΔE00 8.4). If you retune one band, re-measure the pair,
not the band.

Three more things worth knowing before touching it:

- **A light chrome's ink ramp is tighter than a dark one's**, because the washes
  are mixed off `--chrome-ink` and therefore darken the ground beneath the ink
  sitting on them. Four rungs live inside 21 L\*, each the lightest that clears
  4.5 on the heaviest wash it is actually painted on. Lighten one and re-check
  its wash, not just the band.
- **The hero stays dark in both themes.** Lightening it hands the prominence to
  the chrome and inverts the hierarchy — in light mode, darkness is the hero's
  only prominence mechanism, since amber-as-a-ground was rejected in ADR-0105.
- **A wash is `color-mix(… var(--ink) N%, transparent)`, never a frozen
  `rgba(22, 35, 61, N)`.** The literal is light `--ink` at an alpha and it
  vanishes on a dark card. A **backdrop** is the exception and stays literal: a
  scrim is dark in both themes. Alpha tells them apart — washes sit at ≤ 0.34.

A `/* fixed: … */` marker now means only what a token cannot say: ink on the
Google brand mark, and the light/dark swatches in the theme control, which are a
picture of the option rather than chrome.

### Surface tokens, not accent tokens

A loud surface gets its **own** tokens. The trip hero always had them
(`--board`/`--board-2`); the plan hero was painting itself out of the _accent_
tokens, and an accent brightens on dark where a surface must not — so in dark it
rendered at L\* 68, the brightest surface in the app, in the calm mode.
`--plan-surface` `#6E59D6` / `#2A2158` and `--plan-surface-2` `#5747B4` /
`#332866` fix it, light values byte-identical to what they replace.

**Dark remap table** (as wired in `tokens.css`):

| Token                       | Light                 | Dark                                                                                       |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `--ink`                     | `#16233D`             | `#E7EAF2`                                                                                  |
| `--screen`                  | `#E7EAEF`             | `#0F1726`                                                                                  |
| `--card`                    | `#FFFFFF`             | `#1A2740`                                                                                  |
| `--paper`                   | `#F3EFE6`             | `#2E2A20`                                                                                  |
| `--indigo`                  | `#1B2A4A`             | `#131F38`                                                                                  |
| `--board` / `--board-2`     | `#0E1729` / `#152137` | `#0A1120` / `#101B30`                                                                      |
| `--amber` / `--amber-deep`  | `#E9A63C` / `#C9822A` | `#F0B254` / `#D89440`                                                                      |
| `--amber-ink`               | `#7A5A1E`             | `#F0B254` (dark-amber text on a light amber _tint_; the tint darkens, so the ink lightens) |
| `--teal`                    | `#2C9C90`             | `#3FB3A5`                                                                                  |
| `--plan` / `--plan-deep`    | `#6E59D6` / `#5747B4` | `#8B79E8` / `#A99AF2` (deep is used as _text_, so lighter)                                 |
| `--muted`                   | `#6C7488`             | `#93A0B8`                                                                                  |
| `--faint`                   | `#98A0B0`             | `#8592AB` (faint hint/placeholder text, one step past `--muted`)                           |
| `--line` / `--soft-line`    | ink @ .10/.28         | light @ .10/.30                                                                            |
| `--cta` / `--cta-text`      | `#16233D` / `#FFF`    | `#E7EAF2` / `#12203A`                                                                      |
| `--ok` / `--miss`           | `#3C9A6B` / `#C2584E` | `#4CBF85` / `#E07A6E`                                                                      |
| `--miss-deep` (miss as ink) | `#9B463E`             | `#E3877D`                                                                                  |

**Status — designed, not built.** ADR-0158 §10 phases it: (1) on-fill ink,
(2) the `--on-dark-*` ramp, (3) surface + chrome tokens, (4) the theme itself —
`lib/theme.ts`, the pre-paint script, the three-rung `/settings` control,
`meta[name=theme-color]`, ADR-0105's dark boot and the night map style,
(5) the light theme's own four contrast failures, (6) **the device pass**.
Phases 1–3 change no light-mode pixels by construction.

Every number in ADR-0158 is a Chromium render at 411×914.
[ADR-0125](../decisions/0125-map-canvas-terrain-vocabulary.md) is this repo's
precedent for a palette that measured fine and read as one hue on real glass,
which is why phase 6 exists and is not a formality.
