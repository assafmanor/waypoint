# 2026-09-27 — A finished trip plays back, and leaves the app (Phase 1B)

**Decision:** [ADR-0241](../decisions/0241-a-finished-trip-plays-back-and-leaves-the-app.md) · **Mockups:** [`a-finished-trip-plays-back-v1.html`](../../mockups/a-finished-trip-plays-back-v1.html), [`a-finished-trip-leaves-the-app-v1.html`](../../mockups/a-finished-trip-leaves-the-app-v1.html) · **Epic:** [build plan](2026-09-25-a-finished-trip-is-a-memory-build-plan.md) §1B · **Nothing built.**

## The ask

Phase 1B: the map as a journey, replay, the coming-home beat, the trip book, the group-chat card and the anniversary push's copy. Every number comes from `tripRecap` under ADR-0239 §9. A decision that is the owner's is drawn as a recommendation, not handed back as a fork.

## How it was looked at

This was a code read and two rendered mockups; the running app was not started. So the "today" frame of the Map is derived from `Map.tsx`'s `pinCtx`, and the ADR says so. Both files render through the app's real CSS (`inline-app-css.mjs`) and were rendered at 360 and 390 in both themes with `render.mjs`, with no console errors and webfonts loaded.

## What reading the code changed

- **A finished trip's map shows no outcome at all.** Its mode is `plan`, and `planning` withdraws `behind`, so `pinOutcome` is always empty. The spec had assumed ADR-0137 already covered it.
- **`pinOutcome` would read the wrong field anyway.** It reads the stored status, and hard rows are never settled. It must read `recapHappened`.
- **The card's renderer already exists.** `og-cover.template.ts` and `og-image.service.ts` have rendered per-trip covers since 2026-09-06, so the build plan's "new work since ADR-0220's covers are static" was stale.
- **The figures' selection and formatting live in the frontend.** A server-rendered card or book would duplicate them, hence 6A.0.
- **`mode-seen` is written by the provider on mount,** so "came home" gets its own key, written by the Home.
- **The cinematic budget said "exactly one".** It is re-cut to one per end of a trip, rather than the beat quietly spending a second.

## What rendering changed

- **The day button was teal.** `.map-navbtn` is the navigate pill and paints teal. It became `.map-addmaybe`, the `--cta` pill that already takes that slot under an errand.
- **The replay caption did not actually collide.** It was drawn in the area count's pill, and a first screenshot showed it running under the camera band. That screenshot had no webfonts. With the real font it fits with 38px to spare. It moved to the canvas foot anyway, for the measured reason: that row caps a free-text name at 186px.
- **One day per A4 page was mostly empty.** Each page was about 60% blank, so the days flow two to a page (80% full).
- **The card's labels were too small in the chat.** They read 6.7px at chat width and were enlarged to 9.2px.

## The owner's calls, drawn as recommendations

- **The beat's tone:** the opener says `חזרנו הביתה`, then the figures, then it settles into the cover.
- **The push's wording:** the title is the trip's name, and the body is `לפני שנה בדיוק · <the cover's place>`.

Both are in the files as the default. Changing either is a copy edit in `i18n/he.ts` at build time, not a redesign.

## Left to the device pass

- Replay's stop step and day hold.
- The beat card's dwell.
- Whether the empty ring reads over park-green tiles.

## The owner's review (same day)

- **The day's hold in replay defaults to 1000ms,** not 700. The seed plays in 11.2s, 2.14s a day.
- **The sharing thumbnail preview is in every trip phase.** Before and during the trip it shows the chosen audience's own link cover, the one `og-cover.template.ts` already draws. After the trip it is the card. Only then does it carry a send of its own and take the sheet's primary.
