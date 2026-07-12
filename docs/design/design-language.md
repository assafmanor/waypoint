# Design Language

**Status:** ACCEPTED for the mockup; the reference source of truth is `mockups/trip-dashboard-v2.html`. Values below are extracted from it.

## Principle: one loud element, everything else quiet

The **departure-board "Now/Next" card** is the single expressive, glowing element. Everything else is calm and paper-like, so the eye goes straight to _what's happening now_.

## Signature concept

A **departure-board hero** (dark, glowing, monospace times) with a live countdown to the next thing and a progress bar for the day. It borrows the visual language of an airport board because that's the exact feeling we want: _the next departure, the time, the gate, at a glance._

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
| **`--amber`**          | **`#E9A63C`**         | **NOW / active — this color only**                                       |
| `--amber-deep`         | `#C9822A`             | Amber pressed/hard-code accent                                           |
| **`--teal`**           | **`#2C9C90`**         | **Location / map — this color only**                                     |
| `--muted`              | `#6C7488`             | Secondary text                                                           |
| **`--plan`**           | **`#6E59D6`**         | **Plan mode — this color only** (`--plan-deep` `#5747B4`, `--plan-tint`) |
| `--cta` / `--cta-text` | `--ink` / `#FFF`      | Neutral primary button (semantic colors are never CTAs)                  |
| `--ok` / `--miss`      | `#3C9A6B` / `#C2584E` | Status mini-palette (positive/negative)                                  |

### Functional color coding (important)

Color carries meaning so the eye can parse a screen **without reading**:

- **Amber** = _now / active / the current thing._ Nothing else uses amber.
- **Teal** = _location / map / navigation._ Nothing else uses teal.

A small **decorative palette** (avatar identity colors, map pin categories) exists alongside these — always pastel/muted, never amber or teal, so it reads as gentle variety rather than a second meaning system. See the Map pins entry below.

## Typography

| Family           | Use                                      |
| ---------------- | ---------------------------------------- |
| `Secular One`    | Headings / titles                        |
| `Assistant`      | Body                                     |
| `JetBrains Mono` | Times & codes (the departure-board feel) |

**Full RTL.** Layout, icons, and directionality are Hebrew-first. Latin strings (times, codes, flight numbers) are wrapped `dir="ltr"` inside the RTL flow.

## Hard vs. soft visual grammar

This is the most important visual rule after the color coding:

- **Hard 🔒** — solid card, a `🔒 קשיח` badge, and a monospace confirmation code chip. Feels committed.
- **Soft** — dashed border, diagonal-hatch background, lighter type. Feels provisional and movable.

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

Plan mode reuses the same tokens/grammar as Trip mode, adding builder/entry components:

- **Mode toggle** — a pill (✏️ תכנון / 🧭 טיול) in the header showing the manual override, with an "auto-switches on <date>" hint (ADR-0016).
- **Prep dashboard hero** — countdown to departure + a **readiness bar** (% complete). **Plan violet** rather than amber, since it's not "now" (teal is location-only — addendum §1).
- **Completeness checklist** — rows with status (✓ done / warn / missing) and inline CTAs ("הוסף", "בנה יום", "תזכורת").
- **Itinerary builder rows** — event rows with a **drag grip** (⠿), hard/soft tag, editable time, edit affordance; **gap chips** between events ("פער 2 שעות · מלא").
- **Add-event / booking-entry forms** — inline forms with a **hard/soft kind selector** (amber=hard, teal=soft) and per-type booking fields.
- **Place research** — a search bar + result cards with rating and "＋ אולי" (add to the maybe-shelf).
- **Day selector strip** — days 1–N with an **empty-day** marker (dashed, red number) surfacing gaps to fill.

**Tablet layout:** the builder becomes two columns (itinerary + research/maybe side panel) — see the tablet frame in the mockup (ADR-0017).

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

## Motion

Subtle fades on view change; pulsing "live" blip; countdown/clock tick. Respects `prefers-reduced-motion` (all animation disabled).

## Accessibility notes to carry into build

- Focus-visible outlines use teal; keep them.
- Don't rely on color alone — hard/soft also differ by border style and badge, which is good; preserve that.
- The mockup uses tap-to-expand rather than swipe (swipe breaks in prototypes); revisit real swipe gestures in the build with care.
