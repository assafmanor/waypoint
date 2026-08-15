# Session 271 — the tasks design session: §A, §B and §D

**Date:** 2026-08-15
**Input:** [`2026-08-15-tasks-design-brief.md`](2026-08-15-tasks-design-brief.md), Part 2 §A/§B/§D. §C, §E and §F explicitly out of scope, on the precedent of ADR-0153 deferring its own §C.
**Output:** [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html) + [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) (Proposed — design only, nothing built).

## What was asked, and in what order

The brief named §A and §B load-bearing and asked for them first. They were done first, and §B turned out to depend on §A in a way the brief did not anticipate — which is the session's main result.

## The four things reading the code changed

Recorded here because none of them is recoverable from the diff.

1. **§A's premise is false.** It says a task row would be "the first managed list row in the app with an interactive element that is not the `⋯`". `PlaceBadge` already is one — `ListRow` has an `onShowOnMap` prop and it makes the **leading** badge interactive. The app answered this question once already.
2. **And it did not answer it with a sibling.** It used a `role="button"` span **inside** the trigger, with the reason written at `PlaceBadge.tsx:112`. So there were three options, not two. The brief's conclusion (sibling) is right; its stated reason (the parser) only rules out one of the three.
3. **`.chk-row` is `ListRow` written a second time** (`screens.css:1319`), inside a `.checklist` card that is `.index .listcard` under another name. §D says neither Home should grow a bespoke list; one already is one. That made the §D answer a deletion rather than an addition.
4. **The brief's §2 and §4 cannot both survive §A.** §2 says the two kinds look the same; §4 gives an automatic task's done-ness to the derivation. Put a button at the leading edge and "the same" means a dead button in the row's most prominent position.

## What the render found that reading did not

The mockup was rendered four times (light/dark × 360/390) with the webfonts loading, so the text-derived widths are the real face rather than a fallback — the standing caution from ADR-0152's 2026-08-09 amendment does not bite on this file, and the mockup says so rather than repeating the warning by rote.

- **The parser claim reproduces.** Written as a real nested `<button>` and read back off the DOM: the row ends with **4 children instead of 3**. Drawn rather than quoted, because a parser claim is a render result.
- **`border-radius: 50%` clips the hit region.** The 44px control answered **83%** of its own box, with the four corners falling through to the trigger underneath — so a corner tap **opened** the task instead of completing it. A wrong action, not a dead one, and invisible in source. Fixed by taking the kebab's rounded-square recipe; now 95%.
- **The lead slot needs a stacking context.** It uses the kebab's negative-margin trick, so it overhangs by 7px — but it is **first** in DOM order, where the kebab is last, so the trigger paints over the overhang. Same recipe, opposite end, different consequence.
- **The first §D draft broke at 360px, badly.** Carrying `.chk-cta` onto the converged row left the automatic title **101.8px** against the manual row's **195px** directly above it. That is a worse violation of the brief's §2 than anything §3 was drawn to test — and it was invisible at 390px, where both rows measure 61px. Drawing only the design width would have shipped it.
- **The §3 comparison is not a pixel decision, and saying so is the finding.** The two cards measure identically (364/364 at 360, 306/306 at 390). The argument is behavioural, and the mockup's verdict line says that instead of dressing a preference in a number.

## The one place Part 1 was pushed back on

**The brief's §2, amended in ADR-0188 §4:** a manual and an automatic task stay the same noun, one list, one sort, one row shape, no separate section — **except the one element that is a verb**. A manual task leads with the tick; an automatic one leads with the derivation's own badge (PlanHome's existing `CHECK_ICON`), and its done-ness trails as the `.chk-ok` PlanHome already renders.

The brief invited exactly this ("Part 1 is settled but not frozen, and saying so is this session's job, not a failure of it"), and the mockup draws both readings side by side so the owner can overrule it by looking rather than by reading. Everything else in Part 1 stands untouched.

## The rule-8 refusals, argued rather than assumed

- **`SettleControl` is not this control.** It is a symmetric pair asked retrospectively; a task is discharged, not adjudicated. Drawn anyway at `compact` and measured — 82px of lead against 44px, 38px off the title, +18px of row height at 360.
- **The CTA button is deleted rather than carried.** `.chk-row` needs an explicit button because it is a `<div>`; `ListRow` has a tap. ADR-0061 §1's rule survives without the button.
- **The reserved sync column is dropped on automatic rows** — until somebody dismisses, assigns or flags it, an automatic task has no row to sync.

## Owner forks left open

Nothing blocks the build, but three things are a reader's judgement and not a renderer's, and they are listed in the mockup's last panel: whether a 26px ring reads as pressable under a thumb; whether the control-versus-badge difference reads as "who owns this" without being explained; and the final cap on the Trip Home band (drawn at 3, measured at 242px). The §2 amendment above is also an owner call by construction — the alternative is drawn, not described.

## Not done, and deliberately

§C (an `everyone` task partially complete), §E (the hero slot, which lands as an ADR-0160 amendment), §F (the mark on a host row). Each is a stated hand-off in ADR-0188 §8 rather than an unscheduled question.
