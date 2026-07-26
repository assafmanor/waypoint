# Session 131 — the embedded map, designed (Phase 6)

**Date:** 2026-07-26
**Branch:** `claude/places-maps-epic-vde21w`
**ADR:** [0121](../decisions/0121-embedded-map-phase-6-design.md) · Mockup: [`mockups/map-embedded-v1.html`](../../mockups/map-embedded-v1.html)
**Paper only** — no feature code. Annotates ADR-0106, 0108, 0109, 0117, 0119, 0078.

**The decisions are in ADR-0121, which is written to be read start to finish** — this note is
what happened and what surprised us, not a second copy of the design.

Opened with "what now?" on the epic. Phases 0–5 are shipped, so the only phase left is the
embedded map — which ADR-0109 and the backlog both said must not be designed until current
Maps API + pricing were reconfirmed. That reconfirmation needs no Google key, so it was the
session.

## What the reconfirmation found

The architecture held: JS API over the Embed iframe, the split key, cloud styling,
`AdvancedMarkerElement`, free-connectors-before-paid-routes. Two things moved — a **`mapId` is
now mandatory** rather than merely enabling (advanced markers do not load without one, which
adds a human Phase-0 step), and **Routes Essentials caps at 10 intermediate waypoints**, not
the ~25 ADR-0106 §D assumed. Neither affects this phase; both would have bitten later.

## The three things that actually shaped the build

**Dynamic Maps bills per map instantiation**, not per tile. That reframes cost from "how many
tiles" to "how many times do we construct a map" — and the app answers it for us, since
`AppShell` keys `<main>` by tab and the Map screen unmounts on every tab change. The
temptation was a global map singleton above the router; rejected on arithmetic (~100 loads/day
against 10,000/month free).

**The Map tab has no layout to hang a split on.** `.map-screen` sets only accent tokens, and
every screen lives in `AppShell`'s scrolling `.body`. This was the review's biggest find, and
worth naming _how_ it hid: **the mockup had silently supplied the missing flex column**, so the
design looked correct against the app's real CSS while being unbuildable. A mockup that reads
the app's CSS still does not inherit its layout tree.

**A full-bleed map pane hides Google's attribution**, which the ToS requires stay visible — the
API draws it at the bottom-left of the map div, and the sheet always covers that. Sizing the
pane to the visible area fixes it and makes fit-to-bounds honest at the same time.

## Wrong turns worth not repeating

Each is one line in ADR-0121's revision log; the record exists so they are not re-proposed.

- A **connector cannot show order** — a segment is symmetric. Order moved to numbered pins, and
  the line kept only its remaining job (the day's shape), which is a Plan-mode question.
- The next-stop cue was a **box around** the teardrop, which read as a circle drawn near a pin.
  Now an outline tracing the pin's own silhouette.
- "Tap = focus" **stranded the coordless place**, which is still referenced and still needs its
  way through to the event. The verb is _select_; focusing is what selection does when there
  are coordinates.
- "No clustering" rested on **count, not density** — a bad reason for a decision that is still
  right. Eight places in one district are unreadable at city zoom whatever the trip's total.
- The `מה נשאר` chip's count was **mislabelled in the mockup**, reproducing ADR-0119's
  count-vs-render bug within minutes of adding a third filter axis. That is why the ADR states
  the coupling requirement rather than implying it.
- The browser key was **named two different things** across `deployment.md` and ADR-0108, and
  the newly-mandatory `mapId` had no var at all.

## Method notes

**The mockup renders through the app's real stylesheets**, inlined mechanically by
`mockups/tools/inline-app-css.mjs` from an `APP-CSS:` manifest. Linking them relatively was the
first attempt and failed on a phone, which cannot resolve `../frontend/src/…` through a share
sheet; inlining keeps both properties — genuinely the app's CSS, and portable. Two lessons came
out of the tool itself: it **ate its own documentation** on the first run (the file's header
comment names the tag its regex looked for), and the file needs `.prettierignore` or formatting
reflows the generated block forever.

Working against the real sheets caught divergences a hand-drawn copy had hidden — the shipped
`.map-tag.next` is `--amber-deep` text, not a filled pill; `.place.ambient`'s hatched paper and
`.place.soft`'s dashed treatment are nothing like what I had drawn.

**This note and the backlog line were both cut down after the fact**, on the owner's prompt.
The backlog entry had grown to 1,009 words against a median of 80, in a file whose own header
says the _why_ lives in `decisions/`; ADR-0121 had four same-day amendment sections, which made
the current design something you had to reconstruct from patches. Consolidated into one
readable ADR (42% shorter, all 99 decisions verified still present) with a revision log for the
reversals.

## Status

Design closed. Build not started, and not **viewable** until the four Google Cloud boxes in
`prerequisites-checklist.md` — everything before that is writable and unit-testable. Two
questions stay open by decision, to be judged on a real rendered map: whether proximity
promotes a ghost pin, and whether a pin tap opens an info window.
