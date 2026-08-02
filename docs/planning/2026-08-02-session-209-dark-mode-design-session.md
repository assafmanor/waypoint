# 2026-08-02 · session 209 — the dark-mode design session

Promoted into [ADR-0157](../decisions/0157-dark-mode-ships-and-the-ink-a-surface-carries-is-a-token.md).
Mockup: [`mockups/dark-mode-v1.html`](../../mockups/dark-mode-v1.html). No product
code changed — the build is phased in the ADR's §10 and starts after this merges.

## What the session was asked to settle, and what it actually found

The brief framed this as two design questions on top of finished colour work:
what dark mode looks like given that `/login` and `/join` are already dark, and
where the theme toggle lives. Both are answered (ADR §9, §8). But the brief's own
last line — _"the pass this cannot skip: live in-browser contrast confirmation"_ —
is what the session turned out to be about.

**The colour work was done and had never been rendered.** Setting `data-theme` on
the running app for the first time produced four findings, none of which is
visible on paper:

1. `background: var(--ink); color: #fff` on `.choice-pill.on` — **1.20:1**, white
   on near-white, on a control in the app's forms. Nine more like it.
2. The plan hero at **L\* 68**, the brightest surface in the dark app, ink at
   2.16:1 — in the calm mode, out-shouting the trip board.
3. `.nav` at `rgba(255,255,255,.92)`, so the tab bar stays white in dark. One
   root cause behind **all twelve** of dark's failing text nodes.
4. And the one nobody was looking for: **light fails 78 of 238 text nodes, dark
   fails 12.** The shipped theme is the broken one.

## The three corrections the owner made, and what each changed

This session was steered three times and each steer changed the output
materially. Recording them because two of them are process lessons, not taste.

**"The mockup comes as gibberish when downloading."** No doctype, no charset, so
Chrome guessed the encoding and the Hebrew was mojibake. Eight of 73 mockups have
that hole. Worth a sweep of the other seven at some point.

**"Some of the designs look outdated or even made up."** They were. The first
draft hand-drew simplified versions of the board, the cards, `/login` and
`/settings` rather than using the app's own — which is exactly what
`map-search-v1.html`'s header warns about ("a mockup that reads the app's CSS
still does not inherit its layout tree"). The fix was structural: the mockup is
now **generated**. `build-dark-mode-v1.mjs` reads the CSS from `frontend/src` at
build time, `extract-dark-mode-dom.mjs` captures the DOM from the running app,
and proposals are applied as CSS **overlays**, so "shipped" and "proposed" are
the same screen and a stale mockup would mean a stale checkout. It also got plan
mode, which the hand-drawn version could not honestly show — and plan mode is
where finding #2 lives.

**"The avatar still carries the blue hue — probably more places do too."** Both
true, and this is the steer that produced the ADR's largest section. Sweeping
every colour declaration on a trip-chrome surface found **53, of which 4 are
marked**. None is wrong today; each is correct _given a dark chrome_, and nothing
records the dependency. Following it out to the whole always-dark surface family
found **53 light-ink declarations carrying 18 distinct hex values doing three
jobs** — the fold that became ADR §3, and which retired this session's own
earlier recommendation ("mark the ~21 `/login` literals `fixed:`") as too narrow
by half.

## The two things that changed my mind mid-session

**The board's dark-mode prominence is not what design-language says it is.** The
doc claims the board keeps hierarchy by owning the darkest surface while cards
sit on lighter dark ones. Measured: board→screen is **ΔL\* 2.6** in dark against
**84.8** in light. It is not a visible edge, and the render confirms the board
has no boundary against the body. What actually carries it is **amber density** —
every amber element on the screen is inside the board — and the hierarchy
_inverts_ rather than weakening: in light the board is the object and the cards
are quiet; in dark the cards are the objects and the board is the field they sit
above. That is closer to what the board is, and it is why both candidate edges
(an amber rim, a neutral hairline) were drawn and rejected.

The sharpened rule, which is a real tightening: **in dark mode amber density IS
the ration**, so amber spent anywhere else comes straight out of the board's
prominence with nothing left to compensate.

**A three-step ink ramp cannot survive AA at small sizes on white.** `--faint`'s
call sites are 11.5–15px normal text, so their floor is 4.5, not 3.0. Darkening
`--faint` to clear it lands at L\* 44.6 against `--muted`'s L\* 44.0 — 0.6 apart,
identical to the eye. So `--faint` narrows to _placeholders_ and every persistent
hint moves to `--muted` (ADR §7). That is the one place in this work where the
measurement forced a change of meaning rather than a change of value.

## What is deferred, and why it is not an omission

The **light trip chrome**. Light mode is ~220px of dark chrome above a dark hero,
so it reads half dark-mode — the owner's observation, and correct. Four renders
against the real app establish that the _hero_ is load-bearing (lighten it and
the chrome inherits the prominence, inverting the hierarchy) and the _chrome_ is
what looks out of place; four grounds are drawn and **indigo 12%** recommended,
because it keeps the trip hue so mode identity survives on hue rather than
luminance. Deferred because it moves a surface ADR-0028 names as mode identity,
that ADR-0142 animates and ADR-0143 is choreographed against, and because the
backlog already carries a **Hero 2.0** line for this region. ADR §5's chrome
token contract is what makes it seven lines when it comes.

Also deferred, and flagged rather than fixed: the owner's palette note ("the warm
gold-yellow is overwhelmingly yellow") was **my** doing — I had spent `--paper`,
a warm badge accent, as a whole chrome ground. Not a constraint of the design.

## Method notes worth keeping

- **The runtime auditor was wrong the first time and said so loudly.** Its first
  version composited a single background layer and fell back to white, reporting
  white-on-white at 1.00:1 for text that is plainly legible. The tell was the
  total: zero failures in both themes, from 72 nodes across sixteen page loads.
  A contrast sweep that finds nothing is a broken sweep, not a clean bill.
- **What it deliberately does not measure:** 110 nodes sit over a gradient (the
  board, the land/join grounds, the plan hero) and `getComputedStyle` cannot say
  which stop is behind the glyph. Guessing would manufacture both false passes
  and false failures, so those are counted and excluded — and they are exactly
  the surfaces ADR §3's ink ramp governs, which is the argument for governing
  them by token instead of by measurement.
- **The dev stack kept dying between tool calls** and took two runs' results with
  it before the pattern was obvious: `/me` answering 500 because Postgres had
  stopped, which renders as `/login` and looks like an auth problem. Starting the
  servers and the audit in one invocation is the workaround.
- Every number here is a **Chromium render at 411×914**. ADR-0125 is the local
  precedent for a palette that measured fine and read as one hue on real glass;
  the device pass is ADR §10's phase 6 and it is not optional.
