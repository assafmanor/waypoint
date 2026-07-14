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
- **Quick-access grid** — 4 icon buttons (nav / next ticket / ATM / WiFi).
- **Glance cards** — weather / FX / today's budget (with mini progress bar).
- **Itinerary item** — tap to expand into quick-verb actions; hard items show an edit warning; `now` item gets an amber ring.
- **Ripple bar** — amber suggestion strip after moving an event.
- **"Maybe" shelf** — horizontal scroll of dashed cards to schedule onto a day.
- **Map** — grid backdrop, teardrop pins in 5 pastel category colors (food/lodging/transit/leisure/services — see legend), blue "me" dot (an OS-map convention, not part of the amber/teal system), a category filter row above "near me now", and an offline state (desaturated backdrop + "last saved locations" banner + stale-distance labels on the list).
- **Index** — booking cards tagged by type (`tag-type` chip: flight/lodging/restaurant/train), a reusable `badge-offline` pill on section headers, normalized source tags (Gmail-import vs. manually-added, same chip shape), and a documents list with an "add document" affordance.
- **Bottom nav** — 4 tabs (🏠 🗺️ 📇 📅), blurred translucent bar.
- **Toast** — dark pill for lightweight confirmations.

## Plan-mode components (from `mockups/plan-mode-v1.html`)

Plan mode reuses the same tokens/grammar as Trip mode, adding builder/entry components. The **light "drafting table" chrome** (light paper header/toggle/day-strip + violet accents + a faint drafting grid) and the **prep-dashboard Home** (violet hero + derived readiness/checklist) are implemented — `App.css`'s `[data-mode='plan']` block, `screens/PlanHome.tsx`, `lib/readiness.ts`. Readiness and the checklist are **derived from the trip snapshot, never stored** (same reasoning as the derived Now/Next); rows that would need data we don't collect yet (Gmail-import, documents, per-member Google-connection) are deliberately absent rather than faked.

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

- **UI controls** (nav, verbs, edit/back/settings) use a consistent icon set (e.g., lucide), inheriting text color.
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

The plan→trip switch is the product's most meaningful moment — design it: the paper chrome dims, the board "powers on" (glow fades in, clock starts). Keep it under ~800ms, fully disabled under `prefers-reduced-motion`. The board power-on is implemented (`screens.css`: `board-power`/`board-glow`, plays when the board appears in Trip mode) and mirrors the zero-state's dormant board — one surface, off → on.

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

| Token                      | Light                 | Dark                                                       |
| -------------------------- | --------------------- | ---------------------------------------------------------- |
| `--ink`                    | `#16233D`             | `#E7EAF2`                                                  |
| `--screen`                 | `#E7EAEF`             | `#0F1726`                                                  |
| `--card`                   | `#FFFFFF`             | `#1A2740`                                                  |
| `--paper`                  | `#F3EFE6`             | `#2E2A20`                                                  |
| `--indigo`                 | `#1B2A4A`             | `#131F38`                                                  |
| `--board` / `--board-2`    | `#0E1729` / `#152137` | `#0A1120` / `#101B30`                                      |
| `--amber` / `--amber-deep` | `#E9A63C` / `#C9822A` | `#F0B254` / `#D89440`                                      |
| `--teal`                   | `#2C9C90`             | `#3FB3A5`                                                  |
| `--plan` / `--plan-deep`   | `#6E59D6` / `#5747B4` | `#8B79E8` / `#A99AF2` (deep is used as _text_, so lighter) |
| `--muted`                  | `#6C7488`             | `#93A0B8`                                                  |
| `--line` / `--soft-line`   | ink @ .10/.28         | light @ .10/.30                                            |
| `--cta` / `--cta-text`     | `#16233D` / `#FFF`    | `#E7EAF2` / `#12203A`                                      |
| `--ok` / `--miss`          | `#3C9A6B` / `#C2584E` | `#4CBF85` / `#E07A6E`                                      |

**Remaining work before dark mode can ship** (why this is "readiness", not "done"):

1. Sweep hardcoded hexes into tokens — e.g., `#fff` hovers, `#FAFBFD` row hovers, header-scoped `#9DAAC8`-family text colors.
2. Contrast pass: amber on dark is for **numbers/short labels ≥12px bold** only; verify toggles and muted text.
3. Component QA on the board: the glow radials use literal rgba — acceptable (glow is amber-semantic), but verify against the darker board value.
