# Session 166 — four reports from the errand (2026-07-28)

The owner used ADR-0134's errand on a device and reported four things. One is a bug, two
are prominence, one is a decision that was already written down as owed. Nothing here
reverses a decision; the fixes and their reasoning live in the ADRs, amended in place —
[ADR-0134](../decisions/0134-the-map-is-where-a-forms-place-comes-from.md)'s second build-log
addendum and [ADR-0132](../decisions/0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md)
§8. This note records what was found while fixing them, not what was decided.

## The bug, and why the last session's log was wrong about it

> _"Moving from event/booking to maps and back again created multiple forms or something so
> that the form got duplicated over and over, so saving the event had the form below so it
> never cleared, and the event was duplicated many times."_

Session 165's build log claimed the payload was reported **once**. It was — by the channel.
`take()` clears the handoff synchronously off a latest-ref, and `lib/handoff.test.ts` covers
exactly that, including two takes in one tick. **The test suite was right and the claim was
wrong**, because the property the claim was about lived one layer further out than the
thing being tested.

The hook returned the payload, so it was state. Every host then wrote:

```tsx
const returned = useReturnedPlaceErrand<Draft>('event');
useEffect(() => {
  if (!returned?.draft) return;
  setFormTarget(events.find((e) => e.id === returned.target.id) ?? 'new');
  setFormDraft({ ...returned.draft, [returned.target.field]: returned.placeId });
}, [returned, events]); // ← `events` is not optional here; the lookup needs it
```

`events` changes on every write. So the loop is: return → form opens → save → `events`
changes → same `returned` → form opens again → save → another event. It compounds because
the second form renders under the first, which is precisely what the owner described.

Four of five hosts had it. `PlanHome` did not, and only because it is a **seed** host with
no entity to look up, so its effect had one dependency instead of two. That is the kind of
near-miss worth naming: the bug was in the hook's SHAPE, and one host escaped by accident.

The fix is a callback with the applier in a latest-ref, so the effect depends on the channel
and nothing else. It is also unfakeable at the call sites now — a host cannot add a
dependency to an effect it does not write.

**The regression test is the one that would have failed:** the callback is an inline arrow
at every real call site, so it is a fresh function every render. A test that re-renders twice
and asserts one application covers both the old defect and the obvious wrong fix (depending
on `apply`).

## Two prominence reports, one shared answer

Both are "the wrong thing is the loudest thing", and in both cases the machinery to fix it
already existed:

- **Trip pins under an errand** → the **dot tier**'s rules with a second trigger
  (`.map-screen[data-choosing]`), not a seventh rung on the ladder. Two details that are not
  obvious from the CSS: the amber cues had to be withdrawn explicitly, and `animation: none`
  is load-bearing because an animation beats a normal declaration whatever the specificity —
  without it `nowstop` keeps pulsing amber through the override.
- **The selected result** → it fills instead of outlining, on the row's badge and the canvas
  ring together, and gains a z-index above the pins. The z-order was the invisible half of
  the report: a selected ring could sit **behind** a trip teardrop, so on a dense canvas the
  thing you had just tapped could be the one thing you could not see.

## What the map extreme cost, now that it is back

Almost nothing, which is the point of §8 having been written down: the condition it named
(a ring tap raising the card) was three lines of screen state plus exporting `ResultRow`,
because `.map-placecard` and the row grammar were both already there and already had two
occupants. The one thing the design had not named is that **each selection must clear the
other** — a ring and a pin could both be selected, and at that stop that is two cards
stacked on one canvas.

`ResultRow` needed the same treatment `PlaceRow` already had for its card host: the body is
a `<button>` in the list and plain content on the card, since framing the place you are
already looking at does nothing.

## Still open

Unchanged by this session, and both already on the backlog: **ADR-0134 §9** (the Map's own
`＋ מיקום` is `PlacePickerSheet`'s last caller, needing a fourth errand target — a coordless
`Place` enriched in place, which is a row rather than an entity field), and the **coordless
match** at the map extreme, which §8 named as a real gap and reopening the stop did not
close.
