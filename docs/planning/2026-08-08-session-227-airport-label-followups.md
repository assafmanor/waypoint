# Session 227 — what the first real trip found about the airport labels

**Date:** 2026-08-08
**Follow-up build**, on the owner's own bookings after [session 226](2026-08-08-session-226-workstream-e-airport-labels.md) shipped (PR #528, merged). Durable record: [ADR-0166 §19](../decisions/0166-place-enrichment-is-a-multi-source-pipe.md). This note keeps the measurement and the reasoning that would otherwise be lost.

## 1. What the screenshot showed

Four flight legs. Two read as cities (`תל אביב-יפו`, `וינה`), one as `קפלאוויק`, and one as `פרנקפורט (Frankfurter Flughafen – FRA)` wrapped over three lines. Three separate questions, three different answers.

## 2. Frankfurt: the search found it, the scoring threw it away

**Measured** (against the repo's own `nameSimilarity`, with coordinates identical — the best possible case):

| Candidate label                    | similarity | after the 0.8 floor |
| ---------------------------------- | ---------: | ------------------: |
| `נמל התעופה של פרנקפורט`           |  **0.756** |               **0** |
| `נמל התעופה הבינלאומי של פרנקפורט` |      0.676 |                   0 |
| `נמל התעופה פרנקפורט`              |      0.655 |                   0 |
| `Frankfurter Flughafen`            |      0.535 |                   0 |
| `Frankfurt Airport`                |      0.000 |                   0 |
| — `נמל התעופה בן גוריון`, clean    |  **1.000** |              passes |

The stored name carries an appended alias — `(Frankfurter Flughafen – FRA)` — whose three tokens the real label cannot match, so a correct candidate scores 0.756 against a floor of 0.8. Worse, the **pre-filter** scores it 0.605 against a threshold of 0.6: it squeaks through, we pay for the entity read, and _then_ refuse.

The coordinate route is not a safety net here and never was: `GEOSEARCH_RADIUS_M` is 500m, and session 225 measured a terminal pin sitting 1.1–1.4km from an airport's own `P625`. **Airports are the one category that route structurally cannot reach.**

Fixed by scoring the de-parenthesised form as well and keeping the best — §15's fix applied to a second cause. Three properties made it safe to put in `nameSimilarity` itself rather than at a call site:

- it can only ever **raise** a score, since the raw pair is still one of the forms compared;
- dropping a parenthetical makes our name **shorter and more specific**, so it cannot invent a similarity that was not there;
- the **distance veto is untouched**, so a perfectly-named place 9,000km away is still refused — pinned by its own test, because that is the property the whole change rests on.

§16's calibrated numbers (0.816 / 0.707 / 0.577) are asserted unchanged in the same spec. If a future change moves them, that test is the alarm.

## 3. `תל אביב-יפו`: we were reading the official name

Wikidata's **label** is the official form. `Frankfurt am Main`, `Tel Aviv-Yafo`, `København`. What a person says is usually an **alias**, and there is no "common name" property to ask for instead.

The rule adopted: **the longest alias that is a proper prefix of the label, ending at a word boundary.** Each clause earns its place —

- **prefix** limits it to dropping a trailing qualifier. An abbreviation (`ת״א`), a former name, a translation (`Copenhagen` for `København`) are all legitimate aliases and none of them is "the same name, shorter";
- **longest** stops a one-word alias winning: shortest-first would answer `תל`;
- **word boundary** stops a prefix landing mid-word (`Frank` in `Frankfurter`).

Falls back to the label, so a city with no alias behaves exactly as before. Costs one extra field (`aliases`) on a read the pass already makes.

## 4. Keflavík: deliberately not fixed

The owner asked why it does not say Reykjavík. It does not, because **`P931` is right by its own definition** — the airport serves the town it sits beside, and Wikidata's editors have marked that value preferred (session 225 measured exactly this preferred rank). The disagreement is between "place served by transport hub" and "the city I am flying to", and no amount of property-picking closes it: `P131` gave Schwechat for Vienna, which is the same failure from the other direction.

So this one is `Place.nickname`'s job, and the honest framing is in the ADR: of the three airports in the owner's own trip, one needed §19's alias rule and one needs a nickname. **The automation earns its place by making the common case right, not by being right everywhere** — and the manual override is what makes that an acceptable bargain rather than a defect.

Resisting a fourth heuristic here is the deliberate part. A "nearest large city" or "capital of the country" rule would have answered Reykjavík and then quietly answered something absurd for an airport that genuinely serves its own town.

## 5. The booking detail now reads as cities

Owner's call, and it narrowly revises ADR-0059 §3's "the detail keeps the full names". That rule was written when the only alternative was the stripping heuristic; a resolved city is not a guess, and the full name is still one row below in the location fact. The fallback here is the **full** name and never the stripped one — shortening is a concession rows make for width, and this surface has none to make.

## 6. Still owed

- **Unchanged from session 226:** the `airport` / `international_airport` overlap is still unmeasured, and the empty-answer retry in `PlacesService.searchPlacesText` is still there waiting to be deleted.
- **A device pass**, now more clearly owed than before: the detail heading, the `TLV ← FRA` fact and the day rows have all changed shape in two sessions and none has been seen on glass.
- **Backfill is rate-limited to 3 places per snapshot read** (ADR-0166 §14), so a trip's existing places pick the new values up over several opens rather than at once. Nothing to run; worth knowing before anyone reports it as a bug.
