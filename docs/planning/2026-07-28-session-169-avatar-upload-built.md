# Session 169 — avatar upload, built (ADR-0133 Phase 4)

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Code** — the last phase of [ADR-0133](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md), and the one the owner asked for twice ("can't see image upload like from the mocks"). The control was designed in Phase 2 and deliberately shipped **absent**; what was missing was somewhere to put the bytes. That is now built, and the trust-class call it owed is written down as ADR-0133 §12.

## The whole decision in one line

**An avatar is not a document, and the divergence is the design.** A document is a
trip-scoped secret: encrypted at rest, auth-guarded, and served `attachment` so it can
never execute in our origin. An avatar is a face we _publish_ to the group and draw in an
`<img>`. Reusing the document posture would have been cargo-culting; §12 has the full
table, but the short version is that encryption would be theatre and inline is safe here
for a different reason — **the type is proved from the bytes rather than believed from
the header.**

That also settles the authentication question, which is the part that looks alarming
until you say it plainly: the read route is `@Public`, because an `<img>` cannot carry a
bearer token, and the key is an unguessable `randomUUID` handed out only inside a `User`
DTO. That is _exactly_ the trust class of the `googleAvatarUrl` this app has hotlinked
since Phase 1 — Google serves that photo unauthenticated to anyone holding the URL.
Guarding ours harder than the photo it replaces would protect nothing.

## The key is in the path, and that is load-bearing

`/users/:userId/avatar/:key`, where the key is the blob's own id. Three things fall out
of that one choice, which is why it isn't a query param:

1. The URL is immutable, so `Cache-Control: immutable` for a year is **honest** rather
   than optimistic.
2. A replace mints a new key and therefore a new URL, so there is no cache-busting
   parameter to remember and no stale-face window.
3. The key is **matched** against the user's current one rather than merely looked up —
   which is what makes "remove the photo" actually stop serving the photo. Verified: the
   previous URL 404s the moment a replace lands.

## `usePickFile`, because the mechanism is shared and the presentation is not

§6 asked for the file-pick mechanism as a **variant** of `FilePicker`. Building it showed
the honest shape is a hook. The plumbing is genuinely identical — off-screen inputs,
`accept`, `capture`, the coarse-pointer detect, the reset-after-pick that lets you
re-choose the same file. The presentations share nothing at all: a document has no
on-screen representation, so dashed tiles have to be the target; an avatar is already on
screen, large and round, so **it is its own target**. A `variant` prop switching between
two unrelated trees would have been one component pretending to be one thing.

`FilePicker` now renders over the hook with no behaviour change, and camera **facing**
became a parameter along the way: a document wants the rear camera, a self-portrait the
front one, and the hardcoded `environment` would have opened the camera pointed away from
the subject.

## `storage.ts` moved to `common/`

It was never document-specific — an opaque-keyed byte sink with an S3/dev-disk swap — and
a second caller made its address a lie. `blob-cache.ts` moved with it, being purely its
cache tier. The `DOC_LOCAL_STORAGE_DIR` env var and its default path **stayed**: one flat
keyspace of UUIDs, and renaming them would strand every blob an existing dev install has
written to buy a tidier word.

## Three defects the render found, and one the repo's own guard did

Consistent with every phase of this epic: putting it on screen found what tests could
not. That is now four sessions in a row, and it is worth saying rather than implying the
tests were sufficient.

1. **Both `<input type="file">` elements were visible** — two "Choose File" controls at
   the bottom of the picture page. `.file-picker-input`'s off-screen rule lived in
   `file-picker.css`, which only `FilePicker` imports, so the hook emitted markup styled
   by a stylesheet it did not own. Fixed where it belongs: the rule moved to
   `use-pick-file.css`, imported by the hook. **A hook that emits DOM owns that DOM's
   styling.**
2. **The hint claimed the initials were showing while a photo was on screen.** With an
   upload in use and no Google photo, the old two-way `googleAvatarUrl ? … : …` branch
   printed "ולכן מוצגות האותיות הראשונות" under a visible face. It needed three cases,
   not two — the Google note applies whenever a Google photo exists, the no-photo note
   only when initials are what actually gets drawn.
3. **A rejected file failed silently, and with the wrong message.** The error branch
   sniffed `err.message.startsWith('avatar:')`, and a text file throws a `DOMException`
   from `createImageBitmap` that no prefix would match — so "not a picture" was reported
   as "upload failed". Replaced with **where it threw** rather than what it said: decode
   failure → "not a picture", request failure → "upload failed". Two problems with two
   different next steps deserve two messages.
4. **`openapi-contract.spec.ts` rejected the new route**, and it was right to. `users`
   was outside `SERVER_ROUTE_PREFIXES` — a list that also drives the **service worker's**
   network passthrough, so without it the PWA would have answered every avatar request
   with the cached app shell and every uploaded face would have failed to decode in
   production. A contract test earning its keep.

## Verified against a real server, not only in tests

Backend (curl against a live Nest + Postgres): a real 600×400 PNG uploads and comes back
byte-identical; the response carries `Content-Type: image/png` **re-derived from the
bytes**, `nosniff`, `default-src 'none'; sandbox`, `inline`, and the year-long
`immutable`; a retired key, another user's key, and a missing blob all 404; an SVG with a
`<script>` and HTML renamed `.png` are both **415** and neither disturbs the existing
upload; 600 KB is **413** at the interceptor; a replace mints a new key, 404s the old URL
and deletes the old blob; a remove lands on `initials` and 404s the new URL too.

Browser (Chromium, 390×844, touch): the badge's own off-screen input drives the real
flow. A 600×400 source arrives as a **400×400** square — `squareCrop`'s downscale-only
rule, since the short side is under 512. The state flips correctly (caption → "התמונה
שהעליתם", primary → "החלפת תמונה", ramp → hidden, remove link → present), the photo loads
from our route, and **the trip chrome's ringed account avatar renders the same photo**
beside a co-member's initials. A text file is refused client-side with **no request made**
and the correct message. Remove returns the page to initials + the full ramp.

Tests: 195 backend (25 files, all green), 1604 frontend (118 files). New: 12 avatar
service cases against a real DB, 10 sniffer cases, 9 `usePickFile` cases, 6 `squareCrop`
cases, 3 `avatarContentPath` cases, and the picture page from 12 → 23.

One test premise was wrong rather than the code: "the bytes are gone" only means gone if
the **blob cache** is cleared too, since `putObject` warms it (ADR-0055). Without the
reset the cache correctly still served the blob. The spec now resets it and says why.

## A numbering note, since it will confuse someone

This is **169**, not 167: main took `session-167-168` for the map-search device pass while
this branch was in flight, and the solo-trip fix that shipped just before it was labelled
"session 167" in the backlog (it has no note of its own). So 167 appears twice in the
record, from two different branches, and neither citation was wrong when written. Left as
is rather than rewritten — the backlog already carries a line about the same collision at 159.

## What is left

The epic's four phases are done. Still open and unchanged: the identity ramp's **dark
values have never been judged on a real dark render** (every pass in this epic has been
light mode), a rename is not broadcast to co-members (§8), admin verbs from the roster
(§9's deliberate deferral), and the emoji-as-UI-controls sweep — `ui/Icon` gained a real
`camera` SVG here, which is the first shape that sweep needs, but `FilePicker`'s ⬆️/📷
tiles and `MemberSheet`'s 👑/🚪 are still emoji and still that sweep's job.
