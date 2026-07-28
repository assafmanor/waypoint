# Session 148 (2026-07-28) — the badge is the way to the pin, and a placeless row says so

Built Phase 5 of the map epic ("every place-bearing surface reaches the map") and its
decided-but-unbuilt sibling ("a booking with NO place"), in one change.

**Decision record:** [ADR-0121](../decisions/0121-embedded-map-phase-6-design.md)'s
2026-07-28 amendment (§8). **Mockup:**
[`mockups/map-reach-v1.html`](../../mockups/map-reach-v1.html), rendering the app's real
stylesheets. This note is the session's log, not the decision — read the ADR for that.

## The audit reached the wrong answer first, and that is the useful part

The brief called this an audit, not a mechanism: `useShowPlaceOnMap()` was built and
correct with two call sites. So the session audited the rest and concluded that a row
whose own tap reaches a surface already carrying `מפה` needs no second way in — the
Index's booking rows and `TransitionRow` both open `BookingDetail`, which has had the
pair since Phase 6. It cited §8's own retirement of "View on Google Maps" ("with our
own map on screen a second Google destination competes with the thing it was standing
in for") and ADRs 0078/0079/0094/0095, which exist to undo parallel copies. On that
reading three of the four surfaces the backlog named were **not** gaps, and the first
build shipped `מפה` on PlanDay alone.

**The owner overruled it, and was right twice over.** First on principle: two taps
through a sheet that then closes and switches tabs is a path, not an affordance —
every event and booking should have an _easy_ way to its pin, in both modes. Second on
a fact the audit had missed, which is the more instructive half:

> `EventCard`'s labelled `מפה` lives inside `.wp-event-actions`, which is
> `max-height: 0` until the card is expanded.

So an unexpanded day event offered **no way to the map at all** — and the settle
variant (a passed, unmarked soft event) returns _before_ the action row exists, so it
had none in **any** state. The affordance was in the code and absent from the screen.
The audit had read the call sites and never asked whether the control it found was
reachable. **Reading a prop is not seeing a surface** — that is the lesson, and it is
the same family as ADR-0121's own session-134 entry about declaring imperative glue
untestable.

## Then the placement was wrong too, and the mockup caught it

The obvious answer — a distinct control in each row's trailing slot — was built, and
then measured in the mockup against the real stylesheets:

|                                          | 390px                       | 360px           |
| ---------------------------------------- | --------------------------- | --------------- |
| `Ichiran Ramen` on the day card          | 1 line → **2**              | —               |
| a long Hebrew builder title (`.bld-ttl`) | 1 → 2 lines                 | 2 → **5 lines** |
| `Shinjuku Granbell`, transition row      | truncated **184px → 126px** | —               |

Two things worth keeping from that: `.bld-ttl` has **no ellipsis**, so it wraps
without limit rather than truncating; and the transition row did not _break_, it
**silently cut a third of the name**, which is worse than a visible wrap because
nothing on screen says it happened.

The answer that costs no width is the row's **category badge**, and it is the right
object rather than merely the free one — ADR-0121 §6 and ADR-0109 §3 already make the
pin and the badge one thing in two form factors, sharing the `--cat-*` tokens by
construction. It wears a teal ring and a corner **pin** (a bare dot says "something is
here"; the pin says what the tap does). One component, five hosts, zero layout cost.

## Two more things the owner redirected mid-session

- **Home's board: wired, then backed out.** Applying the rule literally put the
  affordance on the hero's now/next slots, and it read too loud on the app's one dark,
  glowing surface. Backed out, and deferred to the hero's own redesign — see
  [Hero 2.0](2026-07-28-hero-2-0-design-brief.md), which is the shape it actually
  wants there.
- **`＋ הוספת מקום` should eventually open the Map tab's search overlay and return.**
  Adding a place is a spatial act and deserves the map. That overlay is Phase 10 and
  unbuilt, so the shared picker ships as the honest interim; recorded on the backlog
  under Phase 10 rather than invented twice.

## What the mockup found that this change did NOT fix

A Latin address beginning with a numeral reorders in the RTL flow:
`2-14-5 Kabukicho, Shinjuku, Tokyo` renders as `Kabukicho, Shinjuku, Tokyo 2-14-5`.
`.bk-fact-v` carries no `dir`, so this is the ADR-0118 family and it hits **every**
address in every `bk-fact`, not only the rows this session touched. Left alone on
purpose — folding an unrelated bidi fix into this diff would hide it — and put on the
backlog. It was seen because the mockup renders the real CSS, which is the whole
argument for that mockup convention.

## Reuse taken, per rule 8

- `DayView`'s private `showOnMapHandler` → `eventShowOnMap`/`bookingShowOnMap` in
  `lib/places.ts`, beside the resolvers they already call, so a call site is one
  expression and **cannot forget either** reason to have no button (no mappable place;
  no Map tab to route to).
- The Map row's one-off `.map-addbtn` → the shared `AddLocationButton`, the moment a
  second surface needed it. It also had to borrow the in-form picker's empty label:
  its own was `מיקום`, which is what the location fact calls itself, so a placeless
  row read `מיקום · לא הוגדר מיקום · ＋ מיקום`.
- `ListRow` gains one `onShowOnMap` prop, so the next managed list is a one-line
  addition rather than a fifth copy.
- `Field` gains a `hint` slot — the error slot's quiet peer. Six one-off hint classes
  exist elsewhere (`bs-route-hint`, `set-hint-block`, `map-res-hint`, …) and were
  **not** migrated: that is a sweep of its own, not a side effect of this one.

## Still unspent

The note under an empty location field carries all five losses in one sentence, which
is three lines at 390px. It reads acceptably in the mockup but has not been seen on a
device; if it reads as a wall, shorten it rather than splitting it across lines — a
field is a field, not a place for an explanation.
