# Session 177 — the press a browser can't fire (2026-07-29)

> _"Home → events → + add event → add location → back (closes keyboard) → back (goes back to
> event form) → back (closes app instead of closing the modal). And probably same for booking."_

## What made this one different

Sessions 175 and 176 established the method: reproduce in Playwright, then fix. This report
**does not reproduce in Playwright**, and running it anyway is what produced the finding.

Driving the owner's exact sequence, back #3 correctly closes the form. Tracing the interceptor
showed why: every traversal Playwright can fire arrives `cancelable: true`, so the interceptor
always gets to cancel, and any missing marker is absorbed by the cancel-and-peel fallback
session 175 added. The one axis that matters here is the one a headless browser does not vary.

**The rule this leaves behind:** an e2e is the right tool for "does the app do the right
thing", and the wrong tool for anything gated on **user activation**. Those belong in
`state/nav-state.system-back.test.tsx`, whose fake Navigation API takes `cancelable` as a test
input for exactly this reason.

## The defect

Markers reconciled only on register/unregister, which assumes a layer's URL never moves under
it. Every errand return breaks that: the form re-opens, and _then_ the destination rewrites its
own URL with `replace` — the Index stripping `?focus=bookings`, `cancelErrand` navigating to
`returnTo`. The layer stays registered, nothing reconciles, and its marker is left describing a
URL the app has left. Session 175's `ridable` check then reads false with a layer plainly open.

Cancelable press → the fallback cancels and peels, outcome correct, defect invisible.
**Uncancelable** press → nothing to ride, nothing to cancel, the traversal commits and takes the
screen. From the trip's first form that is the app closing.

Fixed by running the same `reconcileMarkers` on every location change. It cannot loop:
`pushMarker` navigates to the same URL, so the next pass finds depth already matching the stack.

Reproduced first as a failing harness case (the non-cancelable variant failed, the cancelable
one passed — which is the whole diagnosis in two assertions), then fixed.

## Found on the way, and left open

**The errand leaks history.** Each round trip permanently adds two entries and strands a
`?tab=map` behind the user — three trips leave you at index 7 of 9, against ADR-0090's flat
in-trip history.

Not fixed here, deliberately. Markers are push-only by design, and that tradeoff was accepted
on the stated grounds that programmatic `history.back()` reconciliation races Strict Mode and
rapid re-renders. Unwinding them re-opens exactly that rejected design — a decision, not a
patch. Nothing observable misbehaves today, because structural backs always `replace` and the
stranded entries are never traversed into; the cost is an unbounded forward stack.

## Coverage

1635 unit tests (+2), 51 e2e unchanged and still green.
