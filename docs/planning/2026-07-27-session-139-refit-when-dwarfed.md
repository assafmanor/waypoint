# Session 139 — being on screen is not being framed

**Date:** 2026-07-27
**Branch:** `claude/map-refit-when-dwarfed`
**Build session, ADR amendment at its head.** One report, one root cause, one guard.

## The report

> After the map zoomed out — for example from a day that has very distant places —
> then changing the filter to a smaller zone, the map doesn't automatically zoom in.
> Changing category, adding/filtering maybes, changing the day…

All four triggers, one cause.

## The cause

`cameraTargetFor` (`lib/map-camera.ts`), third line of its body:

```ts
if (view && boundsContain(view, bounds)) return { kind: 'none' };
```

ADR-0121 §7's re-fit guard, as a bare containment test. Its intent was sound — "if the
results are all on screen, moving is gratuitous", which removes the "tap `אוכל`, the map
lurches across the city" lurch. But **containment conflates _visible_ with _framed_**,
and that asymmetry only ever prevents tightening:

- The set grew past the view → not contained → re-fit. ✅
- The set shrank inside the view → contained → **nothing.** ❌

So once the camera is out for any reason, every subsequent narrowing is contained by
that wide view, nothing is ever owed, and no control can pull the frame back in. You sit
on a country-wide view with three pins in one corner.

It also swallowed the single-pin case, because the containment test ran **before** the
coincident-points branch: filtering all the way down to one place didn't re-centre
either. Same defect, one pin narrower.

### This was already written down, in a narrower form

`useMapCamera.ts`'s own header names it:

> `§7's containment guard then makes it permanent: a zoomed-out view contains every
pin, so "the set already fits, don't move" is true forever.`

Session 134 hit this as one of two compounding hazards behind "the map opens on the
whole world and stays there", and fixed it **where it showed** — the opening framing
passes no view, so containment can't apply to it — on the reasoning that "only later
framings are containment-guarded, which is what that guard was always for". That
assumed any later view is already reasonable. It isn't, and this report is the general
case that assumption left behind.

A shipped test said so too, and called it correct: `map-camera.test.ts` asserted
`cameraTargetFor(day, world) === none` with the comment "This is correct for a RE-frame
… and catastrophic for the FIRST one." Only the second half was true.

## The fix

The guard is now **two** tests: contained **and** filling enough of the view to count as
framed.

```ts
if (view && boundsContain(view, bounds) && boundsFillView(view, bounds)) {
  return { kind: 'none' };
}
```

`boundsFillView` compares each axis's span against the view's and passes when **either**
clears `MAP_REFIT_FILL_SHARE` (0.4).

**`||` across the axes, not `&&`.** Dwarfed means small in _both_ directions. A row of
stops down one street fills the width and almost none of the height — that is framed,
and re-fitting it would be exactly the lurch the guard exists to prevent.

**Two properties worth stating, because both fall out of the arithmetic rather than
needing their own rule:**

- A **zero-area extent fills nothing**, so narrowing to a single pin can never read as
  "already framed" — the single-pin case is fixed by the same line, not a special case.
- **The tighter you have zoomed in by hand, the less likely a re-fit**, because a small
  view makes every ratio larger. §7's "a manual zoom wins until the next scope change"
  therefore survives, and survives most strongly exactly where someone has deliberately
  gone in close.

And it removes session 134's second hazard **at the root**. The opening framing still
passes no view — correct, there is no view worth preserving before the first frame — but
it is no longer the only thing standing between a bad first fit and a camera stuck at it
forever.

## The number needs a phone

`MAP_REFIT_FILL_SHARE = 0.4` lives in `constants.ts` beside `MAP_ZOOM`, deliberately:
"too small to read" is a legibility judgement of exactly the same kind as the zoom
ladder, and **Phase 3's device pass should tune the cluster together**. 0.4 is a
defensible starting point (both axes under 40% ⇒ the set occupies at most ~16% of the
area before the camera acts), not a measured one.

**One knock-on to expect on that pass:** filtering to a single pin now actually zooms to
`MAP_ZOOM.SINGLE_PIN` = 15, which the owner has already reported as too close (#15). The
fix makes that pre-existing complaint _more_ visible, because the path that used to do
nothing now reaches it. That is the right direction — it should zoom — and the value is
Phase 3's to set.

## Tests

Pure arithmetic in `map-camera.test.ts`, the applied half against the fake map in
`useMapCamera.test.tsx`. The rendered canvas remains a human pass (ADR-0121 §13).

| Where                   | What                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `map-camera.test.ts`    | A set the view **contains but dwarfs** re-fits                                         |
| `map-camera.test.ts`    | Narrowing to a single pin re-centres                                                   |
| `map-camera.test.ts`    | A set filling one axis is framed, not dwarfed — no lurch for a street of stops         |
| `map-camera.test.ts`    | The tighter the view, the less likely a re-fit                                         |
| `map-camera.test.ts`    | A wide view is no longer a trap (rewritten from the test that asserted it was correct) |
| `useMapCamera.test.tsx` | A control change re-fits when the new set is dwarfed — the reported path, end to end   |
| `useMapCamera.test.tsx` | Narrowing to one pin re-centres at `SINGLE_PIN` instead of sitting out                 |

**The "don't lurch across the city" test passed unchanged**, which is the check that
matters most here: the fix had to remove the wrong half of the guard without removing
the right half. One shipped test was rewritten — the one that asserted the bug was
correct behaviour — rather than deleted, so the record shows what changed and why.

**One of my own new tests was wrong before it landed**, and the code was right: I asserted
that a 0.03° view around 0.01° of pins should be left alone, but that is only 33% filled,
so it correctly re-fits. Fixture tightened to 0.02°. Worth recording as a small
calibration of what the threshold actually feels like in degrees.

## Not verified

The share, on a phone. And the three visual changes from earlier today remain unseen —
the row's number stamp, the un-faded ambient pin, and the `עכשיו` pulse. Phase 2 needs a
device anyway; this now adds a fourth thing to look at, and a reason to look at the zoom
ladder while there.
