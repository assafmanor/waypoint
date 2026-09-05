# 2026-09-05 — building "a day is a place you can see"

Build session for [ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md), against
[its five-phase plan](2026-09-05-a-day-is-a-place-you-can-see-build-plan.md). All five phases
shipped; the design session, the mockup and the ADR are all the same day, and the brief is
[`2026-09-05-a-day-is-a-place-you-can-see.md`](2026-09-05-a-day-is-a-place-you-can-see.md).

Everything below is either a number the build measured differently from the drawing, or a
decision the drawing could not make. The phases themselves are the plan's and are not restated.

## Four numbers the mockup got wrong, and the one shape of the error

The drawing measured **bands without the content that goes in them**. Every gap was in the same
direction and every one of them was found by rendering rather than by reading:

|                  | drawn | built     | why                                                         |
| ---------------- | ----- | --------- | ----------------------------------------------------------- |
| the head's frame | 78px  | **124px** | the footer band, and the date tile's floor                  |
| the head + shot  | 194px | **240px** | the two above, plus the shot's unchanged 116                |
| the footer band  | ~12px | **46px**  | it never measured `אירוע חדש` (26px) inside its own padding |
| the grid's floor | 64px  | **76px**  | it counted a TWO-line date tile; today's has three          |

The last one is the sharpest, because the mockup's _reasoning_ for 64 was correct — the app's
grid row holds the name alone, since its facts live in the footer band, so its floor is the date
tile's own — and it then counted the wrong tile. Today's tile carries `עכשיו`, a third line, so
64px left **3px** of air above and below on the one day anybody looks at, against 12px on every
other day. The owner caught it on the render (_"the day's date should have a better margin from
the top"_); the fix is a deletion, since the tile's own floor is the reader's 76 and the app's
override was the thing inventing a second number.

**Nothing in the suite could have caught it.** 3px of padding is a value no assertion had a
reason to name, and it appears only on `is-now`, which is one day of twelve. That is the class of
thing a device pass is for, and it is why `e2e/day-head.spec.ts` now prints the head's parts
(`124px = grid 76 + foot 46`) rather than only bounding its total: the next drift arrives as a
number in the log instead of a red bound nobody can attribute.

## The decision the drawing could not make: the photograph bleeds

The mockup drew the head as a card, inset like every row under it. Shown the built version, the
owner asked what it looked like flush to the day strip, then — seeing it — _"when there's a
picture it looks very good. How do you want to gain the best of both worlds?"_

Three treatments were rendered at 360 in both themes, with and without a shot:

- **inset (as drawn)** — right for a city day, and the picture reads as a panel rather than a
  photograph.
- **full bleed + flush** — right for a picture day, and a city day becomes a white slab welded to
  the strip with square top corners and round bottom ones.
- **gutters kept + flush top** — right for a picture day, and a city day is a lopsided card.

What separated them is that the owner's complaint (the gap ABOVE) and the objection to bleeding
(the gutters at the SIDES) are independent, which no single frame showed. The answer is one rule
about the **picture** rather than two treatments of the head: a photograph is edge content and a
panel of text is inset UI, so a day with a shot loses its top gap and top corners and a day
without keeps the card. The side gutters stay in both — bleeding buys 34px of picture width and
costs the head its alignment with every row under it, plus today's amber running off the screen.
[ADR-0219 §3](../decisions/0219-a-day-is-a-place-you-can-see.md) carries the argument.

**The majority case is what made it conditional**, and it is worth naming as a method: most days
have no shot — every day before enrichment lands and every city day after — so the treatment had
to be judged on the day that has nothing, not the day that looks best.

## Three things the ADR said that the code disagreed with

Each was found by building it, and each is amended in place rather than worked around.

- **`עוד בגוגל` is not part of `PlaceKnowledge`.** §6 and ADR-0174's amendment both list it among
  the block's contents; it is `Map.tsx`'s own `.map-refs` row, beside the schedule and delete
  verbs. Both were describing the deciding card as it READS on the Map, where the exit is a
  sibling. The read therefore ships without a Google exit, which leaves a real hole — the summary
  is clamped to three lines with nothing to expand into — and closing it is a decision about the
  component's API, so it is **left open** rather than taken in a build commit.
- **An untimed commitment's clock keeps its bound.** The plan wrote `data-bound="exact"` flat;
  only `ללא שעה` is boxless, because it is not a clock. A floor (`מ-15:00`) takes `not-before` and
  the open-ended box it would wear one row down. Joining a grammar means joining it.
- **The reader's credit DOES change.** Phase 2's goal line said the reader's output does not
  change; §6's own point is that the two credit compositions disagreed about order, so one had to
  lose. The app's wins and the reader's bytes gain the isolate characters. Day titles and photo
  URLs are byte-identical, which is what the acceptance was reaching for.

## What was measured rather than asserted

- **The reader is byte-identical** after phase 3. Not "looks the same": the day card's box is
  332×403 at 360, and the PNG of the whole card is identical before and after in both themes,
  with a photo, a stay and an open body. That was the phase's whole acceptance and it is cheap to
  do properly — render both, `cmp` the files.
- **The Map's place card is untouched** by phase 5's stylesheet extraction — `place-decide`,
  `map-renders` and `map-pin-photo` all green, and `place-knowledge.contract.test.ts` holds the
  split in both directions so a rule cannot drift back.
- **The head and the rows share one inset** (x=16, w=328 at 360), which is the claim the gutters
  argument rests on, in both modes and both themes.

## One e2e regression, and it was a stale box

Five `shelf-drag` cases went red on phase 4. They measured the shelf card, then called
`boxOf('.day-swipe')`, whose `scrollIntoViewIfNeeded` scrolled the body back — measured
`scrollTop` 212 → 120 — and moved the card **144px** from where the touch was then aimed. The
probe is the useful part: the two positions and the two scroll offsets, printed, rather than a
theory about why a drag would not arm.

**Correct until the surface grew** is what a stale box always is, and it is `frontend/CLAUDE.md`'s
"a landing position written as a constant instead of measured" one step removed — the position was
measured, just not last. The repair is ordering: the card is measured immediately before the
touch, every other measurement still before it.

## Reuse, in both directions

- **`isTransportEvent` moved to `@waypoint/shared`.** The projection wrote the rule as a literal
  list of four booking types under a comment saying `BOOKING_TYPE_TO_CATEGORY` already maps
  between the two vocabularies and it should name no third set. The app needed the same question,
  so the one-off was generalised rather than copied.
- **`dayOfMonth` is one function**, so the reader's `13` and the app's `13` are the same two
  characters.
- **`PlaceKnowledge`'s classes stay `map-*`** after the extraction, deliberately. They are what
  the component renders and what the Map's layout selects through; renaming them would be a
  rewrite of every positioning rule for no behaviour at all. What the names describe is where the
  rules were born, not where they belong.

## The follow-up round, same day: six reports

Shipped and looked at. What is worth carrying forward is not the six fixes — those are in
[ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md)'s sections and its follow-up build log —
but the two habits they caught.

**Count the call sites before believing a field.** `event.placeId` is empty on every booking-backed row
(ADR-0048 clears it) and five derivations read it: the day's stops, its region, its kind, its photograph,
the reader's masthead route, and the row badge. It arrived as two unrelated-looking reports and was one
mistake. The root `CLAUDE.md` line about counting call sites before claiming what a derivation does is
the same rule read forwards: one `grep` for `event.placeId` beside `booking` would have found all five at
once, and the phase that introduced two of them did not run it.

**"Nothing measures wrong" is a symptom, not a reassurance.** Three of the six were a rule that was
correct where it was written and absent one surface over — the head's bleed clipped by the peek pane's
own origin, the peek window collapsed to 0px under `overflow: clip`, the place lookup stopping at a
column that is always null. In all three every rect a probe could read was healthy. `frontend/CLAUDE.md`
already carries "reading a rect and calling it visibility" for the first of these; the general form is
that a box with the right numbers and no paint is the hardest kind of defect to see from inside a test.

**And the fixture is part of the assertion.** The projection spec could not see the booking bug because
its lodging row carried a `placeId` and no `bookingId` — a shape the app cannot store. The day-swipe spec
could not see the peek bug because its fixture is deliberately _"a tall-enough day"_. Both suites were
green about surfaces that did not work, and in both cases the fixture, not the assertion, was the reason.

## The second follow-up round: three more, and the same habit again

[ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md)'s second follow-up log has the
decisions. What this session is worth remembering for is that **all three fixes were a question
the codebase already answered correctly somewhere else**, being asked in a weaker form one
surface over:

| the weak question                                    | where the app already answers it                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `chosenIcon(icon)` — "is this glyph a placeholder?"  | `EventForm`'s `storedIcon !== derivedIcon` — "did a person choose it?" |
| `event.place` — "what does this row's column hold?"  | `eventStopPlaceId` — "where is this event?"                            |
| the place label alone — "what is this place called?" | `effectiveTitle` — "what does the trip call it?"                       |

The first round's three were the same shape. That is now nine defects across three rounds with
one cause, and the cheap habit that would have caught each of them is the same: **before writing
a rule, grep for where the app already states it.** Not for reuse's sake — for the weaker copy
you are about to write.

**And one estimate to be honest about.** The reader's rows were deferred in round one partly on
cost — "it widens two signatures rather than changing a line". Traced properly, those were type
annotations over an object that already carried the data: two lines. The other half of the
reason held (it changes what a share publishes, which is a decision), and it was the half worth
stating. Cost estimates made from a function's shape rather than from reading it are worth what
they cost.

## The third round: the surfaces nobody walked to

Two more, and they are a different failure from the six before them. Those were a rule asked in
a weaker **form** one surface over. These two — the bookings Index row's badge, and
`PlaceKnowledge` on the booking's read — are a rule never asked **at all** on a surface that has
always existed, because the five-phase plan named the day surfaces and the event read and the
Index was not on the list. A plan is a list of the surfaces somebody thought of.

The tell, in both cases, was a capability already present and unused: `PlaceBadge` has taken a
`photoUrl` since ADR-0167 §1 and `ListRow` never passed one; `DetailSheet` has taken a
`knowledge` node since ADR-0219 §6 and `BookingDetail` never passed one. **When a primitive
already supports something and one of its hosts does not use it, that is worth a look before it
is called a decision.** Neither of these needed an ADR — §1 and §6 already said it.

**And one test lesson, from the file that reported "no tests".** Adding a `beforeEach` to
`IndexBookingsView.test.tsx` failed the whole file at COLLECTION, because that import was not
there — 26 passing tests vanished behind one red filename, which is exactly the trap
`frontend/CLAUDE.md` records about `virtual:pwa-register`. Read the FILE count beside the test
count; it is the only number that would have shown it.

## Left open

- **The 44px touch floor on `.new-event-btn`** (26px). That is its shipped size and it was 26px in
  `.sec-title` too, so it is a standing debt of that control rather than anything this change
  introduced — `e2e/day-head.spec.ts` asserts the band's 38px floor rather than turning one ADR's
  device question into another ADR's red test.
- **The seam between a picture day and a city day.** The head's top edge now changes as well as
  its height (240 vs 124), so two things move on one swipe. A still cannot answer it.
- **Whether a real photograph is legible at 40px** (ADR-0167 §18), and the `.wp-maybecard-ic` ring
  observation — both inherited from the ADR's own "After phase 5" list.
- ~~**A Google exit in the read**~~ — **closed, and not with a Google exit** (ADR-0219 §6, amended the
  same day). The hole was the clamp, not the absence of Google: `deciding` now opens its extract where it
  stands, and only when the text does not fit.
