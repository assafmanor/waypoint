# A mountain is crow-close — 2026-08-28

Second session of the day on the same surface, correcting the rule the first one shipped. The
decision is [ADR-0206 §AV](../decisions/0206-a-travel-time-belongs-between-two-points.md); this note
is what happened.

## The report

> _"I noticed that after your change (?), sometimes the map defaults to walking. I think that
> walking should be defaulted to only when it makes sense, definitely not a four hour walk, max 10
> minutes probably (or an urban trip but that's probably a whole epic so don't worry about it)."_

The screenshot is the Iceland trip, day 7 of 10, **with a car hire on it**. The day's first leg —
Hafaldan hostel in Seyðisfjörður to Baugur Bjólfs — reads `הליכה · ~4:18 שע׳ · ⁦12 ק״מ⁩`, and the
app has counted a departure back to **⁦03:06⁩**.

## The diagnosis, and why the number was not the problem

§AU2 shipped that morning: over `WALK_DEFAULT_MAX_M` (⁦2.5 km⁩) a leg drives, under it a leg walks.
The obvious read is "the threshold is too high, lower it". That read is wrong, and the geography is
what says so.

**Baugur Bjólfs is the mountain standing directly above the town.** ⁦1.4 km⁩ as the crow flies;
⁦12 km⁩ of switchbacks on foot. The rule asked `haversineMeters`, got ⁦1.4 km⁩, and was _correct by
its own definition_ while being absurd. Retuning it does not help: to be safe against a mountain the
crow threshold would have to sit near ⁦200 m⁩, which drives every walk anyone actually takes.

**Distance was a proxy, and the owner's sentence names the real quantity.** _"Definitely not a four
hour walk, max 10 minutes"_ is about **time** — which is what the reader is deciding about, and
which the router already answers, in the same matrix the app fetches for every mode anyway.

## What was built

`defaultLegTravelMode` takes three inputs, ranked: the **walking duration** where the router has
answered (⁦10 minutes⁩), the **crow** where it has not (⁦700 m⁩ — the same ten minutes at the measured
pace, rounded down), and the trip's own derivation where there is nothing to measure at all.

The floor **errs low deliberately**, and the asymmetry is the argument: a wrong `driving` guess is
one tap and says nothing false meanwhile; a wrong `walking` guess is this report. And where the
crow/path ratio is unusual — the only place the floor does any work — it is unusual in the
direction that makes the crow understate the walk.

## Two things the work found that the report did not name

**The canvas would have disagreed with the list.** The Map builds its own `legModes`, so on the crow
floor alone it would have asked for Bjólfur's _pedestrian_ geometry while the day list, holding the
⁦4:18⁩ estimate, correctly drew a drive. That is §AM8's divergence with a new cause, found by
counting the call sites for the second time in two days. `Map.tsx` now reads `useDayTravel` too —
same hook, same key, same Dexie table `useDayShapes` beside it already reads, so a day the list has
fetched costs no network here.

**The default had to become lazy.** Since it now reads an estimate, computing it for a leg somebody
has already declared is work whose answer is discarded — and on a declared תחב״צ leg it is
_observable_: §AM5 guarantees nothing about that leg reaches the provider, and the board's spec
asserts the estimate is never looked up at all. That spec failed, which is how this was found rather
than shipped. `legTravelMode`'s `fallback` now accepts a thunk.

## The suite inverted rather than broke

Thirteen specs failed, and the two worth recording are the fix landing:

- The board's §AQ2 pair encoded the **original** report — _"the leg is declared a drive and the
  board keeps printing the walk"_ — over a ⁦76⁩-minute walk against a ⁦23⁩-minute drive. The app now
  derives that drive on its own, so the derived case asserts the drive and the meaningful override
  became the walk.
- `DayView`'s _"declared driving, the surface reads the drive"_ would have **passed with no override
  at all**, since its ⁦40⁩-minute fixture now derives to driving. A declaration is only testable
  against a mode the derivation would not have picked, so it declares cycling now. That is the
  quiet failure mode worth naming: a spec that still passes while asserting nothing.

The day surfaces' durations are load-bearing for their gap arithmetic and were left alone; what
moved is the mode word, through a named `derivedMode()` helper so the next retune is one line rather
than six expectations.

## Left open

**Urban trips**, which the owner named and set aside, and they were right to. In a dense city the
honest default past a ten-minute walk is neither walking nor driving — and until §V2's transit
routing exists there is nothing truthful to default _to_, since a declared תחב״צ leg has no duration
by design (§AA4). The one thing not to do is approximate it by widening the walking default, which
is the defect this session closed. On the backlog, pointed at the transit epic.

**⁦10 minutes⁩ is a feel call**, and the owner's own _"probably"_ is why it is a named constant. It
rides the same device pass as `TRAVEL_BUFFER_SECONDS` and `ARRIVAL_RADIUS_MAX_M`.
