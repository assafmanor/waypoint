# 2026-07-14 · Session 15 — Plan⇄Trip mode-switch transition (design study)

**Status:** Scratch / exploration. This note is orientation, not authority — nothing
here is binding until it lands in `design-language.md` (Motion section) or an ADR.

## Goal

Design the Plan⇄Trip mode-switch color/lighting transition — the moment
`design-language.md` calls "the product's most meaningful moment" but leaves
under-designed. Today only the board **power-on** exists (`screens.css`
`board-power`/`board-glow`, 0.65s, plays when the board mounts in Trip mode);
the surrounding chrome swap (`data-mode` on `.app`) is **abrupt**, and the
**Trip→Plan** return has no designed counterpart. Also surveyed the other
in-app transitions so motion reads as one system.

## Correction (v1 draft was wrong)

The first pass framed the switch as a **luminance** cycle — "the paper dims, the
board powers on" — and rendered the whole Trip surface dark. That conflates
**mode** with **theme**. They are orthogonal axes:

- **Mode** (Plan/Trip) is carried by **durable, theme-independent** channels:
  temperature (violet ⇄ indigo+amber), the drafting grid (plan only), and the
  board glow+pulse (trip "live"), plus the mode pill. In the light theme the
  **body stays paper in both modes** — only the header hue, the hero, the grid,
  and the glow move.
- **Theme** (light/dark) is the **luminance** axis, orthogonal and future work.
  Per `design-language.md` "Dark mode readiness", in dark mode **both** modes go
  dark: plan = violet-tinted dark, trip = indigo dark + amber glow.

So a mode transition built on luminance breaks the moment dark mode ships. Every
candidate must read identically in either theme — the lab now has a **light/dark
toggle** to prove it.

## Constraints honored

- **Night/Day mode identity** (`design-language.md`, ADR-0028) read correctly:
  the identity is temperature + grid + glow + pill, **not** light-vs-dark.
- **Switch model** (ADR-0016): mode is derived from dates with a per-user,
  session-only override via the header toggle. So the transition fires on **two**
  triggers — a **user tap** (celebrate it) and an **automatic date flip** (must
  not startle).
- **Motion budget** mirrors "one loud element, everything else quiet" and the
  color budget: one cinematic moment, everything else quick/quiet;
  `prefers-reduced-motion` collapses all of it to an instant remap.
- Keep the celebrated beat **≤ ~800ms** (design-language).

## Deliverable

`mockups/mode-switch-transition-v1.html` — an interactive "motion lab": a live
phone that genuinely switches modes, five selectable transition engines, a
direction toggle, a reduced-motion switch, an "other transitions" strip, and the
proposed motion-token ramp. (Fonts are a system substitute for Secular
One/Assistant/JetBrains Mono so it runs standalone; motion, not type, is the
subject.)

## Candidates evaluated

All operate on the **durable** channels (temperature / grid / glow), never
luminance, so each was verified to read the same in light **and** dark theme.

| # | Name | Timing | Verdict |
| - | ---- | ------ | ------- |
| A | **Crossfade** — every channel (hue, grid, hero, glow) melts at once | 450ms | The floor + the reduced-motion fallback. Tells no story. |
| **B** | **Go live / Stand down** — warm the chrome + dissolve the grid, *then* ignite the board glow + pulse; quiet inverse back | **600 / 400ms** | **Recommended.** Animates the product's story on durable channels; extends the existing `board-power` glow keyframe. |
| C | **Grid resolve** — plan-led: the drafting grid draws in / erases as the lead gesture, hue+glow follow | 500ms | Nice structural read; a touch quieter than B's energy climax. |
| D | **Hue sweep** — a warm/cool temperature band wipes across the **chrome only** (never full-screen) | 520ms | Optional connective polish over B; chrome-band scoping keeps it from reading as a brightness change. |

(An expanding-circle "ripple from the toggle" was prototyped and cut — reads
consumer-flashy, and has no origin point on the tap-less auto switch.)

## Recommendation

1. **User-initiated switch → B ("Go live / Stand down"), direction-aware.**
   - **Plan→Trip** (going live), `--t-cinematic` (600ms): hue warms violet→indigo,
     grid dissolves, **then** the board's amber glow ignites + pulse starts — the
     climax lands on the "live" energy, not on brightness.
   - **Trip→Plan** (stand-down), `--t-deliberate` (400ms): glow extinguishes +
     pulse stops, then indigo cools to violet and the grid re-draws. No fanfare.
   - **Touches luminance nowhere** → identical in light or dark theme.
2. **Automatic date-driven switch → a gentler, non-staged version (~280ms, close
   to A).** A flip the user didn't ask for shouldn't perform.
3. **Reduced-motion → A collapsed to instant.** Token remap, mode identity intact.
4. **C / D** are optional layers/variants over B, not bases.

## Proposed motion tokens (the shared vocabulary)

| Token | Value | Used for |
| ----- | ----- | -------- |
| `--t-quick` | 140ms | Nav settle, toggles, hovers, focus |
| `--t-base` | 240ms | Tab cross-fade, toast, ripple bar, sheets |
| `--t-deliberate` | 400ms | Return-gesture slide (ADR-0035); Trip→Plan |
| `--t-cinematic` | 600ms | Plan→Trip going-live — **the only cinematic moment** |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Default / entrances / hue melts |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Exits (toast out, glow extinguishing) |
| `--ease-emphasized` | `cubic-bezier(.16,1,.3,1)` | The glow ignite |

**Budget rule:** exactly one `--t-cinematic` moment exists in the product; spending
it elsewhere devalues it — same discipline as amber/teal/violet.

## Other transitions surveyed (should share the tokens)

Tab change (cross-fade, `--t-base`), toast (rise-in/drop-out), nav tab settle
(`--t-quick`, transform-only — nav-active-states-v1), ripple bar (slide-up,
`--t-base`), plus the existing board power-on and the ADR-0035 return-gesture slide.

## Next steps (not done here)

- Adopt: add a **"Motion & designed transitions"** expansion to `design-language.md`
  with the token ramp + the B/E/reduced-motion decision.
- Wire: transition vars on the `.app` chrome + a direction-aware class set on the
  mode flip (`state/mode-state.tsx` / `App.tsx` `Shell`), reusing the existing
  `board-power` keyframe for beat 2. Add the motion tokens to `tokens.css`.
