# The board does not know it is moving

**Date:** 2026-09-20
**Branch:** `claude/hero-now-next-logic-kjrtjs`
**Reported:** the owner, two device screenshots one minute apart — _"There's some bug in the way the hero decides what to show for the now and for the next. See for example the way that the day view shows correctly that we're on the way (and the right time for arrival estimate, based on where we actually are), vs. the hero that doesn't. Lets discuss and decide how the hero should behave, then we'll mockup and build."_
**Drawn in:** [`mockups/the-board-says-where-you-are-v1.html`](../../mockups/the-board-says-where-you-are-v1.html)
**Status:** drawn, five forks open with the owner. No ADR yet, nothing built.

## The two screenshots

Iceland, ⁦17:07⁩. The day view draws the leg into `Kolgrafarfjörður Viewpoint` as in progress — `נסיעה · ~3:26 שע׳` over `בדרך · נותרו ~1:12 שע׳`, with the now-line through the block. The board, one tab away at the same minute, reads `פנוי · זמן חופשי · עד 17:18` with `11 · דקות · ליציאה` in the tile.

## Four causes, and only the first is a design question

**1. The board has no journey slot.** `heroTravel` is built in `Home.tsx:1011` — mode, duration, `בדרך`, `נותרו`, the leave-by and the tone — and handed to exactly one consumer, `HeroLift` (`Home.tsx:1764`). `Board` has no `travel` prop. So the collapsed card could not say what the day view said even with every derivation under it correct. That is the mockup.

**2. `gapCharacter` cannot be reached by a fix.** `Home.tsx:1393` passes `onWay` — the `בדרך` **device mark** — and never `stance`, which the same screen computed 600 lines earlier at `:756` and spends only on `positionAnswered`/`leaveAnswered`. So `GAP_CHARACTER.ON_THE_WAY` exists in the closed set and is unreachable by sensor: an `en-route` fix withdraws the leave tile and then falls through to `open`, i.e. to `זמן חופשי`. ADR-0207 §2's asymmetry ("a fix may withdraw a claim, it may not make one") is right, and what it leaves standing here is the loudest false statement on the card rather than a safe silence — which is ADR-0211's own thesis, one state further along.

**3. The board's fix expires after two minutes and nothing re-asks.** `useGeolocation` is per-component React state, one-shot. Home requests once: the effect at `Home.tsx:748` fires only while `geoStatus === 'idle'`, and after a success the status is `granted` forever. `POSITION_FRESH_MS` is ⁦2⁩ minutes. Tabs mount and unmount (`App.tsx:510-519`), so swiping to יום-יום mounts `DayView` with a **fresh** fix while Home has been sitting on a dead one. That is the whole of "the day view knows and the hero doesn't", and it is not about the hero at all — the board is blind from two minutes after you open it, on every surface that reads a position.

ADR-0207 §4 rejected `watchPosition` on battery and wrote that a one-shot "buys accuracy only while the app is open and in front of you, which is when a one-shot already works". The implementation never re-asks, so that sentence describes a behaviour the app does not have. The fix applies the ADR rather than reversing it: re-request on a cadence while a live leg exists and the screen is visible, still one-shot, still not a subscription, and hoist the fix into one shared store so Home, `DayView` and the Map cannot hold three different answers about where you are.

**4. The two surfaces measured different legs.** `עד 17:18` with `11 · דקות · ליציאה` into a ⁦17:30⁩ arrival means `travelSeconds ≈ 7 דק׳` (⁦17:30⁩ − ⁦7⁩ − `TRAVEL_BUFFER_SECONDS`). The day's own leg is ⁦3:26⁩ / ⁦207 ק״מ⁩, off which the board should have read ~⁦3⁩ שעות באיחור and a `due-out` title. No stance disagreement produces the observed card, so the hero routed something else. Candidates, neither confirmed: the hero's destination is `horizon.next.placeId` where the day's is `endpointPlaceId(leg.to, …, 'arriving')`, and the hero's origin is `travelOrigin`'s latest-started stop where the day's is its chain leg (ADR-0232 §4.1 — "a spanning leg's origin is not the row above the hole"). **Owed a repro against the reported day before it is called a cause.**

## What the drawing does not re-open

ADR-0211 §1 option א׳ — the destination becomes the now point and `הבא בתור` moves on to what follows it — was drawn on 2026-08-29 and rejected on cost: ⁦+20px⁩, the countdown tile off the screen, and `אחר כך` pulled into ADR-0160 §12's Day-tab competition. Its own alternatives list says _"if it is ever wanted it needs its own ADR section"_, and this is not that. Every frame keeps the shipped split: the destination is named once, in `הבא בתור`, and the now-slot says where you are.

## The forks put to the owner

| fork | the question                          | candidates                                                          | this file's recommendation                                |
| ---- | ------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| א׳   | what the journey's meta line carries  | `הגעה ~18:19` · `נותרו ~1:12 שע׳` · both                            | both — it fits (⁦147px⁩ of ink in a ⁦290px⁩ box at ⁦360⁩) |
| ב׳   | how a late arrival reads              | tone only · tone + tile · in words · a mark on the next row's clock | tone + tile                                               |
| ג׳   | what the tile counts when not late    | the remaining journey · today's count to the event                  | the remaining journey                                     |
| ד׳   | `arrived` before the stop starts      | nothing (today) · a seventh character · `open` + a located chip     | a seventh character                                       |
| ה׳   | the top badge, which the render found | `עכשיו` · `בדרך` (today)                                            | `עכשיו`                                                   |

Fork ה׳ is a shipped-app question rather than a question about the proposal: the badge prints `gapWords(...).title`, so `on-the-way` says `בדרך` in the badge **and** in the title ⁦85px⁩ apart. Invisible while the title had nothing under it; with a meta line it is the same duplication ADR-0211's build log removed when it refused `לילה` in both slots.

## What the drawing settles on its own

**The proposal costs ⁦0px⁩.** The board measures ⁦292px⁩ in every arm — the shipped one, the on-the-way one late, the on-the-way one on time, and the arrived one — because the meta line lands in `.wp-board-now-meta`, the slot ADR-0211 §5 opened for `open` and never spent here. ⁦17px⁩ of line in a slot that already existed, a ⁦68 × 80.8px⁩ tile on ADR-0208 §1's three-line shape, **zero new controls** (so nothing to measure against ADR-0017's ⁦44px⁩ floor), and **two** declarations of proposed CSS.

**The register holds.** `אתם מאחרים` and `יוצאים` stay refused (ADR-0208 §Z5 M4): a fix knows where a device is, not what the travellers are doing. `הגעה ~18:19` is a claim about the **journey**, hedged, in words the day view already prints (`t.travel.arriveAt`). `49 דקות באיחור` is a claim about the **number**, which is `t.board.lateBy` verbatim.

## Two defects the render caught, both this file's own

- The `--miss` rule was written for `.eta.miss` while the markup moved the class onto a child, so three of fork ב׳'s four arms drew an identical grey line and the fork could not be judged at all. A drawing that cannot show its own difference is worse than no drawing.
- `⁦~1:12 שע׳⁩` put the Hebrew unit **inside** the LTR isolate and printed `נותרו שע׳ ~1:12`. `approxDuration` isolates the number alone and leaves the unit outside it (`lib/duration.ts:117`); the file now does the same. ADR-0118's trap, in the one file that promises to render the real thing.

## Next

Owner decides the five forks. Then: the ADR (an amendment in place to ADR-0211's closed set plus a new section for the board's journey slot), the repro for cause 4, the freshness fix for cause 3, and the build.
