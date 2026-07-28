# Session 155 — walking scenarios against today's decisions

**Date:** 2026-07-28
**Kind:** correction + audit. Two rounds of owner feedback on the dot tier, then a deliberate scenario walk that found two more defects and two open questions.
**Output:** [ADR-0128](../decisions/0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 amended (twice today), [ADR-0129](../decisions/0129-map-camera-moves-like-a-camera.md) §4 added, one backlog item.

## The dot tier took two corrections, and the second one matters more

**Round one (session 154):** the amber time anchors shouldn't demote. Right, and §1 was already reasoning toward it while the CSS did the opposite.

**Round two (this session):** _"you open the app in the morning looking at the map — you want to see exactly what's expected today and what's the order of events, without the pins we simply don't know unless zooming and finding out."_

That is decisive, and it lands on something §6 said itself: the number **is** the order cue, and "the number is free". A tier that drops it trades away the canvas's one contribution over the list, in exactly the view where that contribution is the point. **A travel day is the sharpest form** — Tokyo→Kyoto fits well below the threshold, so the day whose order you most need to read is the day that lost it.

### The mistake I nearly shipped in between

My first fix keyed the exemption on **having a number** — elegant, reused a distinction ADR-0121 §6 already drew, and satisfied the owner's words. The owner pushed back before it landed, and they were right for a reason I had not checked: today's **ambient stay night** and today's **ideas** carry no number _by design_, so they would still have dotted. The hotel you are sleeping at on a travel day is very much "expected today".

I had also told the owner "the distinction you're asking me to protect is one the code already draws" — true, and not the same as the distinction being the _right_ one. Worth remembering as a failure mode: finding that the codebase already expresses something is evidence it is cheap to build on, not evidence it is correct.

### What it is now: two rules, because there are two situations

- **Day scope — only ghosts degrade.** A ghost is by definition not this day. A day holds three to six stops; there is no density problem worth paying for.
- **All-days — everything degrades except the time anchors.** Nothing is numbered without a scoped day, so no order is lost, and this is the multi-city density §6 invented the tier for.

One selector was attempted twice and kept leaving something behind. Two situations, two rules, stated as such.

## Then the scenario walk, which is the part worth repeating

The owner asked whether other scenarios changed other decisions. Walking them deliberately found two defects that no test would have caught, both from **ADR-0129 §3's ease interacting with decisions older than it**:

1. **The step-in ladder read an interpolated zoom.** ADR-0127 §2 justified statelessness as "there is no second copy of the truth". An eased move makes that false for 480ms — a second locate tap inside the window steps from wherever the animation is. Fixed: read where the ease is _going_ when one is in flight.

2. **The ease fought the user's finger.** ADR-0121 §7's "a manual pan or zoom wins" held only because nothing else moved the camera. A per-frame `moveCamera` overwrites a pan or pinch mid-gesture. Fixed: compare the camera against the last frame the loop wrote and stand down on a mismatch — one check that catches pinch too, which has no clean event of its own.

Both are the same shape, and it generalises: **introducing an animation turns every read of "where is the camera now" into a question about time.** Anything else that starts reading the live camera inherits that.

## Two things left open rather than guessed

- **A dot is ~14–22px, under ADR-0017's 44×44 floor**, and pins are tappable. The two candidate fixes contradict each other's precedent: a transparent hit area is what ADR-0126 §3 explicitly refused for `באזור`, and raising `DOT_SCALE` weakens the density mitigation. A map pin may genuinely be the case where an oversized invisible target is the convention — unlike a pill whose box reads as its affordance — but that line should be drawn with the thing on screen. Backlogged with the device pass.
- **Plan mode's default scope is all-days**, so its default wide view is dots. Legible the moment a day is picked, and there are no numbers in all-days to lose either way — but if "Plan mode always shows full pins" is the requirement rather than "day scope does", that is a one-line change and the owner's call.

## Scenarios walked that changed nothing

Recorded so the next audit does not redo them: offline / list-only, reduced motion, arrival on a placeless booking, selecting a coordless place, the frame control with no placed stops, two chips tapped in quick succession, a pin tap during a sheet height animation, the area sort at dot zoom, and the card reserve during an in-flight ease.
