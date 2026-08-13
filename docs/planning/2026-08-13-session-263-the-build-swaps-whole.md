# Session 263 — the build swaps whole, or not at all

**Date:** 2026-08-13
**Task:** owner report — _"the app freezes with a blank screen after deploying a new build. It was addressed but not fixed… sometimes the app freezes before [the reload button pops up]. Most of the times it happens after opening the app after the deploy."_ Plus: make the update automatic.
**Outcome:** [ADR-0185](../decisions/0185-a-build-swaps-whole-or-not-at-all.md) (Accepted, built same day) · `scripts/deploy-swap-check.mjs`

## The diagnosis, and why the previous fix could not have worked

Two defects that compose. Neither is new; one of them was written down and shipped anyway.

**The swap was not atomic.** `skipWaiting`/`clientsClaim` under `autoUpdate` means a rebuilt SW activates and claims the open page, and Workbox's precache cleanup then drops every entry not in the new manifest — with content hashes, that is every old `assets/*.js`. The deploy has already removed them from the server. So from that instant every not-yet-loaded route is a guaranteed 404. ADR-0181 **said this** ("a dynamic import of a not-yet-loaded route can miss") and shipped a banner as the compensating control. A banner racing a failure is not a fix, and the update check fires **on navigation** — which is why "after opening the app" is when it bites.

**There is no error boundary anywhere in the app.** So losing that race is a blank white document rather than an error. `lib/money.ts` line 51 has said so in a comment since a currency-less trip blanked the screen: _"no ErrorBoundary"_. The freeze was the second instance of one bug, and the first instance had been annotated and left.

## The correction ADR-0181 had already argued against itself

ADR-0181 §3 rejected `'prompt'` mode on two grounds and, in the same paragraph, called it _"strictly better"_ on this defect. Re-reading it with a real failure in hand, one ground was a category error and the other was a warning, not an objection:

- _"an offline reload would still run stale JS"_ — it would run the old **complete** build, which works. The bug was never staleness, it was **incoherence**. Half a build does not behave; a whole old one does.
- _"it is not a one-word change and fails silently"_ — true, and that is why it is one change and not two: `registerType: 'prompt'` **and** `skipWaiting: false`, because the plugin forces the flags on under `autoUpdate` and does not force them off. Verified out of a real build rather than assumed: the generated `sw.js` now carries the `SKIP_WAITING` message listener and no unconditional `self.skipWaiting()`.

## The thing a code reading got wrong, and what caught it

Worth the section because it is the whole argument for having built the harness.

The plugin's `'prompt'` branch exposes `onNeedReload` on `controlling`, and the obvious move is to reload there. It does not fire. workbox-window gates `event.isUpdate` on `updateLikelyTriggeredExternally`, a heuristic that includes _"more than 60 seconds since `register()`"_ — true of every update a long-lived tab will ever find. So the callback is skipped exactly when it matters.

I had already written the hook against `onNeedReload`, with unit tests passing, when the browser run said:

```
t+30s  skipWaiting: {"type":"SKIP_WAITING"} | controllerchange fired: true | still waiting: false
…
[released] now running /assets/index-Do32pc23.js     ← the OLD entry chunk
>>> VERDICT: the automatic swap did NOT happen.
```

The swap completed and the page did not reload — orphaned JS, the precise state the change exists to prevent, reintroduced one layer up. The fix is to stop borrowing the signal: listen to `navigator.serviceWorker`'s `controllerchange` directly. No heuristic, no opinion about who caused it. `onNeedReload` is still passed, because it is also the override that suppresses the plugin's own `location.reload()`, and it routes into the same idempotent handler.

The correction brought its own hazard: `clientsClaim()` on a **first** install fires `controllerchange` too. Unguarded, every first-ever visit would open with "a new version was installed". Hence the was-this-document-controlled-at-load check.

## The harness, which is the session's other deliverable

ADR-0181's coverage section said the browser half _"could not be [tested] by a unit test: it needs two builds and a `dist` swapped underneath a live tab"_. That is true of a unit test and not of a script. `scripts/deploy-swap-check.mjs` is ~120 lines: a static server whose backing directory changes mid-run, real Chromium, two production builds.

|                                       | before       | after         |
| ------------------------------------- | ------------ | ------------- |
| new worker parked after the deploy    | no           | **yes**       |
| old-build chunk still in the SW cache | **no**       | yes           |
| …still fetchable by the live page     | **no — 404** | **yes — 200** |

Both columns are measured, not argued: the "before" column is a build made with the old config, and its 404 **is** the blank screen. One gotcha worth passing on — the change between the two builds has to survive minification. My first attempt appended a comment, the hashes came out identical, and the run proved nothing while looking like it had.

## The automatic swap, and what it refuses

Put to the owner with the alternatives; answered **hidden / idle / at boot**, banner kept as a rare fallback, safety net at full width.

The apply moments, in the order they actually fire: the tab going **hidden** (its own event, because a backgrounded page is throttled past what a poll can catch), a document **nobody has touched yet** (the reported scenario — a reload before the first tap is just a longer boot), and **5 minutes of foreground idle** as a backstop. What it refuses is the interesting half: any open overlay (asked of `nav-state`'s stack, which is the one registry that knows) or any focused editable — and **hidden is not an exemption**, since an app switched away from mid-form is the most likely way to be mid-form.

The outbox is deliberately **not** guarded. A queued write is in IndexedDB and the flush is FIFO and idempotent (ADR-0018); a reload mid-flush re-sends and the server rejects the duplicate. Counted the call sites rather than assuming.

## Two things noticed on the way

**Rule 8, and the third copy.** `App.tsx`'s idle-resume reset and `trip-state`'s warm-resume catch-up had each grown the same `hiddenAt`/`awayMs` visibility bookkeeping. Mine would have been the third. Extracted to `lib/visibility.ts` and both moved onto it — a small extraction, which is the case the rule says to take rather than ask about.

**The `Date.now()` guard was right and I was not.** The idle math wanted real elapsed time, which is a genuine argument for `Date.now()` over `getNow()` — but ADR-0026's lint guard exists precisely so that argument gets made out loud, and it is not strong enough: time travel is dev-only, dev has no service worker, and `getNow()` is `Date.now()` everywhere it matters. Took the guard's answer.

**One self-inflicted wound, recorded because the shape recurs.** Reverting a temporary one-line edit with `git checkout <file>` silently threw away an unrelated edit in the same file made twenty minutes earlier. Caught by grepping for it, not by noticing. Back up the file, or revert the line.
