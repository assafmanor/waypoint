# The board counts to the leaving — M3 of the routes epic, designed

**Date:** 2026-08-25 · **Milestone:** [M3](2026-08-24-routes-epic-milestone-board.md#m3--design-session--mockups) of the routes & travel-time epic
**Mockups:** [`a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html) (round 1) · [`-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html) (**current**, after the owner's review) · both catalogued in [`design/mockups.md`](../design/mockups.md)
**Decisions this serves:** [ADR-0205](../decisions/0205-routes-are-computed-not-bought-and-a-route-is-a-cache.md) · [ADR-0206](../decisions/0206-a-travel-time-belongs-between-two-points.md) (§M is what this session had to settle; §Z1 is what changed under it)

> Orientation note, not a decision record. Nothing here is authoritative until it lands in
> ADR-0206 (root `CLAUDE.md`, _durable vs. scratch_). §7 below is the amendment text, written
> to be pasted in unchanged.

## 1. What the session was asked to settle

ADR-0206 §M names five things a mockup must decide before any of §V1 is coded. The owner's M0
answers reversed §M1's recommendation — the collapsed board **does** carry an urgent leave-by,
as a **swap** of the countdown it already has (§Z1) — so the open question was no longer
_whether_ but **at what threshold the swap fires**, and how the passed-leave-by state reads as
`--miss` without minting a second live mark.

All five are drawn on one scenario with one set of numbers, so the sections cannot disagree:
lunch ends 15:20, the kabuki theatre (hard, `KZ-4471`) starts 18:00, the walk is ~40 minutes —
§V1.1's own example, a 2:40 hole with 2:00 free after the walk.

## 2. The five answers

| §   | question                               | answer                                                                                                                                        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | where an urgent leave-by lives         | The board's one countdown swaps its **unit**: `55 · דקות` → `10 · ליציאה` → `7 · באיחור`. **Threshold: 30 minutes of time-to-leave.**         |
| M2  | the gap slot's third meaning           | A second **run inside the existing label**, amber-deep, in `.day-gap` — not a second strip, and it ignores `GAP_MIN_MINUTES`.                 |
| M3  | the amber line against ground and pins | Solid, but **not one value**: `--amber-deep` on the day ground, `--amber` on the night one. §D8 holds, measured at 4.2× the amber area.       |
| M4  | the late-risk mark                     | Ink and word only — `--miss-deep` on paper, the board's brightened `#f0a0a0` recipe on the board. Live marks on screen stay at one per board. |
| M5  | the mode control                       | Three **word** chips in the existing `ToggleChip`, on the one leg that is solid on the map. A gate-refused mode goes `.provisional`.          |

## 3. Why the threshold is 30

It is a threshold on **time-to-leave**, not on time-to-event — otherwise the length of the walk
would move it. Three things picked the number, and only the first is an opinion:

- It is the number in the sentence that defines the product (root `CLAUDE.md`: _"what do I need
  in the next 30 minutes"_). A threshold the app already states in prose is not an arbitrary one.
- **Anything ≥ 60 is refused by the box.** `formatCountdown` steps to `H:MM` at an hour, and
  `1:05 · ליציאה` is a contradiction in a tile whose value is minutes. Measured in §1b.
- **10 is too late and 45 too early on a real leg.** At 45 the board spends longer counting to
  the leaving than to the event on a 40-minute walk; at 10 a long leg is already lost.

Rejected, with reasons the mockup's notes panel carries in full: swapping **whenever** a
leave-by exists (the board then stops saying when the thing starts, and puts a §D5 estimate in
the loudest slot all day); and a **relative** threshold such as "when time-to-leave < travel
time" (unit-free, so it behaves backwards at both ends — 3 minutes' notice on a 3-minute walk,
70 minutes' notice on a 70-minute drive).

## 4. What reading the code changed

Four of the five sections got **smaller** on reading, which is the point of reading first.

1. **The swap is not new machinery.** `Home.tsx:452` already swaps that tile: ADR-0184 §6's
   shutting window takes it with `{...formatCountdown(mins), unit: t.board.closesIn}`, because
   the unit slot says what the minutes are left **of**. The leave-by is a third arm on that
   ternary. `לסגירה` also settles the word: `ליציאה` is the same grammar, and the measurement
   says all three candidate words fit the 74px tile anyway (the cliff is `דקות ליציאה`, 79.8px).
2. **The two urgent countdowns can collide** — a shutting check-in window and a live leave-by in
   the same minute — and ADR-0206 does not mention it. One tile, so the **nearer number wins**,
   on §Z1's own argument against showing both. Drawing the rejected two-tile version costs 11px
   of the `הבא בתור` title and breaks it to two lines at 360 (it fits at 390).
3. **`GAP_MIN_MINUTES = 60`** (`lib/gaps.ts:30`): a 45-minute hole renders nothing today, so a
   40-minute walk inside it is invisible. The travel line therefore **ignores the floor** — not
   a new rule, `ConnectionBand` already ignores it for ADR-0159's stated reason.
4. **There is no walk/bike/car icon in `ui/Icon.tsx`.** An icon control would mint three; the
   control is words in `ToggleChip`.
5. **`MAP_CONNECTOR.COLOR` is a per-theme TypeScript constant**, with a comment recording that
   it once sat out a dark-mode remap at 1.01:1. A solid amber polyline is the same shape of
   problem — which §5 below turned out to be, exactly.

## 5. What only the render could say

- **`--amber` solid measures 1.72:1 on the day map ground** (`earth #eee8dc`) — under the 3:1 a
  graphic owes what it crosses. The night ground is fine (7.01:1). `--amber-deep` on the day
  ground measures 4.5:1, and it is amber's paper variant (ADR-0158 §6), so the fix mints no hue:
  a **per-theme pair**, exactly the shape `MAP_CONNECTOR.COLOR` already has.
- **Hue does not separate the line from a pin** — 1.02:1 to 1.28:1 against all five category
  hues in dark. What separates them is the 2px `--card` ring every pin already carries, which is
  a second argument for §D8: a day of solid legs leans on a separation that is not there.
- **`~40` without `ltrIsolate` renders `40~`**, measured as the tilde's x against the digits'.
- **`§` is Bidi-neutral, so `§D8` renders `D8§`** in Hebrew prose. Found in this file's own frame
  label. Every ADR reference inside a Hebrew string has this; both fixes are ADR-0118's.

## 5b. M2 landed while this was drawn, and the two agree

[#694](https://github.com/assafmanor/waypoint/pull/694) shipped §V1.1's, §V1.2's and §V1.7's
arithmetic into `@waypoint/shared` and amended ADR-0206 §V1 in place. Two of its rules are the
derivations behind states drawn here, which is worth knowing before M6a/M6b start:

- **`leaveBy` is allowed to return an instant already in the past** — it is not clamped, because
  that fact is §V1.4's whole mark. That instant is what the `באיחור` tile and the day's risk run
  render; nothing here has to re-derive it.
- **The fit is a discriminant (`fits` / `overruns` / `unknown`), not a boolean**, and an absent
  estimate leaves ADR-0159's line untouched rather than guessing. That is the same §D4 posture
  §5b of the mockup draws for a gate-refused mode: the crow-flies chip, never a failure.

Nothing in the drawing needs changing for it, and §7's amendment text does not touch §V1.

## 6. Open for the owner

1. **The threshold** — 30 minutes, per §3. A device pass is the right place to disagree: the
   file ships the control.
2. **The buffer** in the leave-by (§D5's hedge) is drawn as a control at 0/5/10/15 and is **not
   this session's to pick** — it is a measured number and belongs with M1's.
3. **`ליציאה` vs `לצאת`** — the tile fits both; the recommendation follows `לסגירה`'s grammar.

## 7. The ADR-0206 amendment, ready to paste

**This session could not write it.** M3's declared conflict surface is `mockups/**`,
`docs/design/mockups.md` and `docs/planning/**` (M1 and M2 were running in parallel and
`docs/decisions/` is not M3's to touch), so the amendment its exit criteria call for is recorded
here instead, verbatim, for whoever holds that file next. The board's M3 card says the same.

---

### Z5. What the mockup settled (2026-08-25)

Measured in [`mockups/a-travel-time-between-two-points-v1.html`](../../mockups/a-travel-time-between-two-points-v1.html),
at 390×844 and 360×640, in both themes. Session note:
[2026-08-25](../planning/2026-08-25-the-board-counts-to-the-leaving.md).

- **§M1 — the swap threshold is `LEAVE_BY_SWAP_MINUTES = 30`**, measured on **time-to-leave**,
  not time-to-event. Above 60 the tile is forced into `H:MM` under a unit that means minutes,
  which is a contradiction; below ~20 a long leg is lost before the board says anything. 30 is
  also the number root `CLAUDE.md` already states. The tile's unit becomes `ליציאה`, following
  ADR-0184 §6's `לסגירה` in both grammar and mechanism — this is a **third arm on
  `Home.tsx`'s existing countdown ternary**, not a new element, and all three candidate words
  fit the 74px tile unchanged.
- **§M1 also — the collision this ADR did not name.** A shutting check-in window (ADR-0184 §6)
  and a live leave-by can both be true in one minute. There is one tile, so the **nearer number
  wins**; drawing both costs 11px of the `הבא בתור` title and a second line at 360.
- **§M2 — the journey is an OBJECT in the day, not an annotation on a hole** (owner's review,
  round 1). A block between the two cards: the mode mark in the day's own badge column, the
  duration, the leave-by, **the distance**, and the mode chips on it. **The route's shape is NOT
  in the day list** (round 2, measured): at 46×26 the geometry survives but two of four real legs
  differ by 3.1px in a 46px box, so the thumbnail carries one bit — "this is a path" — at every
  hole of the densest surface in the app. The same pixels carry `formatDistance`, which a reader
  can act on, plus `PlaceBadge`'s existing "show on map" affordance one tap from the shape. The day then reads `place · journey · place`, which is
  §V1.3's own sentence. It **absorbs** the free-time statement rather than sitting beside it, so
  the slot still holds one object (ADR-0159's rule): measured at 58px against 87px for a
  strip-plus-block, with both of `freeAfterTravel`'s numbers still said. It **ignores
  `GAP_MIN_MINUTES`** for ADR-0159's own reason, or a 45-minute hole holding a 40-minute walk
  stays silent. Three **new** `ui/Icon.tsx` glyphs — walking, cycling, driving — are part of the
  proposal; transit reuses `ticket`.
- **§M3 — §D1's "solid + amber" cannot be one value.** `--amber` measures **1.72:1** on the day
  map ground (`earth #eee8dc`), under the 3:1 floor a graphic owes what it crosses, and 7.01:1
  on the night ground. The route line is therefore a **per-theme pair, in TypeScript, switched
  in JS** exactly as `MAP_CONNECTOR.COLOR` is: `--amber-deep` (4.5:1) light, `--amber` dark. No
  new hue — `--amber-deep` is amber's paper variant (ADR-0158 §6).
- **§M3 also — every leg draws its REAL path; §D8 rations the SOLID AMBER, not the truth of the
  line** (owner's review). A straight segment is both a weaker drawing and a wrong number — it
  under-reports distance by construction. All-solid puts **3.7×** the amber on the canvas, so §D8
  stands. And hue cannot separate the line from a pin (1.02–1.28:1 against every category hue in
  dark); what does is the 2px `--card` ring the pin already carries.
- **§M5 also — the mode control appears on the map too**, in the Map tab's `SnapSheet`, as the
  _same_ block the day list renders. One component, two hosts; a switch redraws the polyline from
  cache with no request (§Z2).
- **§M4 — the late-risk mark is ink and word only, and by default it may not say "you are
  late."** A settle mark is a record written when convenient, not a sensor, so from the clock
  alone the only supportable claim is that **the leave-by has passed**:
  `זמן היציאה עבר ב-17:15`, never `אתם באיחור`. **This is the floor, and it is what ships**, because
  the position below can be refused or absent. Same `--miss`,
  same place, a claim we can stand behind (§D5's rule applied to a sentence rather than a number).
  Paint: `--miss-deep` on paper (6.59:1), the board's brightened `#f0a0a0`/`rgba(198,40,40,.18)`
  recipe on the board (8.73:1) — the one `.tlabel.missed` already uses. No fill, no glow, no
  pulse, so §D6 is untouched.
- **§M4 also — own-device position may STRENGTHEN it, and that is a separate ADR.** ADR-0006
  puts own-device location **in v1** (`useGeolocation` ships and feeds the Map's `קרוב עכשיו`);
  only member-to-member sharing is deferred, which is what ADR-0205 §8's "Not member GPS" means.
  With a fix the mark can be **earned** (`עדיין כאן`) or **withdrawn** (already on the route, no
  mark at all) — the second being the real prize, since it deletes a wrong nudge. Three code
  facts bound it: the hook is **one-shot, not `watchPosition`** (a battery decision), the fix is
  **never persisted or sent**, and iOS PWAs have no background position — so this is "the app
  knows when you open it", never "the app watches you". Using it here is a **new capability for
  this surface and wants its own ADR**; §V1.4 builds the floor.
- **§M4 also — the user answers it with a verb the app already ships.** `בדרך`
  (`t.actions.onWay`, on the day row since ADR-0161) is the only thing in the app that knows what
  GPS would, because a person says it; on the leg it clears the mark and turns the block teal
  (ADR-0141's journey grammar). **It writes nothing today** — `verbs.ts:1361` is a toast — and
  this is its first consumer with a reason to be state.
- **§D9/§Z3 amended — transit is DECLARABLE, never estimated.** §D9 refuses a control that
  announces a mode and answers nothing; this one announces up front that it _has_ no answer, and
  its value is silencing a wrong one (Senso-ji → Tokyo Station: 73 min walking against 25 by
  train — on a transit leg the walking number is harmful, not merely imprecise). It takes the
  existing `ticket` icon and `.wp-chip.provisional`'s dashed off-state, and four chips still fit
  one row at 360 (239px of 312px). **The cost, stated here so it is not found in the build:** a
  declared leg carries no duration and therefore no leave-by, so the board's swap does not fire
  for it and the day travel total skips it. It is **not** a fourth member of `travelModeSchema` —
  that schema is what the server is asked for, and no provider can route it; the declaration
  lives on the leg (`legMode = TravelMode | 'transit'`).
- **§M5 — three word chips in `ToggleChip`**, not icons: `ui/Icon.tsx` has no walking, cycling or
  driving glyph and this is not the place to mint three. 29px painted, 51px target via an
  `::after` overlay (the trick `button.day-gap` already uses), one row at 360. It appears on the
  **selected or next leg only** — §D8's rule, generalised from the polyline to the control. A
  mode the gate refuses keeps its chip in `.wp-chip.provisional`'s dashed state and the tap lands
  on §D4's crow-flies chip, which is §Z2's "not this way" rather than a failure.
- **Two bidi defects found by rendering**, both ADR-0118's fix and both reaching the build:
  `~40` renders `40~` without `ltrIsolate`, and `§` is neutral so `§D8` renders `D8§` inside
  Hebrew copy.

---

## 8. Review round 1 — the owner's notes, and what each one changed (2026-08-25)

Recorded here because four of them changed a decision, and one of them was a question this
session had answered wrongly. The redrawing is
[`a-travel-time-between-two-points-v2.html`](../../mockups/a-travel-time-between-two-points-v2.html);
v1 stays as the record for §1, which the review did not touch.

### 8.1 "much more route oriented … a real visual thing" — the day

> _"i think that the display should be much more route oriented … then it really shows as part
> of your day, not like just a text explaining the gap — a real visual thing that shows that at
> this time you should be walking / driving / cycling … we need this crystal clear."_

Right, and v1 measured the wrong thing: how much dashed rule survived a longer label, when the
question was whether the day reads as a sequence of places and journeys. **The journey is now a
block** — the mode mark in the day's own badge column, the duration, the leave-by, the leg's
**real shape drawn small**, and the mode chips on it. `place · journey · place`, which is
ADR-0206 §V1.3's own phrase.

It **absorbs** the free-time statement instead of sitting beside it, so the slot between two
cards still holds one object (ADR-0159's rule, kept rather than spent): 58px against 87px for a
strip-plus-block, and no fact dropped — `freeAfterTravel` (M2) returns both numbers and the
block says both.

**This reverses v1's "no new icons".** Walking, cycling and driving are drawn as **proposed**
`ui/Icon.tsx` additions, on the real 24-grid at the real stroke weight, because "crystal clear"
is worth three glyphs. Transit reuses the existing `ticket`.

### 8.2 "real paths for every two adjacent stops" — the map

> _"you showed only one actual path and two straight lines — i hope that that's not the plan."_

It is not, now. v1's drawing would have become the build. **Every leg draws its own geometry**;
what §D8 rations is the **solid amber**, not the truth of the line — measured at 3.7× the amber
for all-solid against one. The shortcut was also wrong about the number: a straight line
under-reports the drawn legs by 9.9%, and while that magnitude belongs to the drawing, the sign
is a fact — a straight line is never longer than the path.

### 8.3 "How will the app know whether you're on time or late?" — it cannot

> _"if it relied on a GPS location then yeah that's excellent, but if it's simply derived by the
> fact that you didn't mark the current event as settled (done), then it could be very
> misleading and wrong … lots of users aren't going to settle events in real time."_

**Correct, and v1 was wrong.** It rendered `7 · באיחור` — a claim about the person — from a
clock subtraction. The app has no position: **member GPS was refused outright** (ADR-0006,
restated in ADR-0205 §8), and settle marks are a record written when convenient, not a sensor.
Three things follow, and all three are in v2:

1. **The words change to the fact the app actually holds.** `זמן היציאה עבר ב-17:15` is a
   statement about the schedule; `אתם באיחור` is a statement about the reader, and we cannot
   make it. Same `--miss`, same place, a different claim — and the difference is the whole
   difference between a useful reminder and an app that accuses you wrongly.
2. **The user can answer, with a verb the app already has.** `בדרך` (`t.actions.onWay`) has
   been on the day row since ADR-0161, and it is the only thing in the app that knows what GPS
   would know, because a person says it. On the leg it clears the mark and turns the block
   teal — the board's own journey grammar (ADR-0141).
3. **It writes nothing today.** `verbs.ts:1361` is `onWay: (_e) => toast(...)` and no state.
   The travel leg is the first consumer that gives it a reason to be one — a small, real piece
   of work for whichever milestone builds §V1.4.

Nothing here infers departure from a settle mark, which is exactly what the review warned about.

### 8.4 "allow setting the route as תחב״צ but warn that we don't have info — wdyt?"

**Agreed, with a shape: declarable, never estimated.** §D9 refuses a control that announces a
mode and then answers nothing — but this one announces **up front that it has no answer**, and
its entire value is silencing a wrong one. The research measured Senso-ji → Tokyo Station at
**73 minutes walking against 25 by train**: on a transit leg the walking number is not
imprecise, it is harmful, so a way to say "not on foot" is worth more than the silence §D9
protects.

What it costs, and this belongs in the ADR rather than being discovered in the build: a declared
leg carries **no duration and therefore no leave-by**, so the board's countdown swap does not
fire for it and the day's travel total skips it.

What it must **not** be is a fourth member of `travelModeSchema` (M2 shipped it with three).
That schema is what the server is asked for, and a mode no provider can route has no business in
a request. The declaration lives on the leg: `legMode = TravelMode | 'transit'`.

### 8.5 Still open

The threshold (30), the buffer (M1's), and `ליציאה` vs `לצאת` from §6 are unchanged and still
unanswered. Added to them: **the three proposed icons** (§8.1) and **the transit declaration**
(§8.4), both of which want an explicit yes before M6a/M8 build them.

---

## 9. Review round 2 — the shape, and a correction about GPS (2026-08-25)

### 9.1 The route shape in the day list — measured, and the recommendation is **no**

> _"i'm not sure if the day view (and plan day) should show the shape of route … all i know
> is that the map must show it. what do you suggest? is this something that users are gonna
> like?"_

Two numbers, and they say different things — which is why both are in the file:

- **The geometry survives.** Four real legs at 46×26, simplified at a 1px tolerance: 5–7 of
  their 6–7 points remain. The size does not destroy the shape.
- **But two shapes are not tellable apart.** The closest pair of the four differs by
  **3.1px inside a 46px box**, and the render makes it plain — all four read as "a wiggly
  line". The thumbnail therefore carries about one bit ("this is a path"), repeated at every
  hole of the day, on the surface ADR-0206's own Consequences call _"the densest in the app"_.

**Recommendation: the shape lives on the map; the day list spends those 46px on the
distance** (`formatDistance`, already shipped) plus the pin affordance `PlaceBadge` already
uses for "show me this on the map". A distance is a fact a reader can act on — _that's close /
that's far_ — and the shape is then one tap away on the surface built to draw it. **§2 does not
change: the map draws a real path for every leg.**

Whether users would _like_ the thumbnail is not something this file can answer, and it should
not pretend to. What it can say is what the thumbnail _carries_, and the answer is: less than
the same pixels spent on a number.

### 9.2 GPS — **I was wrong, and the app already has it**

> _"are you sure that we can't make it work using gps location and then enable this feature?
> i think that it's really nice to have, then the app could also pop up close by things, no?"_

**Correct on both counts.** §8.3 above, the v2 mockup and PR #696 all said "the app has no
position" and cited ADR-0006. That is a misreading, and it should not have survived a session
whose own rule is to count the call sites before claiming what a derivation does.

**What ADR-0006 actually says.** It separates two things called "location": **own-device
location** — _"IN for v1 and always available (privately, on-device). It powers all the
map/location features"_ — and **member-to-member sharing**, which is the only one deferred.
ADR-0205 §8's "Not member GPS" is true and is about the second. It is not a bar on the first.

**And it is built.** `lib/useGeolocation.ts` ships, and has fed the Map tab's `קרוב עכשיו`
since ADR-0109 §6, behind that ADR's reason-first card.

**What that changes.** The late state becomes three tiers rather than one, drawn in v2 §3d:

| tier                          | what the app may say                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| no permission (or refused)    | `זמן היציאה עבר ב-17:15` + the `בדרך` verb. **Unchanged, and it stays the default.** |
| a fix, still at the last stop | The mark is **earned**: `זמן היציאה עבר · עדיין כאן`.                                |
| a fix, already on the route   | **No mark at all** — `בדרך · נותרו ~12 דק׳`, answered without asking.                |

The third tier is what makes this worth building: it **removes a wrong nudge** rather than
adding a right one.

**Four constraints, read from the code rather than assumed:**

1. `useGeolocation` is **one-shot, not `watchPosition`** — a deliberate battery decision stated
   at the top of the file. So the app knows **when it is opened**, not while it is in a pocket.
2. The fix is **never persisted and never sent to the backend**. So "we left" reaches the group
   only through the `בדרך` verb a person pressed — which is also what keeps ADR-0006's second
   half intact.
3. Permission can be refused or unavailable, so tier 1 is not a fallback, it is the floor.
4. A notification that wakes you at the right minute is still ADR-0197/0198, unbuilt, and no
   amount of geolocation changes that.

**Contrast, measured:** `--teal` is 3.35:1 on `--card` — it clears the 3:1 a graphic owes and
misses the 4.5 a sentence does. So the location semantics ride the **pin glyph** and the words
stay `--muted` (5.57:1). Worth noting as an observation, not as this milestone's work: the app
already spends teal as ink on two-word labels (`.wp-event-act.go`), which sits at that same
3.35:1.

**And the second half of the note — "pop up close by things"** — is real and is already
half-built: the near-me sort exists on the Map, and ADR-0151's `near-the-day` suggestion
strategy is where it meets the day. ADR-0206 §V2 lists isochrones for the same reason.

**Scope, stated rather than taken.** Using a fix to soften or suppress a late mark is a new
capability for a surface that has never had one, and it touches ADR-0006's ambit and ADR-0109
§6's consent grammar. That is **an ADR of its own**, not a line inside the routes epic — the
design is drawn here so the decision has something to look at, but M6a/M6b should build tier 1
and leave tiers 2–3 behind that ADR.

---

## 10. Coverage audit — every surface, every interaction, every state (2026-08-25)

> _"This mockup is incomplete … Please take the time to reflect what we're missing so that it
> doesn't bite us later on."_

Fair, and the gap was structural rather than accidental: ADR-0206 §M named **five things to
settle** and the session settled exactly those five, which is not the same as designing the
feature. What follows is the inventory that should have come first. **Each row is either
decided (with where), owned by a named milestone, or explicitly out — no row is silent.**

### 10.1 Surfaces that render a day, a sequence, or a place-to-place relation

| #   | surface                                                      | must it say something about travel?                                                                                                                   | state                                                           |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Home · **collapsed board**                                   | Yes — the countdown swaps to a leave-by                                                                                                               | **Decided** (v1 §1)                                             |
| 2   | Home · **lifted hero horizon**                               | Yes — the full read between two points                                                                                                                | **Decided** (v1 §1d)                                            |
| 3   | Home · **GlanceCard day rail**                               | **Yes, and it was missed.** The rail draws free time as the emptiness between blocks — the same overstatement §V1.1 corrects, one elevation up        | **NOW DESIGNED** (`where-a-route-shows-up-v1` §1)               |
| 4   | Trip · **DayView rows**                                      | Yes — the journey block                                                                                                                               | **Decided** (v2 §1)                                             |
| 5   | Trip · **DayPeek** (the swiped neighbour)                    | Inherits #4 **by construction** — it renders the real day surface, deliberately (ADR-0200 §7)                                                         | Free, **but see 10.3's fetch-scope row**                        |
| 6   | Plan · **PlanDay rows**                                      | **Yes, and differently.** Plan's slot is a _control_ (`FreeSlot`: `＋ שבץ` chip / drag seam), not a statement, and Plan has no "now" so no leave-by   | **NOW DESIGNED** (§2)                                           |
| 7   | Plan · **SlotFillSheet** ranking                             | **Yes — ADR-0206's own extends line says so:** ADR-0151's `near-the-day` "gains a better metric". `slotStops`+`rankIdeas` rank by **haversine** today | **Named, deferred** — belongs with M9, not M3                   |
| 8   | Map · **canvas polyline**                                    | Yes — a real path per leg, one solid                                                                                                                  | **Decided** (v2 §2)                                             |
| 9   | Map · **SnapSheet leg row**                                  | Yes — the same block as the day                                                                                                                       | **Decided** (v2 §2b)                                            |
| 10  | Map · **stop traversal track** (ADR-0182 §1)                 | It steps stop → stop, which _is_ moving along a leg. It should say the leg's cost                                                                     | **NOW DESIGNED** (§3)                                           |
| 11  | Map · **whole-day directions deep link** (`mapsDayRouteUrl`) | It already exists and hands the whole day to Google. Its relationship to our polyline and to a **per-leg `ניווט`** was undecided                      | **NOW DECIDED** (§3) — they are different promises, both stay   |
| 12  | Plan · **day feasibility** (§V1.7)                           | Yes                                                                                                                                                   | **M9 owns it**; this session states the surface, not the design |
| 13  | Day header / Plan summary · **day travel total** (§V1.9)     | Yes                                                                                                                                                   | **M11 owns it**                                                 |
| 14  | **Notifications** ("leave now")                              | Yes eventually                                                                                                                                        | **Out** — ADR-0206 §V2, blocked on ADR-0197/0198                |
| 15  | Index · bookings, documents, members, settings               | No — none of them is a sequence                                                                                                                       | **Out, stated so it is not re-asked**                           |

### 10.2 Interactions — what each gesture does

| gesture                                  | answer                                                                                                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tap the journey block** (day / Plan)   | Opens the block's own detail — the leg on the map, framed, with the sheet row selected. It is the only tap the block has, and it is why the whole block is one target (56px face measured).                                                    |
| **Tap a mode chip**                      | Instant switch, no request (§Z2). Persists a **per-leg override**; the trip default stays derived.                                                                                                                                             |
| **Tap `בדרך`**                           | Clears the late mark, turns the leg teal. Needs `verbs.ts:1361` to become a write.                                                                                                                                                             |
| **Tap a route line on the map**          | **Nothing, in v1 — and this is a decision, not an omission.** See §3: it would need the app's first `queryRenderedFeatures` hit-test, and a 3px line needs a ±10px tolerance that competes with pins on the surface ADR-0121 §9 says pins win. |
| **Tap the glance rail's travel segment** | Whatever the rail already does — the glance is a read that opens the day. Travel adds no new gesture.                                                                                                                                          |
| **Long press**                           | Unchanged. The canvas long-press is ADR-0157's place-drop; a leg has nothing to drop.                                                                                                                                                          |
| **`ניווט` per leg**                      | **Yes, on the block** — `mapsDirectionsUrl` already exists, and ADR-0205 §8 keeps the hand-off ("we estimate; we do not guide"). It does **not** replace the Map's whole-day `mapsDayRouteUrl`: one is this leg, the other is the day.         |
| **Drag an event across a leg** (Plan)    | The legs either side recompute on drop. A leg that no longer fits is §V1.7's feasibility mark, not a refusal — Plan may build an infeasible day and **say so** (ADR-0206's Consequences: "a builder with an opinion").                         |

### 10.3 States — answered once, for every surface

| state                                | what every surface does                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Routes not fetched yet**           | The block renders with the crow-flies chip and **no duration** — never a spinner per row. `LoadingState`/`Skeleton` exist but a row-level shimmer on every gap would be the loudest thing on the day.                                                                                                                                                                                |
| **Offline**                          | Same as above, plus the offline pack (§V1.8/M10) usually means there IS an answer. Never an error (§D4).                                                                                                                                                                                                                                                                             |
| **Gate refused for this mode**       | `.wp-chip.provisional`, the chip stays, the tap lands on the crow-flies chip (§Z2).                                                                                                                                                                                                                                                                                                  |
| **One or both events have no place** | No block at all — the gap strip stays exactly as today. `locatedStops` already excludes them, so this falls out for free.                                                                                                                                                                                                                                                            |
| **Same place both sides**            | No block. A leg to where you already are is not a journey; drawing "0 דק׳" would be noise on every consecutive pair at one venue.                                                                                                                                                                                                                                                    |
| **Past day**                         | The block renders (it is history worth reading) but carries **no leave-by and no late mark** — ADR-0029's read-only posture, and a leave-by for a day that is over is nonsense.                                                                                                                                                                                                      |
| **Parallel / concurrent events**     | The leg is to the **next stop the board is pointing at**, not to each of them. The board already picks one `next`; travel follows that choice rather than making a second one.                                                                                                                                                                                                       |
| **An untimed event**                 | No leave-by (nothing to be late for); the duration still renders. Same rule the gap derivation already uses.                                                                                                                                                                                                                                                                         |
| **Crosses midnight**                 | Falls out of the instants — nothing special, the block is between two events, not inside a day.                                                                                                                                                                                                                                                                                      |
| **Fetch scope (DayPeek's cost)**     | **A real finding.** The peek mounts _both_ neighbouring days as real surfaces, so a naive "fetch this day's matrix" fires **three days** on every swipe. The batch is per-day and cached forever (§4), so the fix is ordering, not architecture: fetch the visible day, and let the peek render its crow-flies fallback until it becomes the visible day. **M5 must not miss this.** |

### 10.4 What this does to M3's scope

Three of the rows above are new design work that the M3 card did not name (#3 glance, #6 Plan,
#10/#11 map traversal + hand-off). They are drawn in
[`where-a-route-shows-up-v1.html`](../../mockups/where-a-route-shows-up-v1.html) rather than
squeezed into v2, because they answer a different question — _where does a route appear and what
does it do_ — and because v2 is already the file for _what a leg says_.

Two rows are named and **handed on rather than drawn**: #7 (`near-the-day`'s better metric) to
M9, and #12/#13 to M9/M11. Naming them is the point; the previous version of this note left them
unmentioned, which is how they would have arrived as surprises.
