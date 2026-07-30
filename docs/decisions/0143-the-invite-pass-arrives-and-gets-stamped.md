# ADR-0143 — The invite pass arrives, and gets stamped

**Status:** Accepted (designed 2026-07-31 session 189, built session 190)
**Design reference:** [`mockups/motion-join-v1.html`](../../mockups/motion-join-v1.html) — the beats, plus a `resume` toggle showing what ships today.
**Builds on:** [ADR-0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (the motion foundations) and [ADR-0142](0142-trip-birth-is-the-boards-first-departure.md) (its counterpart on the other first-run surface).
**Amends:** [ADR-0067](0067-revocable-code-invites-and-removal-blocks.md)'s expired/revoked states — they render as a refusal rather than narrating one.

## Context

`/join/:token` is the strongest piece of visual writing in the app: a dark
departure-board landing with an amber anticipation glow and a boarding-pass ticket
carrying a real perforation, a countdown and the group's avatars. It was completely
static.

Before the preview resolved: a bare `<p>` of status text. After it resolved: the pass
appeared fully formed. After the tap: `joinTrip` resolved and `navigate('/')` — so **the
moment you were admitted was the one frame the screen did not show.**

## Decision

**A boarding pass is an object. Objects arrive, and they get stamped.** Every beat below
follows from that one sentence, which is why this surface needed no celebration
vocabulary of its own — only permission to behave like what it already looks like.

### 1. It arrives and settles

The pass comes up with a whisper of rotation, the way a card handed to you settles —
`--ease-arrive`'s overshoot is what makes it _settle_ rather than stop. The perforation's
**notches punch**, because they are holes and a hole appears by being made. The
**avatars land one after another** on the shared stagger step.

The avatars are the **sentence, not the decoration**: "N people are already in" is the
social proof this screen runs on, and staggering them makes the row read as _people
arriving_ rather than as a row that was always there. Same data, different claim.

And the **anticipation glow now ramps with the pass.** It was at full strength from the
first frame — warm before there was anything to be warm about — so the screen now warms
_because_ of the invitation.

### 2. The stamp, and the tear

You are **admitted**. The stamp is rotated and slightly off-square, because a stamp is
applied by a hand rather than laid out by a grid; the pass **recoils** under it, which is
the one bit of physics that sells it.

**It lands on the server's success and never optimistically.** A stamp that has to be
un-stamped when `joinTrip` fails is worse than no stamp, so the spinner covers the
request and the stamp only ever marks a real membership.

Then the pass **tears along the perforation the shipped CSS already draws**
(`.ticket-perf` and its two notches). That detail had been sitting there as decoration
promising an action, so tearing along it costs no new element and redeems something the
design already paid for.

**Which half goes with you is the point.** The top half carries the trip's identity, so
it is the half that rises into the handoff; the stub — the people, the part a gate agent
keeps — is what leaves. Reversed, the motion says _you_ were the one torn off.

The **navigation is the last beat**, so nothing races the sequence. And the CTA is
dropped once the pass is stamped: a tappable "join" over a pass that has already been
accepted is a second join.

### 3. The stamp is a STATUS colour, not teal

The mockup drew the admitted stamp in **teal**. That is a colour-budget violation —
ADR-0028 reserves teal for **location only** — and the build corrects it. Being admitted
is a _status_, so the status mini-palette is exactly right: `--ok` for admitted, `--miss`
for refused.

### 4. Loading is the pass's own shape

A sentence on a dark screen reads as "something is happening somewhere"; the pass's
outline reads as "a pass is coming". Same reasoning as ADR-0105's content-shaped
skeletons, and this is the one surface where the shape **is** the message.

The status sentence is **kept**, visually hidden, for anyone who cannot see a shape — the
skeleton is an enhancement of the status, not a replacement for it.

### 5. Refused renders, it does not narrate

An expired or revoked invite (ADR-0067) was a paragraph. **A paragraph on a loading
screen reads as a loading state that never resolved, not as a decision.** So the pass is
drawn and stamped `פג תוקף`, its title struck through, and the anticipation glow drops
out.

**The trip is deliberately not shown** — and this is the second correction to the mockup,
which drew the trip struck through. That assumed a preview the API does not return for a
dead code: `fetchInvitePreview` is what _failed_, so there is nothing to draw. What the
stamp still buys is the distinction the paragraph could not make — the invitation was
real and the **link** is what died, so the next step is "ask for a new one" rather than
"check the address".

**Offline keeps its sentence.** It is a connectivity fact, not an invitation that failed,
and dressing it as a refusal would tell the user their invite is dead when it is fine.

### 6. A number that changes should be seen to change

The countdown counts **up** to its value — the number of days until you fly is the most
emotive fact on the screen and it arrived as static text. `lib/useCountUp.ts` is shared
from the start rather than written into this screen, because it is the first consumer of
a whole class of beats the brief mapped (day and member counts, Home's glance figures):
a second surface is a one-line call, not a second copy of the loop.

It counts in **integer steps to a whole number**, so what runs up is the value itself
rather than a float being rounded for display, and it always **ends exactly on the
target** — a partial value left on screen would report a date the trip does not have.

### 7. A blocked join is indistinguishable from a dead link

This ADR originally argued the reverse — that a removed member must **not** get the same
treatment as an expired link, because one mark for both would be "the app declining to say
which". The owner corrected it, and the correction is right: **declining to say which is
exactly the point.** Naming the block tells someone who is no longer a member that the
group made a decision about them, which is a roster fact they have no standing to learn.

So a blocked join renders the same refused pass, with the **same words**, as an invalid
code: "this link is no longer valid, ask for a new one" — true either way, and actionable
either way. The disclosing string is deleted rather than left unused, with a comment where
it lived saying why it must not come back.

**Expired stays distinct, and that is not an inconsistency.** Three cases, and only one is
about the person asking:

| case        | what it means                            | about whom   |
| ----------- | ---------------------------------------- | ------------ |
| **invalid** | the code never existed — typo, bad paste | nobody       |
| **expired** | the code was real, the trip has ended    | the **trip** |
| **blocked** | the code is live, but not for **you**    | **you**      |

Only `blocked` needs cover, and it hides inside `invalid` — the most common benign case,
and the one whose advice a blocked user can actually act on. Collapsing `expired` in too
would leak nothing but would give advice that **cannot work**: invites die with the trip
(ADR-0067), so "ask for a new link" is a dead end dressed as a next step.

**The limit, stated:** a blocked user can still infer by comparing with someone who opens
the same live link and sees the ticket. That is the ceiling of this kind of masking without
lying considerably harder, and it is not worth chasing. Also note the refusal **stamp**
reads `פג תוקף` for all three — mildly inaccurate for an invalid code, and deliberately so,
because one stamp is what makes the block hide.

## Consequences

- The anonymous Google detour is now **visible**. It auto-joins on return via
  `consumeJoinIntent()`, which the brief flagged as the app deciding while the user
  watches a redirect. The fix turned out not to need a second tap — ADR-0024's explicit
  tap already happened before leaving — it needed the outcome to be _shown_, and the
  stamp/tear sequence does that. The return now lands on the pass and stamps it.
- `.join-status` survives for offline only. Any new load state has to decide which it is:
  a refusal (render the pass) or a fact about the network (a sentence).

## What this ADR does not settle

- ~~The removed-member case~~ — **decided, and the opposite way round (owner,
  2026-07-31). See §7.**
- **Whether the count-up should run on a re-open.** It is charming once and possibly
  fussy every time you revisit the link. It currently runs per mount.
- **The device pass.** As with ADR-0142, nothing here has been watched running: the build
  environment had no Docker daemon and no local Postgres. The state machine is covered by
  the screen's first ten tests; how it looks and feels is not.

## Build log

**Session 190 (2026-07-31).**

**The tests found a real bug, and it was in this ADR's own mechanism.** `JoinTrip` had no
test file at all — the same gap session 186 found on `CreateTrip`, on the other first-run
surface, with no e2e spec reaching the route either. Its first tests immediately caught
that arming the tear and the handoff timers _together_ from the `stamped` phase **stranded
the user on a torn pass forever**: advancing to `torn` re-runs the effect, and its cleanup
cancelled the pending navigation before it could fire. One timer per phase, chained, so a
phase only ever cancels its own pending step.

That is the second time in this pass that writing the test for a new state machine was
what found the defect in it, rather than confirming the absence of one.
