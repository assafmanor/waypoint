# 0220 — A pasted link is the app before the app is

**Status:** Accepted — **built 2026-09-05**, and **amended the same evening** after three owner reports off a real device: the link a person copies had no scheme and so got no preview at all, the invitation cover was too small to read, and the live share had no cover of its own. The amendment at the foot also **reverses §2's paper band** and names the measurement error behind it.
**Date:** 2026-09-05

**Refines:** [0087](0087-app-logo-waypoint-marker.md) (the mark, its two sanctioned grounds, and the cutter this extends — amended below), [0213](0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md) §5 (the bearer-link headers, whose predicate this renames and widens — amended below), [0197](0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) §8 (the worker that shows the notification — amended below), [0067](0067-invite-is-one-stable-link.md) (the invite code is the grant, which is why its preview refuses indexing), [0020](0020-single-origin-deploy.md) (the backend serves the PWA, which is the only reason per-route tags are possible at all), [0170](0170-the-product-is-travelive-the-codebase-is-waypoint.md) (`APP_TITLE`'s tagline, which the covers carry), [0118](0118-bidi-and-rtl-copy.md) (the isolate the date range needs)

**Relates:** [0009](0009-docs-english-product-hebrew.md) (product copy is Hebrew; this adds the third server-side locale consumer), [0096](0096-reuse-existing-infrastructure.md) (rule 8, which decided both the invitation cover and where the date grammar lives)

**Drawn in:** [`mockups/the-app-is-seen-before-it-is-opened-v1.html`](../../mockups/the-app-is-seen-before-it-is-opened-v1.html) — the three grounds measured against a light and a dark chat, the two covers, the strings clean and crowded, and the badge silhouette at ⁦24px⁩.
**Session note:** [`planning/2026-09-05-the-app-is-seen-before-it-is-opened.md`](../planning/2026-09-05-the-app-is-seen-before-it-is-opened.md) — the forks put to the owner and the answers.

## Context

Two owner reports, one subject.

> _"I want to make the app more professional looking and feeling. That includes adding meta and
> whatnot so that sharing links to the app appears with the logo, a title, and maybe some short
> description. That includes specifically for: homepage, trip invitation, trip sharing (live).
> That should work on WhatsApp etc. Also try to think of the texts that appear, please consult me.
> Try to avoid using the dot separator and em dashes."_

> _"The notifications show a big white rectangle instead of the app's logo (it should appear as
> black and white I guess)."_

The subject is **what a person sees of Travelive before they ever open it** — a link in a group
chat, a notification on a lock screen. Two surfaces we control one image and a few strings in, and
nothing else. ADR-0030 already established that the invite travels through WhatsApp, so the first
report is about the distribution channel this app was designed around.

Reading the code answered the second report before anything was drawn, and reframed the first.

**The white rectangle is not a missing asset.** `frontend/src/sw.ts` set
`badge: '/pwa-192.png'` alongside `icon:`. Chrome hands `badge` to Android as the **small icon**,
and Android draws the small icon by taking the asset's **alpha channel** and painting it in the
status-bar colour — it has ignored the small icon's own colour since API 21. The alpha of a
full-bleed tile is the tile. ADR-0087's 2026-09-03 amendment made every icon full bleed
deliberately, so that the platform's mask would be the only silhouette anywhere; that is exactly
why the badge cannot be one of them. The report is the asset working as specified.

**And there were no `og:*` tags at all**, so the first report is not a tuning job either. They also
cannot be written by the app: a preview crawler fetches the document, reads `<head>`, and leaves
without running a line of JavaScript. There is no React version of this. What makes it possible is
ADR-0020 — the backend already serves the built PWA, so it can answer the shell with the tags
already in it.

## Decision

### §1 — The cover is a PNG, so it cannot flip with the theme, and that decides the rest

Every other surface this repo draws remaps between light and dark (ADR-0158 §16). An `og:image` is
one file served to a crawler, and the chat it lands in picks its own ground. So the cover is
**pinned to `tokens.css`'s light values, written as literals in the SVG**, and the only question
worth asking is whether it holds against both chats.

The consequence is stated plainly because it is a real cost: changing a colour token does not
change the covers. They are cut by hand from the token values and the SVG says so.

### §2 — The ground is board **plus a paper band**, because the failure is symmetric

Measured in the mockup against a WhatsApp bubble, in both chat themes:

| Ground                                    | vs. light bubble | vs. dark bubble |
| ----------------------------------------- | ---------------- | --------------- |
| Board — the app icon's own tile           | ⁦17.9:1⁩         | **⁦1.25:1⁩**    |
| Paper — ADR-0087's sanctioned bright tile | **⁦1.15:1⁩**     | ⁦12.48:1⁩       |
| Board + a paper band                      | ⁦17.9:1⁩         | ⁦12.48:1⁩       |

**No single ground clears the ⁦3:1⁩ graphic floor in both chats.** A dark cover on a dark chat is a
hole where the image should be; a paper cover on a light chat melts into the bubble. A two-region
cover needs only one region with an edge, which is what the band buys — so it is the recommendation
on a number, not a hedge between two tastes.

The board is what the app already looks like (the icon, the login chrome, the join screen), which
is why paper alone was rejected despite passing one of the two tests: it would have shared
professionally and not looked like us.

### §3 — Two covers, and the invitation one is not new art

`og-cover.svg` for the homepage and the live share; `og-invite.svg` for `/join/<code>`.

The invitation cover is `App.css`'s shipped `.join-ticket` tree at ⁦1.85×⁩ — its gradient, its amber
radial, its `.ticket-badge` pill, its perforation. Rule 8 (ADR-0096): the ticket already **means**
"an invitation" in this app, so a second invitation graphic would have gone out of step with the
screen the link opens the first time either changed.

**Neither cover names a trip, and neither can.** They are cut once at build time and served to
every crawler. Whatever identifies a trip lives in the strings, which is why the strings were the
part put to the owner.

### §4 — The range's shape is shared; the month names are not

`tripRangeShape` in `@waypoint/shared` returns `same-day | same-month | same-year | cross-year`.
`frontend/src/lib/time.ts`'s `proseTripRange` and `backend/src/sharing/hebrew.copy.ts`'s
`heTripRange` both switch on it. One decision, two renderers — so the invite ticket and the preview
that advertised it cannot disagree about one trip.

**This is not where the plan started, and the correction is the most useful thing in this ADR.**
The obvious move was to lift `formatTripDates` wholesale into `packages/shared`. That package's own
`CLAUDE.md` forbids it in as many words — _"no ambient locale (`APP_LOCALE` is the frontend's, and
product formatting is its concern)"_ — and the repo had already answered the question elsewhere:
the itinerary PDF is a server-rendered Hebrew product surface and it holds its words in
`itinerary-pdf.copy.ts`, whose docblock explains that a second locale consumer is a constraint
rather than a preference. So the shape is shared (the rule the package **does** ask for: _"stable
keys a consumer looks its own copy up by"_, the same shape as `eventEndBoundary`) and the words stay
with each renderer.

The backend's months come from **`Intl` with `he-IL`, not a hand-typed table**, and that is the one
place this file departs from how the rest of that module works. A table of twelve strings can only
ever approximate what the screen prints, because the screen reads ICU; reading the same ICU data is
the only way the two are identical by construction. `hebrew.copy.spec.ts` asserts all four shapes,
which doubles as the guard against a small-ICU runtime silently emitting English.

### §5 — One renderer, two entry points, and the strings

`SpaShellService` replaces a `<!--%SOCIAL_META%-->` marker in the built `index.html`. Two callers:

- **`SpaShellController`** — `GET /`, `join/:code`, `s/:code`. `@ApiExcludeController()`, which is
  a statement about what these routes are rather than a way past `openapi-contract.spec.ts`:
  `SERVER_ROUTE_PREFIXES` lists what the service worker must let reach the network, and these are
  **app** routes an installed user should keep getting from the precache. The server answers them
  for the two readers with no worker — a cold navigation and a crawler.
- **`AllExceptionsFilter`** — every other app route (`/settings`, `/day/2026-09-11`, …), through
  the same service, so those carry the app's own tags instead of a tag-less document.

`useStaticAssets` gains `{ index: false }`. Without it `express.static` answers `/` with
`public/index.html` before the router is reached, and the homepage would be the one shared URL with
no preview.

The strings, approved by the owner on 2026-09-05 and held in `hebrew.copy.ts`:

|        | title                                | description                                                 |
| ------ | ------------------------------------ | ----------------------------------------------------------- |
| Home   | `Travelive - כל הטיול שלכם במסך אחד` | `מה עכשיו, מה הבא בתור, ואיפה כל ההזמנות, בזמן שאתם שם.`    |
| Invite | `הוזמנת ל${name}`                    | `${destination}, ${dates}. ${travellers} נוסעים כבר בפנים.` |
| Live   | `${name} - הלו״ז החי`                | `${destination}, ${dates}. לינק שמתעדכן עם הטיול.`          |

No `·` and no em dash (owner). The app's separator is right on a screen and reads as debris in a
chat preview. The en dash inside a date range is the app's existing convention and stays.

**The date range is wrapped in `ltrIsolate`.** `אוסקה, 11–22 בספטמבר.` leads with Hebrew, so the
element resolves RTL and the numeric run paints as `22–11` (ADR-0118). A `<meta>` attribute carries
U+2066/U+2069 like any other text.

### §6 — Security, and what a preview is not allowed to be

- **`/join/<code>` joins the bearer-link header set.** `isPublicSharePath` is now
  `isBearerLinkPath` and matches `/s/` **and** `/join/`. The predicate's subject is "does this path
  contain a credential", which is not a judgement call, where "is this the sharing feature" was.
  The invite's response changed with this ADR: until now it was a content-free shell at a secret
  URL and it is now the trip's name and dates at one. `no-referrer` was owed even before that — a
  tap from the join screen hands the destination site the invite code in `Referer`.
- **The same ⁦20/min⁩ per-IP cap the JSON reads carry** (B-10, ADR-0213 §5). An 8-character base58
  code is the credential, and an unthrottled HTML route that answers differently for a real code
  than a fake one is a cheaper enumeration oracle than the API beside it.
- **An unresolvable code gets the app's generic tags, never an error.** A 404 would be the
  existence oracle the JSON routes refuse to be; an expired invite throws 410 and its reader should
  still reach the join screen and be told why; and the shell is the same document either way, so
  failing the page over a preview would be the tail wagging the dog.
- **A cheap `previewByCode`, not the projection.** `SharingService.byCode` resolves the whole
  itinerary and runs the narrative generator. The port is bound to the deterministic generator
  today (ADR-0213 §2) — this guards the day it is not, because an unauthenticated page that can
  trigger a model is an invoice with no session attached.
- **Every interpolated value is HTML-escaped**, all five characters. A trip name is content a
  member typed and reaches the renderer through an invite code any member can mint.

### §7 — The notification badge

`badge: '/notification-badge.png'` — a monochrome-on-transparent pin with the mark's own amber core
punched out as a hole, at ⁦0.86⁩ of its canvas. The large `icon` keeps `pwa-192.png` in colour and is
untouched: it was always correct.

The hole is the design decision, and it was measured at the only size that matters. At ⁦24px⁩ a solid
pin reads as a generic teardrop once the colour is gone, and an outline at the mark's own ⁦9⁩-unit
stroke is ⁦0.42px⁩ — absent. The hole keeps the one element that makes it ours.

It is listed in `vite.config.ts`'s `includeAssets`, and that line is load-bearing in a way the
others are not: the app icons are precached because they are **manifest** icons and the plugin's
`includeManifestIcons` default catches them. The badge is not one, so without the entry a push
received offline would render with Chrome's face on it.

## Consequences

- **`scripts/gen-app-icons.mjs` cuts seven assets, not four**, and inlines the app's own woff2
  faces for the two that carry type — headless Chromium has neither Assistant nor Secular One, and
  `page.setContent` has no origin to fetch them from. Same technique the PDF renderer uses.
- **The covers are not precached.** They are fetched by crawlers, never by the app.
- **`STATIC_ROOT` / `SPA_INDEX` moved** from `common/all-exceptions.filter.ts` to
  `spa/spa-paths.ts`. The filter imports `@prisma/client`, so reading a path constant used to
  require a generated Prisma client; the filter re-exports both for its former importers.
- **`toDateOnly` is exported** from `trips.mapper.ts` rather than copied.
- **A person with the app installed never sees these tags.** The service worker answers those three
  navigations from the precache. The crawler is the whole audience, and that bounds what this is
  worth arguing about.
- **A rate-limited document navigation now gets the app shell** (see the build log) — 429 joined
  404 and 401 in the filter's fallback set.

## Rejected

- **A per-trip generated cover**, with the trip's name, destination and route drawn into the image.
  A Chromium render per crawler hit, on a page whose whole `no-store` posture (ADR-0213) forbids
  caching the result, and crawlers give up fast. The card's **text** already carries the specifics.
  On the backlog.
- **A plain board cover** (§2's numbers) and **a plain paper one** (it does not look like the app).
- **A separate square canvas for Twitter/X and iMessage**, which centre-crop. The covers' stacks are
  centred for that reason; a third asset to keep in sync was not asked for by any report.
- **A new invitation graphic** (§3, rule 8).
- **A hand-typed Hebrew month table in the backend** (§4) and **lifting `formatTripDates` into
  `packages/shared`** (§4, forbidden by that package's `CLAUDE.md`).
- **`עד` instead of an en dash** in the preview's date range. It reads better in RTL and would have
  been a second date grammar for one surface; ADR-0118's isolate buys the same legibility.
- **Leaving `badge` unset.** Chrome then falls back to **Chrome's** icon, so the notification stops
  being ours — worse than the rectangle, which was at least in the right place.
- **Colouring the small icon.** Not available: Android ignores it. "Black and white I guess" is the
  constraint, not a preference.

## Build log — 2026-09-05

**Four things the mockup's render changed, and only one was a pixel.** Written down because none is
recoverable from the diff:

1. **The cover printed `og:title`'s own sentence**, one line above it in the same bubble. It now
   carries `APP_TITLE`'s tagline (`מרכז שליטה לטיול`), minus its `·`.
2. **The approved invitation wording stuttered.** `הוזמנת לטיול ${name}` reads
   `הוזמנת לטיול טיול הבוגרים של כיתה יב3 ליוון` for a name beginning with `טיול`, and the clean
   case (`יפן 2026`) could never have shown it. Now the bare `ל` prefix, which is what the app
   already says (`הצטרפתם ל${tripName}`). **The crowded-case rule paying for itself on copy.**
3. **The invitation cover contradicted §2 in the same file** — drawn on a pure board while §2 was
   rejecting exactly that. Both covers share the band, and the invitation gains from it the one word
   the ticket cannot give at bubble scale: `הזמנה לטיול` is ⁦10.5px⁩ inside the ticket's own badge and
   ⁦40px⁩ on the band.
4. **The ticket at ⁦2.6×⁩ was clipped by the ⁦630px⁩ canvas** — perforation, avatars and
   `החבורה כבר בפנים` eaten by `overflow: hidden`. ⁦1.85×⁩ fits, and the measurement table asserts it
   rather than trusting the arithmetic that was wrong.

**And `11–22` renders as `22–11`**, proved by comparing the painted x of the two numbers (⁦Δx −18px⁩
raw, ⁦+18px⁩ isolated) rather than by looking — at ⁦12.8px⁩ in a bubble nobody orders four digits by
eye.

**Two things the live run changed**, which no unit test would have found. The build was served from
a real `backend/public` and fetched with WhatsApp's user agent:

- **A rate-limited human on a join link got raw JSON.** `/join/<code>` had no cap before this ADR
  gave it one, so a group behind a single NAT opening the same invite could be handed the error
  envelope where the join screen used to be. `HttpStatus.TOO_MANY_REQUESTS` joined 404 and 401 in
  the filter's shell-fallback set: the guard has already rejected the request, so the work the cap
  protects is not done either way, and the app can show its own "could not load the link" state. A
  programmatic fetch still gets the envelope, so the outbox can still tell retryable from
  permanent.
- **`text-anchor="end"` is the LEFT edge under `direction="rtl"`.** SVG resolves the anchor against
  the inline-base direction, so the first cut of `og-invite.svg` pinned each Hebrew line's left edge
  and let it flow rightward out of the pass — `יוצאים לדרך` ran ⁦200px⁩ past the ticket and the
  avatars landed on `החבורה כבר בפנים`. Invisible in the markup, obvious in the PNG. This is the
  cost of hand-transcribing CSS the mockup got right by using the real rules.

**Verified end to end, not only in tests.** All three URLs fetched with a WhatsApp user agent
against the built app and a seeded trip; the header sets checked per route; an unknown code
confirmed to return the generic tags at 200; a trip renamed to `Osaka" /><script>alert(1)</script>`
confirmed escaped in both `<title>` and every tag; the throttle confirmed to fire and to serve the
shell; and the badge rendered **through Android's own rule** — the PNG used as a mask for a white
slot — beside the old asset, which reproduced the owner's white rectangle exactly.

## Amendments to the ADRs this refines

- **ADR-0087** — the cutter's set grew from four raster icons to seven: `og-cover.png`,
  `og-invite.png` and `notification-badge.png` join it, and it now inlines the app's woff2 faces for
  the two that carry type. The covers are the first assets to spend that ADR's **paper** ground, and
  they spend it as a band rather than a tile (§2). The badge is the first asset that is deliberately
  **not** full bleed, and §7 says why that does not contradict the 2026-09-03 amendment: the
  amendment is about assets a platform masks to a silhouette, and the badge **is** the silhouette.
- **ADR-0213 §5** — `isPublicSharePath` is `isBearerLinkPath` and matches `/join/<code>` too, for
  the reason §6 gives. The four headers are unchanged.
- **ADR-0197 §8** — the worker's `badge` is `notification-badge.png`; `icon` is unchanged. The
  docblock in `sw.ts` claiming a notification "needs no asset of its own" was true of the large icon
  and false of the small one, which is what the owner's screenshot showed.

## Amendment (2026-09-05, same evening) — three reports off a device, and one of them says §2 was measured against the wrong surface

> _"On WhatsApp, and I guess other apps and services too, it doesn't work unless you prefix
> with http(s):// … sharing with the copiable links doesn't work. This includes everything
> we've talked about (home, join, sharing)."_
>
> _"The join page preview is too small! Why does it take so little space out of all the
> screen space?"_
>
> _"Why doesn't the live sharing screen look different?"_

### §A — The scheme, and why every tag above was invisible on the paths it was added for

`lib/invite-link.ts`'s header argued that dropping `https://` was free because _"the chat
apps an invite is actually pasted into linkify a bare host + path"_. **They linkify it and
they do not preview it.** So a copied `travelive.app/join/<code>` arrived as tappable text
with no card, and this ADR's whole first half was unreachable through the app's own copy
buttons.

The state of the code was the tell: **three share-sheet call sites had grown their own
`` `https://${publicAppLink(…)}` `` template and four clipboard writes had not.** The fix
already existed, inline, at some of the places that needed it.

The rule now, in the owner's words — _"url previews should exclude the https prefix … but
when copying or sharing them it should add them"_:

- **`publicAppUrl(path)`** is the form that leaves the app: clipboard, share sheet. It
  carries the page's own protocol (https in production; http in dev, so a copied dev link
  still opens — the old hand-built `https://${…}` produced `https://localhost:3000` and a
  spec was pinning that).
- **`publicAppLink(path)`** is the form that is shown, and it is **derived from**
  `publicAppUrl` rather than built beside it. The file's original honesty rule — label and
  clipboard must be the same string — survives in the only form that still holds: the label
  is exactly the copied link minus a prefix that changes nothing about where it goes.
- **The `inviteLink` alias is deleted.** Which form you want is the entire question, and an
  alias that answered "the invite link" hid it. Three screens now hold the invite **path** in
  state rather than a rendered string, so each use derives its own form.

### §B — The covers are HTML rendered from the app's real CSS, not hand-cut SVG

The invitation cover was `.join-ticket` transcribed into SVG coordinates, and it had already
shipped one defect that only a rendered PNG could show (`text-anchor="end"` is the LEFT edge
under `direction="rtl"`). That is the failure `mockups/tools/inline-app-css.mjs` exists to
prevent one layer up.

So `scripts/og-covers/*.html` are now rendered by `gen-app-icons.mjs` **with
`styles/tokens.css`, `App.css` and `screens/shared-itinerary.css` inlined**, and screenshotted
at 1200×630. The invitation cover cannot disagree with the join screen any more, and the live
one cannot disagree with the reader page. The cutter also asserts each PNG comes out
1200×630, since the last two defects in these assets were both invisible in the source.

### §C — "Too small" was a base-width question, not a scale one

Measured: **the ticket is 197.5px tall at any width in the phone range** — its content does
not wrap — so the height budget alone fixes the scale, and a wider base is free:

| ticket base                  | max scale in the budget | fills                          |
| ---------------------------- | ----------------------- | ------------------------------ |
| ⁦300px⁩ (what shipped)       | ⁦2.51×⁩                 | **⁦63%⁩** of the cover's width |
| ⁦390px⁩ (a real device stop) | ⁦2.51×⁩                 | **⁦82%⁩**                      |

It now renders at 390px, ADR-0017's secondary width. **Bumping the scale would not have
fixed it** and is the thing I would have done without measuring.

### §D — The live share gets its own cover, and it is the reader page

Three URLs, three covers. `/s/<code>` is now the reader's **own** top — `.sh-hero`,
`.sh-kicker`, `.sh-title`, `.sh-live-dot`, `.sh-story`, `.sh-days-head`, full bleed and
cropped at 630 so it reads as a page that continues. Its wash is the reader's **teal** radial
where the other two carry the amber one, which is the strongest thing telling them apart —
and it is the shipped screen's own spend, not a new one (teal is location, ADR-0028).

### §E — **§2's paper band is withdrawn, and its number was measured against the wrong thing**

> _"Do you think that the dark mode + white paper footer go together well? Do we want it
> changed?"_

§2 justified the band by comparing `--paper` to the chat **bubble** (⁦12.48:1⁩ in a dark chat)
and concluded a cover needs a bright region or it has no edge. But **the bubble is not what
sits under the image** — the card's own text panel is, and it is near-white in a light chat:

|                                              | vs. light chat | vs. dark chat |
| -------------------------------------------- | -------------- | ------------- |
| `--paper` band vs. the card's **text panel** | **⁦1.04:1⁩**   | ⁦14.08:1⁩     |
| `--board` art vs. the card's **text panel**  | ⁦16.22:1⁩      | ⁦1.11:1⁩      |

So in a light chat the band and the panel were one continuous light block: **the band
destroyed the boundary it was added to draw.** In a dark chat it did buy an edge, and drawing
four treatments at the real ⁦278px⁩ card width answered whether that was worth it — it is not.
The artwork's own content carries the card, and a bright bar under it reads as a caption strip
bolted to a picture. There is no way to buy an image boundary in a dark chat without a bright
region, and the boundary turned out not to be worth buying.

What the band carried in words was redundant anyway: the card's own title already says
`הוזמנת ל…` on an invite and names the app on the homepage.

**The live cover keeps a bright half and that is not an exception** — it is the reader page's
own body under its masthead, i.e. content rather than a device. Which is the general lesson:
a bright region earns its place when it is part of the thing being shown.

### What did not change

The strings, the three-URL routing, the header sets, the throttle, the escaping, and the
notification badge. `og:image:alt` was reworded per cover, since there are three now.
