# The links were live the whole time — ADR-0213, 2026-09-01

**Date:** 2026-09-01
**Subject:** one owner report that named a deploy as the trigger, the three separate failures hiding behind one card, and why the server was never in it.

## What came in

> _"I noticed that each time after I deployed changes and fixes to the live sharing page,
> existing links became unavailable. I had to reopen the sharing sheet again and then the link
> became available. I'm not sure what's the cause and if my steps were related even."_

Two facts in that report did most of the work: it recurs **per deploy**, and the cure was an
action that provably changes nothing.

## Ruling the server out first, because the report points at it

"Links became unavailable" reads as revocation, so that was the first thing to disprove rather
than the first thing to assume. `revokedAt` is written in three places — `revoke`, `revokeAll`,
and the re-share that reuses a revoked row — all behind `assertTripAdmin`, none reachable
without a press. No migration, sweeper or startup path touches `TripShare`. And the sheet's
`PUT` is idempotent by `policyHash` (tenth amendment §3): the same policy returns the same row
and the same code. So the owner's cure could not have been a cure, which is the strongest thing
the report says — **the thing that changed was on the reader's side**, and the sheet was a
coincidence of him opening the app.

## The page had one verdict for three failures

`SharedItinerary`'s `catch` ended in `{ kind: 'unavailable' }` for every error, and that state
draws `יכול להיות שהלינק בוטל`. Three different things arrive there:

- the server's `404` — the only one that sentence describes;
- **nobody answered**, which is what a deploy IS for a few seconds while Railway swaps
  containers behind a healthcheck — and the first read had no retry;
- **the answer did not parse**, because `sharedItinerarySchema` is strict and the reader was
  running a build older than the server.

Any one of them alone reproduces the report. Fixing one and calling it the cause would have
left the other two.

## The measurement that made the third one a fact rather than a theory

The theory needed two links in a chain, and both were measurable.

**Does an older build actually refuse a newer projection?** Ten lines against the real schema:
`sharedEventSchema.parse({ title, daypart, tomorrowsField })` fails on the unknown key. Then
`git diff` over the last three sharing deploys — `time` in the twelfth amendment,
`checkIn`/`checkOut` in the fourteenth — so every deploy in the report's window added exactly
that shape.

**Does the reader actually get an older build?** `server-routes.ts` said so in as many words
(_"an ordinary SPA route that must keep getting the cached shell"_), but a comment is not a
measurement. `scripts/deploy-swap-check.mjs` already drives two real builds with a `dist`
swapped under a live tab, so it gained a fourth step: a rollback as the second deploy, then a
fresh `/s/<code>` in its own tab, watching the FIRST document request. It printed
`index-BYY2shE1.js` from the precache while the server was serving `index-pky6gFb8.js`. That is
the skew, in a number, and after the fix the same step prints one chunk twice.

## The transferable finding

**A precached shell is a promise that this document does not depend on the server it talks to.**
ADR-0185 made the app wait for a quiet moment to take a new build, and that is right _because
the app is whole while it waits_ — every chunk it might load is in the same precache. The
shared reader breaks the premise rather than the rule: it holds no data of its own, and the
page it renders comes from whatever was deployed a minute ago. One route on the same origin can
have a different answer to "may I be a build behind" from every other route, and nothing in the
worker's shape makes you ask the question per route.

The second finding is smaller and cost nothing to fix: **the reader page's first read is the one
request in the app with no second chance.** Everywhere else a failed read has a human with an
app who can pull to refresh, back out, or reopen. Here it is somebody's aunt with a link, so a
single unanswered request had to stop meaning "this was revoked".

## What was deliberately not done

- The strict schema stays strict. It is the leak guard on the server's way out (this file's own
  §5 argument), and loosening the client to tolerate unknown keys would have fixed the field
  that was ADDED while still breaking on the first enum value that is added — a new
  `SHARE_DAY_KIND` refuses an old build whatever the object mode is. Keeping the document fresh
  fixes both.
- The public reader still registers the app's service worker (87 entries, 3.4 MB) on the phone
  of somebody reading one itinerary once. That is the same mechanism seen from the other end and
  a question about ADR-0185's territory, so it is a backlog line rather than a second change in
  this one.
