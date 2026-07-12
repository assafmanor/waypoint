# Design Principles — Addendum

**Status:** PROPOSED. Extends `docs/design/design-language.md`. The existing doc defines the tokens and grammar; this addendum adds the _principles that keep new screens honest_ — several recent mockups (lobby, join, settings) already drift from the rules, and the fixes are listed at the end.

---

## 1. Mode identity: Night vs. Day

The two modes must be identifiable **at a glance, from any screen**, without reading.

|                            | **Trip mode**                       | **Plan mode**                   |
| -------------------------- | ----------------------------------- | ------------------------------- |
| Metaphor                   | Night — the glowing departure board | Day — the drafting table        |
| Chrome (header/status bar) | Dark indigo `--indigo`              | Light paper with violet accents |
| Accent energy              | Amber (live, pulsing)               | Violet (calm, no pulse)         |
| Texture cue                | Board glow                          | Subtle drafting-grid on chrome  |
| Mode pill                  | 🧭 טיול                             | ✏️ תכנון                        |

**New tokens:**

| Token         | Hex                    | Role                                                            |
| ------------- | ---------------------- | --------------------------------------------------------------- |
| `--plan`      | `#6E59D6`              | Plan-mode accent: mode chrome details, readiness bar, plan CTAs |
| `--plan-deep` | `#5747B4`              | Pressed / emphasis                                              |
| `--plan-tint` | `rgba(110,89,214,.10)` | Plan-mode fills, selected states                                |

**Rules:**

- **Teal returns to location-only.** Anything currently using teal to mean "planning" or "progress" migrates to `--plan`. (This resolves the teal double-duty introduced by the prep hero and the settings header.)
- Plan mode never uses the pulsing live blip. Nothing in plan mode is "live".
- The status bar and header always follow the mode — the mode is readable from the chrome alone, before any content.
- Mode is signaled by **at least two channels** (chrome color + mode pill + texture), never color alone.

## 2. Semantic colors are a budget, not a paint bucket

Each semantic color has one meaning-family, and spending it elsewhere devalues it everywhere:

- **Amber = the clock & the commitment.** Now, countdowns, the live blip, the `🔒 קשיח` lock, ripple suggestions, the selected "today". This is one coherent family: _things bound to time_.
- **Teal = the place.** Map, navigation, location affordances, "near me". Nothing else.
- **Violet = the plan.** Plan-mode chrome, readiness, builder affordances. Nothing else.

**Consequence — neutral primary CTA:** generic primary buttons ("＋ טיול חדש", "הצטרף לטיול", form submits) must **not** be amber. Introduce a neutral primary:

| Token        | Value             | Role                                                                |
| ------------ | ----------------- | ------------------------------------------------------------------- |
| `--cta`      | `--ink` (#16233D) | Primary button background                                           |
| `--cta-text` | `#FFFFFF`         | Primary button text (pairs with `--cta` so dark mode can flip both) |

**Status mini-palette** — positive/negative states (FX ▲/▼, budget health, checklist ✓/✗) are _statuses_, not places — they must not borrow teal. Reuse the hues already in `plan-mode-v1.html`:

| Token    | Hex       | Role                                              |
| -------- | --------- | ------------------------------------------------- |
| `--ok`   | `#3C9A6B` | Positive status (on budget, done, rate up)        |
| `--miss` | `#C2584E` | Negative status (missing, over budget, rate down) |

Amber on a button is allowed only when the action itself is time-semantic (e.g., "דחה 30 דק׳" confirmation, ripple "כן").

## 3. The board is rationed

The dark departure-board surface means **"the trip is speaking."** It keeps its power only if it is scarce:

- **Max one board surface per screen.**
- Trip dashboard: the Now/Next hero. Lobby: the single active-trip card. Join/link: the trip-preview card. Never two on one screen.
- The pre-login landing teaser is the one marketing exception.
- Everything else — lists, settings, forms — stays on paper (`--card` / `--screen`).

## 4. Pulse means live — right now

The pulsing blip is a claim: _something is happening this minute._

- Pulse only in active trip mode (or a genuinely live signal such as a flight update).
- Future trips, invites, and plan-mode elements get **static** badges.
- One pulsing element per screen, maximum.

## 5. Scales, not ad-hoc values

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

JetBrains Mono is reserved for **times, dates, codes, and money** — never prose.

**Radius ramp:** `8` chips/tags · `12` inner elements (badges, inputs) · `16` cards · `22` hero surfaces · `999` pills. (Phone frame `38` is a mockup artifact, not a token.)

**Spacing:** 4px base grid; component padding from `{8, 12, 16, 20, 24}`.

**Elevation:** three levels only — `flat` (border, no shadow: list cards), `raised` (soft shadow: interactive cards), `floating` (strong shadow: board, toasts, sheets).

## 6. States are first-class, offline is a feature

Trip mode assumes bad connectivity abroad. Every component ships with its states designed, not improvised:

- **default · active/now · offline · empty · loading.**
- Offline grammar (already started on the map): desaturated surface + "last saved" banner + stale-data labels. Apply the same grammar to index, board, and glance cards.
- Empty states teach ("היום ריק — גרור מהמדף"), never dead-end.

## 7. Non-color redundancy (accessibility)

- Hard/soft is already triple-coded (border style + badge + color) — preserve this pattern everywhere a color carries meaning, including mode identity (§1).
- Amber small text on the dark board is near the contrast floor — amber on `--board` is for **numbers and short labels only** (mono, ≥12px, bold); body text on the board stays in the light blues.
- Touch targets ≥ 44×44px. Focus-visible outlines stay teal on light surfaces, amber on dark.

## 8. Emoji are content, icons are UI

In mockups emoji do both jobs; in the build they split:

- **UI controls** (nav, verbs, edit/back/settings) use a consistent icon set (e.g., lucide), inheriting text color.
- **Emoji remain as content**: trip identity (🇯🇵), event category badges, group flavor. This keeps warmth without making controls look inconsistent across platforms.

## 9. Component lexicon

Canonical names, for docs / code / tickets — one vocabulary end to end:

`Board` (Now/Next hero) · `CountdownChip` · `VerbRow` (tap-to-expand actions) · `RippleBar` · `MaybeShelf` · `GapChip` · `ReadinessBar` · `BoardingPass` (link-invite card) · `PermRow` (permission toggle row) · `ModePill` · `DayStrip` · `GlanceCard` · `Toast`.

## 10. Designed transitions

The plan→trip switch is the product's most meaningful moment — design it: the paper chrome dims, the board "powers on" (glow fades in, clock starts). Keep it under ~800ms, fully disabled under `prefers-reduced-motion`.

---

## 11. Dark mode readiness

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

---

## Fix list for existing mockups

**Status: APPLIED** — in this repo: `mockups/screens-v1.html` (items 1, 3, 4, 7), `mockups/plan-mode-v1.html` (items 2, 5), and `mockups/trip-dashboard-v2.html` + the ported app CSS `frontend/src/screens.css` (item 8, plus the FX/budget status swaps of §2).

1. **Settings screen (planning):** teal header → plan-mode light drafting chrome (paper + grid texture) with `--plan` accents; status bar follows the mode; edit links, invite box, and toggles inside plan mode use `--plan`.
2. **Prep dashboard hero:** readiness bar teal → `--plan`; teal remains location-only. _(Applied in `mockups/plan-mode-v1.html`.)_
3. **Lobby:** "＋ טיול חדש" amber CTA → neutral `--cta`; pulsing badge on a future trip → static amber "🗓️ בעוד 12 יום" (countdown is time-semantic, so amber static is correct — but no pulse).
4. **Join (code + link):** "הצטרף לטיול" amber → neutral `--cta`; removed the pulsing blip from the open-invite badge (an invite is not "live").
5. **Day strip:** selected-day amber is acceptable in trip mode (it _is_ "today/now"); in plan mode, selection uses `--plan-tint`, since no day is "now".
6. **Ripple "כן" button:** stays amber — it is a time action. Good as is.
7. **Toggles (new):** toggle "on" state teal → neutral `--ink` globally (teal is location-only); inside plan-mode screens the on-state uses `--plan`.
8. **Maybe-shelf "＋ שבץ ליום" (new):** teal → `--plan` — scheduling is a plan action even in trip mode. Navigation verbs (`ניווט`) keep teal: that _is_ location.
