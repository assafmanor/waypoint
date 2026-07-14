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

## Constraints honored

- **Night/Day mode identity** (`design-language.md`, ADR-0028): Trip = dark indigo
  board chrome + amber + pulse; Plan = light paper "drafting table" + violet +
  drafting grid, no pulse.
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

| # | Name | Timing | Verdict |
| - | ---- | ------ | ------- |
| A | **Crossfade dim** — all themed surfaces cross-fade | 450ms | The floor + the reduced-motion fallback. Tells no story. |
| **B** | **Board wakes** — chrome dims to indigo, board brightness+glow rise, amber+pulse arrive last; quiet inverse on the way back | **600 / 400ms** | **Recommended.** The only one that animates the product's story; extends the existing `board-power` seed. |
| C | **Dusk sweep** — a luminance light-line wipes across; mode commits behind it | 520ms | Pretty + directional, but optional polish **over** B, not a base. |
| D | **Ripple from toggle** — circular clip-path reveal from the tapped switch | 500ms | Rejected — reads Material/consumer-flashy; also awkward for the auto (tap-less) switch. |
| E | **Temperature shift** — only the accent morphs amber⇄violet; frame holds still | 280ms | Too timid for a tap, but **ideal for the automatic date-driven switch** (never startles). |

## Recommendation

1. **User-initiated switch → B ("Board wakes"), direction-aware.**
   - **Plan→Trip** = the arrival, two-beat at `--t-cinematic` (600ms): chrome→indigo,
     then board brightness+glow rise, accents + pulse on the tail.
   - **Trip→Plan** = the quiet return at `--t-deliberate` (400ms): glow fades, board
     flattens to paper, drafting grid resolves. No fanfare.
2. **Automatic date-driven switch → E (Temperature shift, 280ms).** A silent flip
   the user didn't ask for shouldn't be cinematic.
3. **Reduced-motion → A collapsed to instant.** Token remap, mode identity intact.
4. **C (sweep)** is a stretch-goal polish layer over B; **D (ripple)** is out.

## Proposed motion tokens (the shared vocabulary)

| Token | Value | Used for |
| ----- | ----- | -------- |
| `--t-quick` | 140ms | Nav settle, toggles, hovers, focus |
| `--t-base` | 240ms | Tab cross-fade, toast, ripple bar, sheets |
| `--t-deliberate` | 400ms | Return-gesture slide (ADR-0035); Trip→Plan |
| `--t-cinematic` | 600ms | Plan→Trip board wake — **the only cinematic moment** |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Default / entrances |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Exits (toast out, dismiss) |
| `--ease-emphasized` | `cubic-bezier(.16,1,.3,1)` | The board wake |

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
