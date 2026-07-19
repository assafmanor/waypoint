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

| Token                  | Hex                   | Role                                                                     |
| ---------------------- | --------------------- | ------------------------------------------------------------------------ |
| `--ink`                | `#16233D`             | Primary text                                                             |
| `--indigo`             | `#1B2A4A`             | Base / chrome (header, status bar)                                       |
| `--board`              | `#0E1729`             | Departure-board background                                               |
| `--board-2`            | `#152137`             | Board gradient top                                                       |
| `--screen`             | `#E7EAEF`             | App background ("cool paper")                                            |
| `--card`               | `#FFFFFF`             | Card surface                                                             |
| `--paper`              | `#F3EFE6`             | Badge / warm paper accents                                               |
| **`--amber`**          | **`#E9A63C`**         | **Time & commitment — this color only**                                  |
| `--amber-deep`         | `#C9822A`             | Amber pressed/hard-code accent                                           |
| **`--teal`**           | **`#2C9C90`**         | **Location / map — this color only**                                     |
| `--muted`              | `#6C7488`             | Secondary text                                                           |
| **`--plan`**           | **`#6E59D6`**         | **Plan mode — this color only** (`--plan-deep` `#5747B4`, `--plan-tint`) |
| `--cta` / `--cta-text` | `--ink` / `#FFF`      | Neutral primary button (semantic colors are never CTAs)                  |
| `--ok` / `--miss`      | `#3C9A6B` / `#C2584E` | Status mini-palette (positive/negative)                                  |

### Functional color coding: a budget, not a paint bucket

Color carries meaning so the eye can parse a screen **without reading**. Each semantic color has one meaning-family, and spending it elsewhere devalues it everywhere:

- **Amber = the clock & the commitment.** Now, countdowns, the live blip, the `🔒 קשיח` lock, ripple suggestions, the selected "today". One coherent family: _things bound to time._ Nothing else uses amber.
- **Teal = the place.** Map, navigation, location affordances, "near me". Nothing else.
- **Violet (`--plan`) = the plan.** Plan-mode chrome, readiness, builder and scheduling affordances. Nothing else.
- **`--ok` / `--miss` = status.** Positive/negative states (FX ▲/▼, budget health, checklist ✓/✗) are _statuses_, not places — they never borrow teal.
- **Generic primary buttons are neutral.** "＋ טיול חדש", "הצטרף לטיול", form submits use `--cta`/`--cta-text` — never amber. Amber on a button is allowed only when the action itself is time-semantic (e.g., "דחה 30 דק׳" confirmation, ripple "כן").

A small **decorative palette** (avatar identity colors, map pin categories) exists alongside these — always pastel/muted, never amber or teal, so it reads as gentle variety rather than a second meaning system. See the Map pins entry below.

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

**Full RTL.** Layout, icons, and directionality are Hebrew-first. Latin strings (times, codes, flight numbers) are wrapped `dir="ltr"` inside the RTL flow.

New screens must pick from these ramps instead of inventing values.

**Type ramp** (Assistant unless noted):

| Step      | Size  | Use                           |
| --------- | ----- | ----------------------------- |
| display   | 34    | Landing hero (Secular One)    |
| h1        | 26    | Screen titles (Secular One)   |
| h2        | 21    | Board now-title (Secular One) |
| h3        | 17–18 | Card titles (Secular One)     |
| body      | 14.5  | Default text                  |
| secondary | 12–13 | Meta, descriptions            |
| caption   | 11    | Labels, hints                 |
| micro     | 10.5  | Tags, badges                  |

JetBrains Mono is reserved for **times, dates, codes, and money** — never prose. And only for **Latin/numeric runs**: the face has no Hebrew glyphs, so Hebrew text must never sit inside a mono element (it silently falls back to a generic monospace and reads foreign). Mixed lines — e.g. the day progress's `07:00 · עכשיו · 23:00` — set the row in Assistant and wrap only the numeric runs in mono + `dir="ltr"`.

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

## Core components (from the mockup)

- **Departure-board hero** — live pill ("עכשיו"), clock, now-title, next-row with countdown chip, day progress bar with knob.
- **Quick-access grid** — **real shortcuts into data/surfaces we have**, not concierge fixtures (ADR-0045). v1 ships **three**: next confirmation code (→ index), WiFi copy, documents (→ index). A fourth — **navigate-to-next** (a Maps deep-link) — is **deferred to the maps/location work**: it needs real place data on events, and a fuzzy title-search deep-link now would be a might-be-wrong fixture (ADR-0045). The grid is 3-up until it returns as the 4th. The original "nearby ATM" is gone (needs live location — ADR-0006).
- **Day-at-a-glance card** — the Trip-Home glance, **derived 100% from `events`** (ADR-0045): a **proportional time rail** + a lead **"נותרו"** count + the next hard anchor + a free-until / end-of-day line. Offline-safe, no fixtures. The rail is a true timeline (block width = duration, gaps = free time) with an amber **now-marker** at the true clock position (past = filled, future = hollow); window = 07:00/earliest → 23:00/latest, stretching to an overnight end (ADR-0037, `+1`, never padded to 07:00). Honesty rules: counts are **phase-derived** (a passed-but-unmarked event drops out of "נותרו"), and the rail runs on **top-level containment-forest roots, not raw events** (ADR-0041) — any cluster/envelope collapses to one block + a layered cue + count (`×N` / `כולל N`), so the day never looks busier than it is and detail stays in the day view. **Skipped** shown struck, uncounted. **Empty day** = a calm teach state ("היום עוד פתוח"), never a hidden card or a 0/0 rail; no amber. It **replaces** the old weather / FX / today's-budget glance row (fixtures for unbuilt pipes; budget deferred — ADR-0014 amendment). Weather/FX return as their own cards when the pipes land (ADR-0004). Impl: `lib/glance.ts`.
- **Itinerary item** — tap to expand into quick-verb actions; hard items show an edit warning; `now` item gets an amber ring.
- **Ripple bar** — amber suggestion strip after moving an event.
- **"Maybe" shelf** — horizontal scroll of dashed cards to schedule onto a day.
- **Map** — grid backdrop, teardrop pins in 5 pastel category colors (food/lodging/transit/leisure/services — see legend), blue "me" dot (an OS-map convention, not part of the amber/teal system), a category filter row above "near me now", and an offline state (desaturated backdrop + "last saved locations" banner + stale-distance labels on the list).
- **Index** — booking cards tagged by type (`tag-type` chip: flight/lodging/restaurant/train), a reusable `badge-offline` pill on section headers, normalized source tags (Gmail-import vs. manually-added, same chip shape), and a documents list with an "add document" affordance.
- **Bottom nav** — 4 tabs (🏠 🗺️ 📇 📅), blurred translucent bar. The active ("you are here") tab carries a **tinted pill** behind its icon plus a bold accent label; the marker **follows mode identity** — chrome indigo in Trip mode, `--plan` violet in Plan mode (`--nav-accent`/`--nav-tint`, scoped by `[data-mode]`). It never borrows amber (time) or teal (location). Every icon reserves the pill box so filling only the active one causes no layout shift. **Selecting a tab settles its icon + label a few px down** (a `transform`, so no reflow — the deselected tab rides back up); disabled under `prefers-reduced-motion`. Options studied in `mockups/nav-active-states-v1.html`.
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

`Board` (Now/Next hero) · `CountdownChip` · `VerbRow` (tap-to-expand actions) · `RippleBar` · `MaybeShelf` · `GapChip` · `ReadinessBar` · `BoardingPass` (link-invite card) · `PermRow` (permission toggle row) · `ModePill` · `DayStrip` · `GlanceCard` · `Toast`.

## Emoji are content, icons are UI

In mockups emoji do both jobs; in the build they split:

- **UI controls** (nav, verbs, edit/back/settings) use a consistent icon set, inheriting text color. In the build this is **inline SVG via the shared primitives `ui/NavArrow.tsx`** (directional nav arrows — forward/back, RTL-mirrored) **and `ui/Icon.tsx`** (caret, undo, reset, download, …; sized `1em`, `currentColor`). **Never render a raw Unicode arrow/caret/triangle glyph** (`→ ← › ‹ ↩ ↺ ⬇ ▾ ▴ ▲ ▼`) for a control: the Assistant body font has no glyphs for them, so the browser substitutes a fallback that sits low and drifts off-centre. Add new shapes to `Icon` rather than reaching for a glyph. A lint rule (`no-restricted-syntax`) fails CI on raw arrow/caret glyphs in JSX.
- **Emoji remain as content**: trip identity (🇯🇵), event category badges, group flavor. This keeps warmth without making controls look inconsistent across platforms.

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

| Token               | Value                      | Used for                                              |
| ------------------- | -------------------------- | ----------------------------------------------------- |
| `--t-quick`         | 140ms                      | Nav settle, toggles, hovers, focus                    |
| `--t-base`          | 240ms                      | Tab cross-fade, toast, ripple bar, sheets             |
| `--t-deliberate`    | 400ms                      | Return-gesture slide (ADR-0035); Trip→Plan stand-down |
| `--t-cinematic`     | 600ms                      | Plan→Trip going-live — **the only cinematic moment**  |
| `--ease-standard`   | `cubic-bezier(.2,0,0,1)`   | Default / entrances / hue melts                       |
| `--ease-exit`       | `cubic-bezier(.4,0,1,1)`   | Exits — toast out, glow extinguishing                 |
| `--ease-emphasized` | `cubic-bezier(.16,1,.3,1)` | The glow ignite                                       |

**Budget rule:** exactly one `--t-cinematic` moment exists in the product — the Plan→Trip switch. Spending "cinematic" elsewhere devalues it, same discipline as amber / teal / violet. Motion mirrors "one loud element": everything else stays quick and quiet.

### The mode switch — temperature & energy, not luminance

The Plan⇄Trip switch is the product's most meaningful moment. Crucially it is **not a light-to-dark flip** — that would conflate **mode** with **theme**, two orthogonal axes:

- **Mode** (Plan/Trip) rides on **durable, theme-independent** channels: the chrome's **temperature** (violet ⇄ indigo+amber), the **drafting grid** (plan only), and the board's **glow + pulse** (trip "live"), plus the mode pill. In the light theme the app **body stays paper in both modes** — only the header hue, the hero, the grid, and the glow move.
- **Theme** (light/dark) is the separate **luminance** axis (see "Dark mode readiness"): in dark mode _both_ modes go dark (plan = violet-tinted dark, trip = indigo dark + amber glow). A transition built on luminance would break the moment dark mode ships — so the switch must never touch it, and must read identically in either theme.

**"Go live / Stand down", direction-aware** (studied in `mockups/mode-switch-transition-v1.html`, implemented in `App.css` `[data-switching]` + `screens.css` `board-power`, driven by the Shell in `App.tsx`):

- **Plan→Trip (going live), `--t-cinematic` 600ms:** the chrome warms violet→indigo and the drafting grid dissolves, **then** the board's amber glow ignites and the pulse starts — the climax lands on the "live" energy, not on brightness.
- **Trip→Plan (stand-down), `--t-deliberate` 400ms:** the quieter return — the chrome cools to violet and the drafting grid re-draws (the board leaves with the hero swap). No fanfare; you're back at the desk.
- The transition is **armed only during a switch** (`data-switching` on `.app`, set by the Shell for the animation's duration) so steady-state hovers keep their own timing, and is **fully disabled under `prefers-reduced-motion`** (mode identity still flips, instantly). The board power-on mirrors the zero-state's dormant board — one surface, off → on.
- The **automatic** date-driven switch (ADR-0016) should use a gentler, non-staged version — a flip the user didn't ask for shouldn't perform. _(Currently the same transition serves both; a softened auto variant is a follow-up.)_

## Accessibility: non-color redundancy

- Hard/soft is triple-coded (border style + badge + color) — preserve this pattern everywhere a color carries meaning, including mode identity.
- Amber small text on the dark board is near the contrast floor — amber on `--board` is for **numbers and short labels only** (mono, ≥12px, bold); body text on the board stays in the light blues.
- Touch targets ≥ 44×44px. Focus-visible outlines stay teal on light surfaces, amber on dark; keep them.
- The mockup uses tap-to-expand rather than swipe (swipe breaks in prototypes); revisit real swipe gestures in the build with care.

## Dark mode readiness

Dark mode is a **token remap, not a redesign**. Because every component reads `var(--token)`, dark mode ships by re-mapping the same token names under `:root[data-theme='dark']` — the block already exists in `frontend/src/styles/tokens.css` and is **inert** until something sets `data-theme="dark"` on `<html>`.

**Principles:**

- **The board stays the loudest.** In dark mode everything gets dark, so the board keeps hierarchy differently: it owns the _darkest_ surface (`#0A1120`) plus its amber glow, while cards sit on lighter dark surfaces. Elevation flips to "lighter = closer".
- **Ink/paper swap.** `--ink` becomes light text, `--screen`/`--card` become deep surfaces. `--paper` keeps its _warmth_ in a dark value so badges stay warm.
- **Semantic hues survive, brightened.** Amber/teal/violet keep their meanings with higher-luminance dark variants for contrast. Never introduce new meanings in dark mode.
- **CTA is a pair.** `--cta`/`--cta-text` flip together (dark: light button, dark text).
- **Pulse and mode rules unchanged.** Night/Day mode identity holds in dark mode via hue temperature + drafting grid + mode pill — plan-mode dark chrome is violet-tinted dark, trip-mode chrome stays indigo.
- **Trip mode wants dark.** OLED battery savings matter abroad; a sensible default is trip mode following system theme (or defaulting dark at night).

**Dark remap table** (as wired in `tokens.css`):

| Token                      | Light                 | Dark                                                                                       |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `--ink`                    | `#16233D`             | `#E7EAF2`                                                                                  |
| `--screen`                 | `#E7EAEF`             | `#0F1726`                                                                                  |
| `--card`                   | `#FFFFFF`             | `#1A2740`                                                                                  |
| `--paper`                  | `#F3EFE6`             | `#2E2A20`                                                                                  |
| `--indigo`                 | `#1B2A4A`             | `#131F38`                                                                                  |
| `--board` / `--board-2`    | `#0E1729` / `#152137` | `#0A1120` / `#101B30`                                                                      |
| `--amber` / `--amber-deep` | `#E9A63C` / `#C9822A` | `#F0B254` / `#D89440`                                                                      |
| `--amber-ink`              | `#7A5A1E`             | `#F0B254` (dark-amber text on a light amber _tint_; the tint darkens, so the ink lightens) |
| `--teal`                   | `#2C9C90`             | `#3FB3A5`                                                                                  |
| `--plan` / `--plan-deep`   | `#6E59D6` / `#5747B4` | `#8B79E8` / `#A99AF2` (deep is used as _text_, so lighter)                                 |
| `--muted`                  | `#6C7488`             | `#93A0B8`                                                                                  |
| `--faint`                  | `#98A0B0`             | `#8592AB` (faint hint/placeholder text, one step past `--muted`)                           |
| `--line` / `--soft-line`   | ink @ .10/.28         | light @ .10/.30                                                                            |
| `--cta` / `--cta-text`     | `#16233D` / `#FFF`    | `#E7EAF2` / `#12203A`                                                                      |
| `--ok` / `--miss`          | `#3C9A6B` / `#C2584E` | `#4CBF85` / `#E07A6E`                                                                      |

**Status — shippable behind the `data-theme` toggle** (U-08 / ADR-0082 tail):

The hardcoded-hex sweep is **done**. `App.css` and `screens.css` now read tokens for
every themeable color; the remaining literal hexes are intentionally theme-fixed and
carry a `/* fixed: … */` (or `/* brand */`) marker — light ink painted on the
always-dark trip-mode chrome (header, dormant board, join/land boards, ticket,
trip-hero), ink that rides a semantic fill (dark ink on an amber pill; white on a
plan / ok / miss / cta / ink fill), light ink on the always-violet plan hero, the
shared white spinner, ink on colored avatars, and the Google brand mark. Two tokens
were added to carry drifted values onto the remap: `--faint` (faint hint/placeholder
text) and `--amber-ink` (dark-amber text on a light amber tint). The dark block in
`tokens.css` now covers every color token.

**Before flipping it on for users** (what's left is verification, not wiring):

1. **Live contrast pass** in a real dark render. Computed WCAG ratios (light + dark)
   were checked during the sweep and clear AA for body text (e.g. `--ink` on
   `--card`, `--muted`/`--faint` on `--card`) and AA-large / UI for the amber-on-board
   and on-fill pairs; these need one in-browser confirmation (no runtime existed at
   sweep time). Amber on dark stays reserved for **numbers/short labels ≥12px bold**.
2. **Component QA on the board:** the glow radials use literal rgba — acceptable (glow
   is amber-semantic) — but verify against the darker dark board value (`#0A1120`).
3. **A theme toggle + persistence** (and the trip-mode "follow system / default dark
   at night" default, above) still need wiring — the remap is inert until something
   sets `data-theme="dark"`.
