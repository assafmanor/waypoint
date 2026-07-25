# 0115 — Plan-mode place research: one search control, a paid half armed by intent

**Status:** Accepted (design + build, Phase 5 of the Maps & Places epic)
**Date:** 2026-07-25
**Implements** [0106](0106-maps-and-places-epic-scope-and-phasing.md) Phase 5 ("search Google Places from within the Map tab → pin results → '＋ maybe' onto the shelf; closes the vision's pillar-4 discovery by location and free time") and the design [0109](0109-map-tab-design.md) deliberately deferred to this build session ("Scope of this design session, and what is deliberately deferred": Phase 5 "reuses the picker's shared search core (§12) and the existing result-card grammar (`plan-mode-v1.html`), so it is low-risk and best mocked **against the real picker** when built").
**Refines:** [0109](0109-map-tab-design.md) §2 (the Map's one search control: what "in Plan mode the search icon opens Google place research" means now that the cost model is concrete), [0110](0110-maps-and-places-frontend-architecture.md) §1 (the pre-shaped "second thin shell over the same `usePlaceSearch`", now built), [0111](0111-places-field-mask-tier-and-rating-deferral.md) (why a research card shows no ★), [0112](0112-place-in-trip-is-referenced-not-cached.md) (the reference derivation the dedup chips read), [0038](0038-icons-and-canonical-category.md)/[0109](0109-map-tab-design.md) §11 (an idea is created uncategorised; category is captured when it's scheduled)

Mockup: [`mockups/map-research-v1.html`](../../mockups/map-research-v1.html) — the research overlay in Plan-mode chrome across six states (idle / loading / results / added / rate-limited / offline), plus the design notes on what a result card may say.

## Context

Phases 0–4 of the epic are done: the picker and its proxy (Phase 1), places on the existing surfaces (Phase 2), the Map tab's list + filters (Phase 3), navigate-to-next and near-me (Phase 4). Phase 5 is the Plan-mode half of the tab's mode re-emphasis: **research** — find a place that isn't in the trip yet, and put it on the maybe shelf.

Two facts frame the design, and neither existed when ADR-0109 was written:

1. **This is the first feature in the app that spends money per user keystroke.** Everything shipped so far on this tab is pure client-side derivation over the snapshot (ADR-0106 Decision 4) — free, offline-safe, unmetered. Research calls Google. The controls that already exist for this are the FE-minted session token, the pause-gated debounce, and the snapshot-derived dedup in `lib/usePlaceSearch.ts` (ADR-0110 §1), plus the proxy's `PlacesThrottlerGuard` per member·trip (ADR-0108 §5) and the Phase-0 budget alert + daily quota cap (ADR-0108 §6). This ADR adds no new cost mechanism; it decides **where the first paid call comes from**.
2. **The card can't say what the old sketch drew.** `plan-mode-v1.html`'s research card (the "existing result-card grammar" ADR-0109 pointed at) shows a category glyph, `4.5★`, and `1.2 ק״מ`. All three are fiction against the shipped pipe — see §2. That sketch predates ADR-0108/0111 by months; mocking "against the real picker" (ADR-0109's instruction) is what surfaced it.

There is no rendered map until Phase 6, so "pin the result" has to mean something in a list-first world. It does: §3.

## Decision

### 1. One search control, two halves — and the paid half is armed by intent

ADR-0109 §2 said: "In **Plan mode** the search icon opens Google place research (Phase 5); in **Trip mode** it filters the existing list. One control, two presentations." The control stays one. What changes is that Plan mode does not _replace_ the free half with the paid one — it **adds** the paid half behind an explicit act:

- The search overlay opens on the **free half in both modes**: it filters the trip's own places, exactly as it ships today (pure derivation, offline-safe, unchanged — no redesign, the same rows the list renders).
- In **Plan mode** the results area also offers **`חיפוש בגוגל`** — one card stating what it is and that it costs us money. Tapping it arms the Google half for the typed query.
- **Once armed, typing behaves exactly like the in-form picker** — min-chars floor, pause-gated debounce, one session token — until the overlay closes. The arm is per-overlay-session, not per-query: editing a query inside an armed session keeps searching, because that is what the session token bills for.

**Why the arm, when ADR-0109 read as "just open research":** filtering your own list and buying an Autocomplete session must not be the same gesture. Without the arm, every "where's the hotel row" in Plan mode fires paid calls at every pause, and the user has no way to tell which of their two intents they just expressed. With it, the first paid call is a deliberate act and every subsequent keystroke in that session is the cheap part. This is the same posture the tab already takes with the device: **the geolocation permission is asked on intent, never on tab open** (ADR-0109 §6). Money is at least as worth an explicit ask as a permission dialog.

It also means the free half never regresses in Plan mode, which the literal reading of §2 would have cost us.

### 2. A result card says only what the relay actually returns

The card is: a **neutral pin badge**, the prediction's **primary name**, its **secondary address**, and one trailing **`＋ אולי`**. Tapping the row opens the place in Google Maps (a free deep-link by `place_id`) so a place can be vetted before we spend on it — the row-tap-to-view / one-labelled-action grammar of ADR-0109 §1, unchanged.

Three things `plan-mode-v1.html` drew are **dropped, not deferred-and-forgotten**:

- **`★ 4.5`** — `rating`/`userRatingCount` are Enterprise-tier Place Details fields we deliberately do not fetch (ADR-0111), and an Autocomplete prediction never carries them at any tier. The `★` slot exists on the Map list row and lights up for free the day ADR-0111's mask changes; it cannot be lit here.
- **`1.2 ק״מ`** — a prediction carries **no coordinates** (they arrive with the pick, from Place Details). There is nothing to measure against the device fix. Showing a distance would require paying to resolve every result just to render the list — the exact opposite of dedup-before-spend.
- **The category glyph** — place `types` are not in our field mask, and adding them is a pricing question with no payoff here (§3: the idea is uncategorised by design). So the badge is the neutral dashed pin, which is already the app's "listed, not yet ours" reading (the coordless Place-lite badge, ADR-0109 §3).

The design principle, stated so the next surface inherits it: **a card renders the fields we actually hold; a mockup drawn before the cost model is not a spec for what to fetch.**

### 3. `＋ אולי` **is** the pin: one pick, then an uncategorised idea

With no rendered map, "pinning a result" is the write, and it is two steps behind one tap:

1. **Pick** through the shared core (`usePlaceSearch.pick`) → the canonical `Place`, enriched once with coordinates · address · IANA timezone and cached on the row (ADR-0048/0108 §3). Dedup-before-spend applies: a `googlePlaceId` already resolved in this trip costs **zero** Google spend, server-side; a locally-referenced match short-circuits before the request even leaves.
2. **Shelve** it — an unconsumed `MaybeItem` referencing that `placeId`.

The second step is what makes the place _real_ on the tab: "in the trip" is a reference derivation (ADR-0112), so the moment the idea exists the place appears in the Map list with its `על המדף` tag, and on the Plan shelf ready to be scheduled into a day. That is the whole of "pin the result" in the list-first world, and it survives Phase 6 unchanged — the rendered map draws the same referenced places.

Three specifics:

- **The idea is created uncategorised**, matching the shelf quick-add rule already settled (ADR-0109 §11 follow-up: a pills row on a one-line jot is awkward, and category isn't a must for an idea; it's captured when the idea is scheduled into an event). Google wouldn't give us a category cheaply anyway (§2), so the two reasons agree. The pin therefore takes the neutral `leisure` hue via `CATEGORY_PIN_HUE`'s uncategorised fallback — no new colour rule.
- **Feedback is the existing toast with its undo** (`verbs.addMaybe` already toasts + registers `lastAction`). Undo removes the idea; the `Place` row stays as the dedup cache — precisely ADR-0112's cache-only state, so re-adding is free.
- **Adding N places from one result list is N picks, hence N Place Details calls** (a session terminates on its pick). That is honest arithmetic, not a leak: the per-member·trip limit is 30 picks/min (ADR-0108 §5), a re-pick is free, and no design that yields coordinates can do better than one Details call per new place.

### 4. A result already in the trip is stated, not re-addable

The dedup chip ADR-0109 §12 designed for the picker earns a second job here. Reading the same free derivations (`referencedPlaceIds` / the place-usage index the tab already builds), a result whose `googlePlaceId` is already in the trip shows a **statement instead of the button**:

- **`על המדף`** — an unconsumed idea already points at this place. There is nothing to add.
- **`כבר בטיול`** — something else references it (a scheduled event, a booking). Adding a shelf idea for a place you have already committed to is almost always a mis-tap.

Both cost nothing (snapshot derivation, offline-consistent) and both prevent a duplicate idea. A place that is merely **cached** (picked once, never referenced — ADR-0112) is _not_ in the trip: it shows the button, and its pick dedups server-side at zero Google spend.

### 5. Offline the Google half is absent; a rate limit is soft

- **Offline: the arm is gone, not disabled** — the same rule the near-me chip already follows (ADR-0109 §7, session-105): when there is nothing we can offer, we don't offer it. A one-line banner says the trip's own places are still searchable, and adding an idea by name keeps working where it always did (the Plan day view's quick-add). The picker's name-only Place-lite fallback is deliberately **not** duplicated here — a research surface whose point is coordinates has nothing to gain from a coordless row, and the shelf already has a by-name path.
- **A 429 is a banner, not an error** (`rateLimited` off the hook, ADR-0108 §5 / ADR-0110 §1). The free half is untouched by it.
- **A failed search** (upstream fault) says so and leaves everything else usable.

### 6. Plan mode only

Trip mode keeps the search control as a pure filter. Discovery on the ground ("what's open near me right now") is a **different query shape** (nearby / open-now, biased by the device fix) on a **different SKU** than the Autocomplete relay we have, and it would put a paid call on the one surface people use while walking around. If we want it, it earns its own ADR and its own cost line. This matches the tab's existing mode split (navigate-to-next and near-me are Trip-only; research is Plan-only).

### 7. No second search path (reuse audit)

Everything Google goes through the shipped core. Verified against the tree, not recalled:

- **`lib/usePlaceSearch.ts` is unchanged.** Arming is expressed by _not feeding it a query_ until armed (it is inert below the min-chars floor), so the session token, debounce, dedup, soft 429 and abort-on-supersede all behave identically in both shells. No second hook, no second client, no changes to `lib/api.ts`.
- **The overlay is the shipped `ui/primitives/SearchOverlay`** already used by the Map and the Index — the research surface is content inside it, not a new overlay (and therefore inherits the back-stack/focus contract, ADR-0090/0103).
- **The row is the shipped `.place` grammar** (`screens/map.css`), with one new trailing action (`.map-addmaybe`) and one statement chip. It is _not_ a second row component: the Map row takes a `Place` + `PlaceUsage`, a research row takes a Google prediction, so they share presentation, not props. Group headers are the existing `.map-grouphead` (near-me / `כבר היינו` already use it).
- **Feedback states are `ui/feedback`** (`StatusBanner`, `EmptyState`), never bespoke divs (ADR-0078).
- **The one shared-state change is `verbs.addMaybe`, which gains a `placeId`.** It already accepted `icon`/`category`, and `applyAddMaybe` already had a sibling (`applyPark`) sending `placeId` on the same `CREATE_MAYBE_ITEM` op — so this closes a gap rather than adding a path. Its growing tail of optionals collapses into one `options` object at the same time (three positional optionals is where that stops being readable). No schema change: `MaybeItem.placeId` and `createMaybeItemSchema.placeId` already exist.
- **`mapsPlaceUrl`'s query-building is generalised, not copied**, so a prediction (no coordinates, a `googlePlaceId` and a name) can produce the same free Google Maps place link the list rows use.

## What a research session actually bills

Recorded so the cost claim is checkable rather than asserted (SKU names/prices per ADR-0108 §6 / ADR-0111; the arithmetic, not the price list, is what this ADR owns):

| The user does                           | Google calls               | Cost                                                        |
| --------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Opens search, types, filters own places | none                       | **0** — pure derivation, works offline                      |
| Arms Google, types a query with pauses  | 1 Autocomplete per pause   | free **if** the session ends in a pick; else per-request    |
| Adds one result to the shelf            | 1 Place Details (Pro mask) | one pick, and the searches before it fold into the session  |
| Adds a second result from the same list | 1 more Place Details       | a session ends at its pick; N new places = N picks          |
| Adds a place the trip already resolved  | none                       | **0** — dedup-before-spend at the DB (ADR-0108 §3)          |
| Undoes an add, then re-adds it          | none                       | **0** — the cached `Place` row survives the undo (ADR-0112) |

The ceiling per member·trip is the throttler's (120 searches/min, 30 picks/min), under the account-level daily quota caps set in Phase 0.

## Consequences

- **The Map tab is now fully mode-re-emphasized as ADR-0106 Decision 1 promised**: Trip mode answers "what now / what's near me", Plan mode answers "what else should we consider". The Plan-mode hint copy (`t.modeHint.map.plan = 'מחקר מקומות'`) stops being a promise about an unbuilt surface.
- **Vision pillar 4 ("discovery by location and free time") has its first real half** — discovery by search feeding the shelf. Discovery by _free time_ (offering the gap a place could fill) is untouched and unclaimed.
- **The epic's cost posture is intact and now load-bearing in the UI, not just the backend.** The one new paid entry point is behind an explicit act, and the surface states the deal.
- **`plan-mode-v1.html`'s research panel is superseded** on the three fields it invented (§2); the mockup catalog records that. Its `＋ אולי` action, its shelf, and its overall shape stand.
- **Phase 6 inherits this unchanged**: research writes referenced places, which is exactly what the rendered map draws. The only Phase-6 addition would be showing a result as a temporary pin before it is added — a map-surface question, not a research one.
- **One deferred idea, recorded not built:** an armed session currently searches Google on every pause. If we ever see the bill argue otherwise, the next lever is an explicit submit inside the armed session (a button per query rather than per session) — cheaper still, worse to use. Not adopted now: the debounce plus the session-token model already collapses a typed word into one or two billable calls.

## Alternatives considered

- **Let the Plan-mode search icon open a Google-first research surface (ADR-0109 §2's literal reading).** Rejected: it deletes the free, offline-safe filter in the mode that needs it most (a planner has the longest list), and it makes the first paid call a side effect of tapping a magnifier. The arm keeps both halves and costs one tap.
- **A separate "מחקר" entry point on the tab (a second chip or a Plan-only button).** Rejected: ADR-0109 §2 explicitly makes this one control, and a second search affordance beside a search icon is the "two day-number rows on one screen" mistake (ADR-0109's own rejected alternative) in a different costume.
- **Auto-search Google whenever the local filter finds nothing.** Tempting (it reads as helpful) and rejected outright: it makes spend a consequence of _absence_, so a typo in a place you own becomes a paid call, and the user never expressed the research intent at all.
- **Resolve every visible prediction so cards can show rating + distance** (the `plan-mode-v1.html` card as drawn). Rejected: it is the most expensive possible reading of the epic — a Details call per rendered row, at Enterprise tier for the ★ (ADR-0111) — to decorate a list the user hasn't committed to. Dedup-before-spend exists to prevent exactly this.
- **Add a category picker to the research add (so the pin gets a real hue immediately).** Rejected: it contradicts the settled shelf quick-add rule (an idea is a jot; category is captured when it's scheduled — ADR-0109 §11 follow-up), and it would ask the user to classify a place they haven't decided to visit.
- **Add results as `Place`s only ("pin without shelving"), leaving the shelf out of it.** Rejected: a picked-but-unreferenced place is cache-only by ADR-0112 — it would be invisible everywhere, so the user would have paid for nothing they can see. The shelf reference _is_ the pin.
- **Offer the picker's name-only Place-lite fallback here too, so research works offline.** Rejected: research exists to obtain coordinates; a coordless research row is the shelf quick-add with extra steps, and that path already exists on the Plan day view.
- **Ship research in Trip mode as well** ("find a pharmacy now"). Rejected for now (§6): different query shape, different SKU, and the one surface where a stray paid call is least welcome. Revisit with its own ADR.
