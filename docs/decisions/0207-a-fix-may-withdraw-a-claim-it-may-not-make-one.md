# 0207 — A position may **withdraw** a claim the clock made. It may not make one of its own.

**Status:** Accepted 2026-08-26. **Built:** M6c of the routes epic.
**Date:** 2026-08-26
**Reported:** the owner, from the shipped board, twice — _"the app doesn't recognize that I'm no longer at
the last stop and close to the next one so it shows me being late… the distance and time should be
relative to your actual GPS location or else it should be more clear that this doesn't take your real
location into account, and maybe not show you as late."_

**Extends** [0206](0206-a-travel-time-belongs-between-two-points.md) §V1.4 / §Z5 §M4 — which named this
exact fix, drew it in [`mockups/a-travel-time-between-two-points-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html) §3d, and said it _"wants its own ADR"_. This is that ADR.
**Applies** [0006](0006-no-live-location-v1.md) (own-device location is **in** v1; sharing with the group is
the only thing refused), [0109](0109-map-tab-phase-1.md) §6 (permission on intent, never blocking a read).
**Applies unchanged** [0205](0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) §4 (the route
cache is keyed on rounded PLACE coordinates — nothing here puts a live position into it) and §8 (not
member GPS).

## Context

M6b shipped §V1.2 and §Z1. On its first real day it told the owner the leave-by had passed while they
stood ⁦200m⁩ from the door of the next stop — and the Map tab, one tab over, was **drawing their blue
dot** next to that stop's pin at the same moment.

Nothing in M6b was wrong on its own terms. §AE3 says the leg is measured between two **scheduled
stops**, so the number describes the plan; the leave-by was correctly derived from a walk the traveller
had in fact already made. **The defect is not the arithmetic, it is the silence:** the app had a
position, was already using it fifty pixels away, and did not let the one surface that was making a
claim about the traveller consult it.

**And the previous answer to this was a manual verb.** §Z5 §M4 gave the mark an answer — `בדרך`, which
M6b made state — so the traveller could tell the app what it should have been able to see. That is the
right floor and it stays. It is not the ceiling.

## Decision

### 1. A fix decides what we may CLAIM. It is never an input to an estimate.

This is the whole thesis and everything below follows from it. A position is used as a **discriminant
over the claims the clock licenses**, never as a coordinate we route from.

Two reasons, and the second is the load-bearing one:

- **ADR-0205 §4 keys the route cache on rounded coordinates of PLACES.** A live position is a new key
  on every fix, so routing from it would miss the cache forever and cost a request per fix — for a
  number that is stale the moment the traveller takes another step.
- **We do not need a new number to stop being wrong.** The report is not "your estimate is imprecise",
  it is "you are calling me late when you can see I am not". That is fixed by **withdrawing** a claim,
  which needs no estimate at all. Withdrawal is cheap, honest and complete; re-estimation is expensive,
  approximate and still wrong a step later.

**So: no route request is ever issued from a device position.** If that rule is ever broken, §4's cache
and §D8's request budget both go with it.

### 2. Four stances, and `unknown` is the one that already ships

`travelStance` answers one of four things about the leg between two scheduled stops:

| stance      | what the fix says                | what the surface may then claim                            |
| ----------- | -------------------------------- | ---------------------------------------------------------- |
| `unknown`   | no usable fix                    | **exactly what M6b ships today**, unchanged                |
| `at-origin` | you are at the leg's first stop  | the late mark is **earned** — `עדיין כאן` beside it        |
| `en-route`  | you are along the leg            | the leave-by is answered; the mark is **withdrawn**        |
| `arrived`   | you are at the leg's second stop | there is no journey left to report, so nothing is reported |

**`unknown` is first because it is the common case and the default**, not the error: no permission, a
refusal, no API, a stale fix, or a leg too short to measure. ADR-0109 §6's rule — a read is never
blocked on a permission — means the whole feature has to be an _improvement_ on a surface that is
already complete without it. It is.

**`at-origin` is the only arm that makes the app louder**, and it is the one that earns the right to.
Until now a passed leave-by was a claim about a clock (§Z5 §M4: `זמן היציאה עבר`, never `אתם באיחור`).
With a fix at the origin the app can say more, because it now knows the thing it was carefully not
assuming. `עדיין כאן` is that, and it is drawn in v2 §3d.

### 3. Home reads a fix only when consent ALREADY exists, and never prompts

`useGeolocation`'s `request()` is explicit — nothing fires on mount — and its `permission` field exists,
in its own words, so a surface can ask "with **no dialog of any kind** when consent already exists".
Home uses exactly that: it requests a fix **only** when `permission === 'granted'`, so no prompt ever
appears on the app's front door.

**This is ADR-0109 §6 applied rather than bent.** Permission is asked on _intent_, and opening Home is
not an intent to be located — it is the front door. Anyone who has used the Map tab has already
granted, so the fix arrives free for them; anyone who has not sees today's behaviour and is never
asked. **A prompt on Home would need its own reason-first card and its own decision**, and this ADR
declines to take it: the payoff here does not justify meeting a permission dialog where you did not
ask a location question.

### 4. A stale fix is worse than no fix, so it expires

`useGeolocation` is **one-shot by design** (a battery decision, written at the top of the file), and it
holds its fix in React state for the life of the screen. So the honest statement of the capability is
_"the app knows where you were when you last opened it"_, never _"the app knows where you are"_.

That asymmetry is dangerous in exactly one direction. A twenty-minute-old fix at the origin would
report `at-origin` — and **earn** a late mark — for a traveller who left fifteen minutes ago. Getting
that wrong is worse than saying nothing, because it converts a hedge into an assertion.

**So a fix carries its own timestamp and expires into `unknown`** after `POSITION_FRESH_MS`. The hook
grows `fixedAt` and `accuracyMeters` to make this expressible; both come straight off the browser's
`GeolocationPosition` and neither existed because "near me now" is answered the instant it is asked.

### 5. The arrival radius is **relative to the leg AND floored by accuracy** — the owner's instinct, plus the physics

The owner proposed a distance tolerance _"relative to the total distance"_. That is right, and it is
half of the number:

- **Relative**, because a fixed radius is nonsense at both ends: ⁦500m⁩ from the far end of a ⁦40km⁩ drive
  is not "arrived", and ⁦500m⁩ on a ⁦300m⁩ walk is the whole leg.
- **Floored by the fix's own accuracy**, because a radius smaller than the error bar is measuring
  noise. Urban GPS is routinely ±⁦20–50m⁩, so a radius under that would flicker between stances while
  the traveller stood still.

So the radius is the **most generous** of the three, narrowed only by an absolute ceiling:
`min(max(accuracy, FLOOR, ARRIVAL_FRACTION × legMeters), ARRIVAL_RADIUS_MAX_M)`.

**The first build wrote that as a minimum and it was wrong**, which is worth keeping on the page
because the mistake reads as correct: taking the smaller of the accuracy and the leg's fraction lets
the fraction cap the radius **below the error bar** — a ±⁦300m⁩ fix resolving a ⁦180m⁩ circle, which is
exactly the noise this section exists to refuse. Two specs hold the direction now.

**And a radius that reaches the leg's midpoint cannot tell the two ends apart**, so the stance is
`unknown` however precise the arithmetic looks. That is the real rule the absolute ceiling was standing
in for, and it is what stops a sloppy fix on a short leg from confidently answering "arrived" about a
traveller who has not moved.

**`en-route` needs one radius of real progress, not the midpoint.** The obvious test — _closer to the
destination than to the origin_ — is twice as strict as it reads: it only fires past halfway, so a
traveller a third of the way along a walk still reads `unknown` and keeps a mark they have plainly
answered. Closing at least one radius of the gap is the honest bar. **And where neither end answers,
the stance is `unknown` rather than the nearer guess** — a fix ⁦400m⁩ the wrong way is further from the
destination than the origin is, so it falls through. Saying so is the same refusal §M4 makes about the
clock, applied to place.

### 6. `en-route` reports what is LEFT, and says it is an approximation

The stale total is the second half of the report: `הליכה · ~44 דק׳ · בדרך` reads as _"44 minutes still
to walk"_ when the traveller is two minutes out. Once you are moving, the leg's total is not the
question.

v2 §3d drew `בדרך · נותרו ~12`, so the remaining time is part of the design. It is derived by scaling
the estimate by the **remaining crow fraction** — not by a new route call (§1). That is an
approximation of an approximation, and it is admissible for exactly two reasons: §D5's `~` already
says the number is hedged, and the alternative (the untouched total) is not more honest but **less**,
because it is confidently wrong rather than approximately right.

**It refuses when the ratio is noise.** Below a leg length where the crow fraction means anything, the
`en-route` line carries the mark and no number at all. A missing number is §D4's absence; a fabricated
one is not.

## Consequences

- **The app now behaves differently depending on a permission**, which it has avoided on read surfaces
  until now. §2's ordering is the mitigation: `unknown` is the shipped behaviour, so the surface is
  complete without consent and better with it.
- **A `--miss` mark can now be _earned_, which makes it heavier.** That is intended — `עדיין כאן` is
  the app saying it checked. It also means a wrong fix produces a more confident wrong claim than
  before, which is what §4's expiry and §5's floor exist to bound.
- **The group still learns nothing from a sensor.** ADR-0006 §8 is untouched: the position is never
  persisted and never sent, so what the group sees still comes only from a person pressing `בדרך`.
  That verb is now also **reversible** (§7 below), which it was not.
- **`near-the-day` is now one step from its "better metric"** (ADR-0151, ADR-0206's extends line). The
  fix Home reads is the same one that would rank ideas by real proximity. Not built here.

### 7. Also fixed here, because it is the same surface and the same report

`בדרך` wrote a mark with **no way back** — `markOnWay` only ever set, and the verb toasted without an
undo callback while `done`, `skip` and `restore` all pass one. ADR-0019 makes the toast's undo button
_the_ way undo surfaces, so a state-writing verb without one is out of family with every neighbour.
`clearOnWay` exists now, the toast offers it, and the `en-route` line carries a persistent way back
(`ביטול סימון`, the word `SettleControl` already uses) because a toast is transient and a mark is not.

## Alternatives considered

- **Route from the live position** so the remaining time is real. Rejected by §1: it breaks ADR-0205
  §4's cache key, costs a request per fix, and buys a number that is stale a step later.
- **`watchPosition`, so the app knows continuously.** Rejected — it is the battery decision
  `useGeolocation` was written around, and an iOS PWA has no background position anyway, so it would
  buy accuracy only while the app is open and in front of you, which is when a one-shot already works.
- **Prompt for permission on Home.** Rejected by §3: opening the front door is not asking a location
  question. It needs its own reason-first card and its own decision.
- **Stop showing the late mark at all** (the owner's third suggestion, offered tentatively). Rejected:
  a passed leave-by is §V1.4's most actionable read, and the copy already claims only the clock. The
  problem was never that the app said it — it was that the app could have known better and didn't.
- **A flat grace period before the mark appears.** Rejected as a fix for _this_: without a position
  there is nothing to be tolerant of, so a grace only delays a wrong claim and delays the right one
  too. The proportional instinct belongs on §D5's buffer instead, which is still an unsettled
  placeholder — recorded on the backlog, not spent here.
