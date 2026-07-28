# Hero 2.0 — design brief (raised 2026-07-28, session 148)

**Status:** a brief, not a decision. Orientation for whoever opens the design session;
nothing here is authoritative until it lands in an ADR. Raised by the owner while
Phase 5 of the map epic was being built, and it is the reason that phase deliberately
put **nothing** on the board (ADR-0121's 2026-07-28 amendment §4).

## What prompted it

Phase 5's rule was "every event and booking has an easy way to its pin". Applied
literally, that put a teal ring and a pin marker on the board's now/next icons — and it
read **too loud**. The board is the app's one dark, glowing, pulsing surface, rationed
to one per screen (design-language.md), and a per-entity control on it competes with
the thing the board exists to say.

The owner's reaction named the real shape: the hero should not grow controls, it should
**open**. Tapping it expands it — with animation — to show more, and actions become
possible in place. That is a redesign of the app's signature surface, not a slot for one
affordance, so it gets its own session.

## The question to answer

**What is the board when you tap it?** Today it is a pure readout with exactly one
interactive element (the `ועוד N עכשיו` concurrency expander). "Hero 2.0" proposes it
becomes a surface with two states: the glanceable board it is now, and an expanded form
carrying more of what you need about the current and next thing — reachable without
leaving Home.

Sub-questions worth settling in the ADR, each with a real tension behind it:

1. **What does the expanded state show that the collapsed one cannot?** The board
   already carries title, kind, until-time, code, countdown, zone shift, conflicts and
   concurrency. Whatever expansion adds has to be worth an interaction, not a reflow of
   the same facts — otherwise this is animation for its own sake.
2. **Which actions?** The map way-in is the one this brief inherits. Candidates beyond
   it: `ניווט`, the settle verbs (`היינו`/`דלג`), the ±30 nudge, the way through to the
   booking. Note that all of these already exist on `EventCard` in the day view, so the
   real question is **which of them earn a second home** rather than which are possible.
3. **Is it an expansion or an overlay?** An expansion is a pane _of_ Home and changes
   the page's height under the user's thumb; an overlay is a `Modal` and registers with
   the back stack (ADR-0090 — every overlay does, and it is lint-enforced). These are
   different back behaviours and different animations, and the choice is load-bearing.
   `SnapSheet` is the precedent for "a pane, not a layer" (ADR-0121 §5, and
   frontend/CLAUDE.md's "the exception that proves the rule").
4. **What happens to the `ועוד N עכשיו` expander?** The board would then have two
   expanding things. Most likely they become one, and that is a real simplification to
   claim rather than a detail.
5. **Does the hard/soft grammar survive?** ADR-0011 is non-negotiable: a hard
   commitment is guarded on edit. Any editing action in the hero has to honour that,
   which may mean the hero offers reads and hand-offs but not edits.
6. **Does the loud-element ration still hold?** If the hero expands into a surface with
   actions, is it still "one loud element", or does the expanded state need to go
   quieter than the collapsed one to stay inside ADR-0028's budget?

## Read first

- `docs/design/design-language.md` — the board is the named "one loud element";
  the amber/teal/violet budget.
- [ADR-0045](../decisions/0045-trip-home-real-data-only.md) — Home is real data only,
  no fixtures for unbuilt features; the quick-tile grid's shape.
- [ADR-0041](../decisions/0041-parallel-overlapping-events.md) — concurrency on the board (the
  one loud hero + `ועוד N`, and the group-split case).
- [ADR-0059](../decisions/0059-booking-presentation-on-home-and-index.md) §1–§3 — which booking moments
  reach the hero at all (in-transit, check-in/out), and why an ambient hotel never
  hijacks it.
- [ADR-0090](../decisions/0090-back-is-computed-from-nav-state.md) — if it is an
  overlay it is a back layer, and back is computed, never traversed.
- [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md) §5 + its 2026-07-28
  amendment §4 — the "pane, not a layer" precedent, and why Phase 5 left the board
  alone.
- [ADR-0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) — every time
  in the hero reads in its own event's zone; an expanded hero shows more times, so more
  of this applies.
- `frontend/src/ui/domain/Board.tsx` — the current component. Presentational, all data
  via props, four variants (`now` / `in-transit` / `group-split` / `free`). Note how
  much state it already models before adding one more.

## Constraints that are not up for grabs

- **Mobile-first, phone-primary** (ADR-0017): the collapsed board must not lose glance
  value to make room for the expanded one, and any control needs a 44×44 target.
- **Derived, never stored** (ADR-0018/0027): now/next come from the clock and the
  events. An expanded hero must not tempt anyone into caching a "current" pointer.
- **Every overlay is a `Modal`** (ADR-0090, lint-enforced) — so if the answer is an
  overlay, it goes through the primitive; if it is a pane, it registers nothing and
  back leaves the tab.
- **One loud element per screen.** Whatever this becomes, Home still has one.

## Suggested shape of the session

Design session with a mockup before any build — the same sequence Phase 2 of the map
panel used, and for the same reason: this is a **layout and motion** question on a
surface whose budget is already spent, so it needs to be seen at 390×844 and 360×640
before it is written. Reproduce the real layout tree, not just the real CSS
(`mockups/map-split-v2.html`'s entry in `design/mockups.md` explains why that
distinction has already burned one session), and inline the app's stylesheets via
`mockups/tools/inline-app-css.mjs` so the collapsed state in the mockup is genuinely
the shipped board.
