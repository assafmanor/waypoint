# A day is a place you can see — the brainstorm behind the two day surfaces, and what to build first

**Date:** 2026-09-05
**Mockup:** [`mockups/a-day-is-a-place-you-can-see-v1.html`](../../mockups/a-day-is-a-place-you-can-see-v1.html)
**Status:** drawn and measured, **not built** — a brainstorm with recommendations, handed back with
five forks. No ADR is written yet on purpose: the owner asked for options and a recommendation,
and the ADR is what the pick becomes. The backlog carries the line.

## The ask

Owner, with a screenshot of the public reader's day cards on their own Iceland trip:

> I want to enhance my day view and plan day screens so that they look more beautiful, more
> professional and more stylish. They're currently looking pretty good, with schedule, driving
> times etc. But I think that they could still look more inviting. For instance, the live
> sharing screen has images (from the place enrichment). I want you to brainstorm all
> improvements and mockup some ideas along with recommendations. Try to think what fits both
> plan day and day view, and what fits only one.

The screenshot is the reader's day card: a 116px photograph with the place's name and credit on
a scrim, then a 64px date column (`13` / `ראשון`), the day's name (`Stútur crater ← Háifoss`),
where you sleep, and the amber check-in/out lines.

## What reading the code changed

Four facts, and the first one turns the biggest-looking item into a prop.

1. **The day rows already have a photo slot; nobody fills it.** ADR-0167 §1 made the badge the
   thumbnail's frame. `PlaceBadge` takes `photoUrl` and owns the clip, the ring and the
   failed-load fallback; `lib/place-photo.ts`'s `badgePhoto()` applies "a picked icon beats a
   fetched photo"; the trip's enrichments ride the snapshot (`trip-state.tsx`) and the Dexie
   cache (`cache.ts`), so they are there offline. Then `EventCard.tsx:354/426`,
   `PlanDay.tsx:2858`, `TransitionRow.tsx:118` and `StayRow.tsx` all render the badge without
   the prop. `Map.tsx:4406` is the one host that passes it.
2. **The design the owner is pointing at is one-off CSS.** `.sh-shot` and `.sh-day-head` live in
   `screens/shared-itinerary.css` and nowhere else; the app's own day head is `.sec-title`, 12px
   muted text. Rule 8 says generalise the one-off, so the mockup draws the app's head with the
   reader's classes verbatim and proposes `ui/domain/DayHead` as their new home.
3. **One credit line, two shipped treatments.** ADR-0167 §4 renders the credit _under_ the image
   (`PlaceKnowledge`'s `.map-credit`); ADR-0213 §5 renders it _on_ the image under a scrim (the
   reader). Both are live. And the render found a third thing: the same credit paints in two
   visual orders — `placeCredit()` joins two isolated runs inside an RTL paragraph (photographer
   at the start edge, licence at the end) while the reader composes one server-side string that
   displays LTR.
4. **The read has no knowledge.** Tapping a row opens `EventDetail` (ADR-0174 §4); the component
   that shows a place's photo, credit, summary and `עוד בגוגל` — `PlaceKnowledge` — serves the
   Map's place card and Plan's research card only, and its layout is scoped under
   `.map-placecard:has(.map-hero)` in `map.css`.

## The brainstorm — everything considered, with a verdict

| #   | Idea                                                                       | Fits      | Verdict                 | Why                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The photo fills the badge on every day row                                 | both      | **build first** (§1)    | Already designed and built for the Map (ADR-0167 §1); four hosts miss one prop. Measured ⁦0px⁩: card ⁦71→71px⁩, builder row ⁦69→69px⁩.                                                                          |
| 2   | The day head becomes a frame: date column, name, second line               | both      | **recommend** (§2)      | The reader's `.sh-day-head`, moved to `ui/domain/DayHead`. ⁦51px⁩ → ⁦78px⁩.                                                                                                                                     |
| 3   | The day's shot above the frame (ranked stop, ≥0.9, credited)               | both      | **recommend** (§2)      | The reader's `.sh-shot`, same 116px. ⁦194px⁩ total — ⁦30%⁩ of a raw 360×640 viewport, ⁦23%⁩ at 390×844. Stated, not smoothed. Days with no photo get the frame alone.                                           |
| 4   | The day's distance total as the head's second line                         | both      | **recommend** (§2)      | `DayTravelTotal` lifted from `.day-ambient`. Not the stay: ADR-0209 names it once, as bookend rows.                                                                                                             |
| 5   | A passed row's photo desaturates                                           | Trip only | **recommend** (§3)      | One `grayscale` rule beside `.wp-event.passed`. Plan has no phases (ADR-0043 §5). `done` keeps colour — a record is not a fade.                                                                                 |
| 6   | `PlaceKnowledge` inside the event read                                     | both      | **recommend** (§4)      | Same component, the Map's density. Build cost: extract its `.map-placecard`-scoped grid rules. Hero ⁦130px⁩, credit ⁦14px⁩, block ⁦~210px⁩.                                                                     |
| 7   | Photo on the shelf tile (`MaybeCard`)                                      | Plan only | **refuse for now** (§5) | The tile's glyph has no box; a photo needs a new slot, which ADR-0167 §1 refused. Drawn with a 36px box to measure: no height cost, but a ragged shelf on any city day.                                         |
| 8   | A departure board ("now") inside the day view                              | Trip      | refuse                  | The board is rationed — one per screen, and it is Home's. The amber `now` ring is already the list's one loud thing.                                                                                            |
| 9   | Photo as the ground of the whole event card                                | both      | refuse                  | Needs a scrim on every card in both themes and buries the hard/soft grammar (dashed border, hatch). The reader put the photo _above_ the card for the same reason.                                              |
| 10  | Daylight (sunrise/sunset) on the day head                                  | Trip      | not here                | ADR-0218 and `daylight-on-the-day-v1.html` already decided where an unsaid fact goes; that entry warns against exactly this. If §2 ships, the widget gains a natural slot under the head — a separate question. |
| 11  | Category hue ring on the day rows' badges (as the Map has)                 | both      | refuse                  | Day rows never carried a hue (`--paper`); the glyph says the kind. Five hues on an amber-for-time-only list eats rule 4's budget.                                                                               |
| 12  | An indigo day head in Trip mode, like the reader's masthead                | Trip      | refuse                  | The chrome already says the mode; a second dark surface under a dark header is two boards, and in Plan it would break mode identity.                                                                            |
| 13  | A mini-map of the day's stops in the head                                  | both      | refuse                  | Integrations are pipes, not screens (ADR-0004); the Map tab filters to the day and the badge is already the way there (ADR-0121 §8).                                                                            |
| 14  | Photo on a point transition row (check-in, landing) or on the stay bookend | both      | refuse                  | ADR-0210 §1 made the point's badge a 32px circle-dot — a photo there is a smear; the bookend's badge has no tile at all.                                                                                        |
| 15  | A different shot height in Plan mode                                       | Plan      | refuse                  | One number (116) across three surfaces; a second density is the variant rule 8 warns about. The control exists to _see_ 88 and 140, not to pick two.                                                            |

## The five forks for the owner

1. **Build §1 now?** Recommended yes, before anything else: an in-place amendment to ADR-0167 §1
   ("the four day-row hosts join"), no new ADR. It is the one change here that costs nothing and
   changes the feel of both screens.
2. **The day head as a frame, with the shot (§2)?** Recommended yes, at the reader's 116px and
   with the total on the second line. It is the design decision in this file and wants its own
   ADR. Three moves ride with it: `.sh-day-head`/`.sh-shot` → `ui/domain/DayHead`; `dayPhoto`'s
   ranking + gate and the day's name derivation → `packages/shared`, so the reader and the app
   name and picture a day identically; `DayTravelTotal` → the head.
3. **Where the credit goes — on the photo or under it.** Recommended: _on_ the photo in the day
   head (0px, the scrim is theme-invariant, which answers ADR-0167 §4's stated reason) and
   _under_ it in the read (a summary sits under it anyway, and the line costs 14px there). Either
   way, write the distinction into ADR-0167 §4 and compose the credit once in shared — the
   two-visual-orders finding is the argument.
4. **§3 and §4** — small, recommended, no fork beyond "yes".
5. **The `+` in the head's trailing column** — drawn icon-only at the 44px floor, where the
   reader keeps its caret. The alternative is the labelled `אירוע חדש` button staying in a
   `.sec-title` row under the frame, at ~⁦33px⁩ more. The drawing recommends the column.

## What the render found that is not this file's to fix

- `.wp-maybecard-ic` is `display: block` and carries `.wp-placebadge`'s ring `box-shadow`, so on a
  shelf tile whose idea has a place the teal ring should span the tile's width. `place-badge.css`
  describes that slot as "inline content, ~21×17px"; the sheet says otherwise. One of them is
  wrong — worth a look on a device.
- The photographs are synthetic (no egress to Commons from this sandbox), so ADR-0167 §18's device
  question — is a real photograph legible at 40px — is still open, and §1 is the cheapest way to
  finally answer it.

## Rounds 2 and 3, the same day — the forks are closed

The owner's answer to the five forks was _"figure everything out, then write up ADRs and a detailed phased plan … another agent is going to take it"_, plus two things the first round had not drawn: _"the ambient stuff (car rentals, hotel stays etc.) … I don't really like how ambient events look anyway"_, and, off the renders, _"a plus sign on the day header - what is it?"_, _"some of the text doesn't fit inside the header"_, _"several different fonts and sizes, which looks weird … maybe even lose a little information if it's too much"_.

Everything above is therefore **superseded by [ADR-0219](../decisions/0219-a-day-is-a-place-you-can-see.md)** where the two disagree, and the build is the [five-phase plan](2026-09-05-a-day-is-a-place-you-can-see-build-plan.md). What the three render rounds decided, each against a measurement in the mockup:

| drawn                                                           | measured                                                                    | decided                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| icon-only `+` in the head's trailing cell                       | owner: _"what is it?"_                                                      | never an unlabelled control on the head                                                     |
| the labelled `.new-event-btn` in the trailing cell              | the day's name clipped to `…ur crater ← Háifoss` at 360                     | a head's width belongs to its title                                                         |
| the facts as `.sh-day-copy > span` lines                        | Plan's verdict 247px and the past-day note 269px in a 238px column, clipped | facts are a full-width block under the grid, allowed to wrap                                |
| facts block, then a button row                                  | +39px, read as a fourth band                                                | facts and the button share one footer band (facts start, button end, bottom-aligned)        |
| a car hire's middle day as a head line (`Hertz · יום 3 מתוך 6`) | one more line on every day of a hire                                        | dropped — the information the owner said we can lose (ADR-0163 §3 amended)                  |
| five type sizes, two faces, mono digits, an emoji               | _"several different fonts and sizes"_                                       | two text sizes (15/700 name, 12.5/400 facts), one display face on the numeral, nothing else |
| the ambient strip re-tinted                                     | three kinds of thing in one box                                             | deleted: fact → head line, commitment → `.transition-row` at the top, span → nowhere        |

Final numbers at 360×640, light: the head with a shot ⁦228px⁩ (⁦36%⁩ of the raw viewport), without one ⁦112px⁩, an empty day ⁦112px⁩; the commitment row ⁦62px⁩ where the teal card was ⁦52px⁩; the badge photo ⁦0px⁩.
