# 2026-09-05 — לפני שפותחים אותה: link previews and the notification's white rectangle

Design session **and build**, same day. Two owner reports, one subject, one mockup:
[`mockups/the-app-is-seen-before-it-is-opened-v1.html`](../../mockups/the-app-is-seen-before-it-is-opened-v1.html).
The owner approved the strings, then the cover ground and the whole plan
(_"Alright let's do this"_), and it shipped as
[ADR-0220](../decisions/0220-a-pasted-link-is-the-app-before-the-app-is.md).

## The reports

> _"I want to make the app more professional looking and feeling. That includes
> adding meta and whatnot so that sharing links to the app appears with the logo,
> a title, and maybe some short description. That includes specifically for:
> homepage, trip invitation, trip sharing (live). That should work on WhatsApp
> etc. Also try to think of the texts that appear, please consult me. Try to
> avoid using the dot separator and em dashes."_

> _"The notifications show a big white rectangle instead of the app's logo (it
> should appear as black and white I guess)."_ — with two screenshots: the Android
> shade row (the large icon correct, in colour) and the status bar (a solid white
> square where the app's mark should be).

## What reading the code settled before anything was drawn

- **The white rectangle is not a missing asset.** `frontend/src/sw.ts:165` sets
  `icon: '/pwa-192.png'` **and** `badge: '/pwa-192.png'`. Chrome hands `badge` to
  Android as the small icon; Android throws the colour away and paints the
  **alpha channel** in the status-bar colour. The alpha of a full-bleed tile
  (ADR-0087's 2026-09-03 amendment made every icon full-bleed on purpose) is the
  tile. So the report is the asset working exactly as specified, the fix is one
  new monochrome asset plus one line, and the large `icon` needs no change.
  "Black and white I guess" is not a preference — Android has ignored the small
  icon's colour since API 21.

- **There are no `og:*` tags at all**, so this is not a tuning job. And they
  cannot be client-side: a preview crawler runs no JS, so the shell has to be
  answered with the tags already in it. The backend already serves the SPA
  (`main.ts:66`, `AllExceptionsFilter`), which is what makes per-route tags
  possible at all.

- **The invitation cover cannot name the trip.** An `og:image` is one PNG cut at
  build time. Whatever identifies a trip has to live in `og:title`/
  `og:description`, which is why the strings mattered more than the artwork.

- **`.join-ticket` already means "invitation" in this app** (`App.css:1403`), so
  the invitation cover is that shipped tree enlarged, not a second invitation
  graphic. Rule 8: the alternative would have gone out of step with the join
  screen the first time either changed.

## Forks put to the owner, and the answers (2026-09-05)

| Fork               | Answer                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Homepage strings   | **Promise in the title** — `Travelive - כל הטיול שלכם במסך אחד` / `מה עכשיו, מה הבא בתור, ואיפה כל ההזמנות, בזמן שאתם שם.` |
| Invitation strings | **Invitation names the trip** — `הוזמנת לטיול ${name}` / `${dest}, ${dates}. ${n} נוסעים כבר בפנים.`                       |
| Live-share strings | **Trip name plus what it is** — `${name} - הלו״ז החי` / `${dest}, ${dates}. לינק שמתעדכן עם הטיול.`                        |
| How many covers    | **Two** — a brand cover for the homepage and the live share, an invitation cover echoing the join ticket                   |

The privacy consequence was stated with the question rather than after it: with
the two naming options, the trip's name, destination and dates are fetched by
WhatsApp's own preview servers and are visible to everyone in the chat the link
is pasted into. The owner took that trade for both the invitation and the live
share. A third option that revealed nothing was offered and declined.

## The one fork the mockup existed to settle — answered by its own numbers

**Which ground the cover uses.** Approved 2026-09-05; the recommendation stood. The measurements make this less of a taste
question than it looked, because the failure is symmetric:

| Ground                                    | vs. light WhatsApp bubble | vs. dark WhatsApp bubble |
| ----------------------------------------- | ------------------------- | ------------------------ |
| Board (the app icon's own tile)           | ⁦17.9:1⁩                  | **⁦1.25:1⁩**             |
| Paper (ADR-0087's sanctioned bright tile) | **⁦1.15:1⁩**              | ⁦12.48:1⁩                |
| Board + a paper band (recommended)        | ⁦17.9:1⁩                  | ⁦12.48:1⁩                |

No single ground clears the ⁦3:1⁩ graphic floor in both chats — a dark cover on a
dark chat is a hole where the image should be, and a paper cover on a light chat
melts into the bubble. A two-region cover needs only one region with an edge,
which is what the band buys, and it is the reason it is a recommendation rather
than a hedge.

## What the render changed, and it is most of the design

Four of the five findings changed a decision rather than a pixel. Written down
because none of them is recoverable from the diff:

1. **The cover printed the card's own title.** `כל הטיול שלכם במסך אחד` was drawn
   on the cover and is also `og:title` — the same sentence twice in one bubble,
   one line apart. Obvious on screen, invisible in source. The cover now carries
   the tagline that already exists for exactly this job: `APP_TITLE`'s and the
   manifest's `מרכז שליטה לטיול` (ADR-0170), minus the `·` the owner asked to drop.

2. **The approved invitation wording stuttered.** `הוזמנת לטיול ${name}` reads
   `הוזמנת לטיול טיול הבוגרים של כיתה יב3 ליוון` for a name beginning with
   `טיול`, and the clean case (`יפן 2026`) would never have shown it. Now
   `הוזמנת ל${name}` — which is the app's own existing grammar, not a new one
   (`הצטרפתם ל${tripName}`, `i18n/he.ts`). **This is the crowded-case rule paying
   for itself on copy rather than on layout.**

3. **The invitation cover contradicted the recommendation in the same file** — it
   had been drawn on a pure board while §2 was rejecting exactly that. Both
   covers now share the band, and the invitation gains from it the thing the
   ticket cannot give at card scale: `הזמנה לטיול` is ⁦10.5px⁩ inside the ticket's
   own badge, i.e. decoration, and ⁦40px⁩ on the band, i.e. a word.

4. **The ticket at ⁦2.6×⁩ was clipped by the canvas** — the perforation, the
   avatars and `החבורה כבר בפנים` fell outside ⁦630px⁩ and were eaten by
   `overflow: hidden`. ⁦1.85×⁩ fits, and the measurement table now **asserts** the
   fit against the canvas's own bottom rather than trusting the arithmetic in the
   CSS comment, since the arithmetic is what was wrong.

5. **`11–22 בספטמבר` inside a Hebrew-leading description renders `22–11`.** The
   same ADR-0118 defect `day-scheduling-grammar-v1.html` found shipped. Proved by
   comparing the painted x of the two numbers — ⁦Δx = −18px⁩ raw, ⁦+18px⁩ with
   `U+2066`/`U+2069` — and not by looking, because at ⁦12.8px⁩ in a bubble nobody
   orders four digits by eye. A `<meta>` tag carries the isolate characters like
   any other text, so the fix is available where it is needed.

Two mockup-mechanics defects worth the note as well, both caught by rendering:
the contrast column read `NaN:1` for every row (a token's value is `#0e1729` and
the parser only handled `rgb(...)`), and an element screenshot of §3 came back
**blank** while the section measured ⁦426px⁩ tall and painted fine for a person —
the bidi probe's `left: -2000px` child had no containing block and was widening
the RTL document.

## What the build needed — and the one thing this note got wrong

Built 2026-09-05. The parts that were not obvious, with the correction first
because it is the useful part:

- **One renderer, two entry points.** A `@Get('/')` + `join/:code` + `s/:code`
  shell controller **and** `AllExceptionsFilter`'s existing SPA fallback for every
  other app route. `useStaticAssets` must gain `{ index: false }` or
  `express.static` answers `/` before the router ever sees it.
- **The two code routes keep `PUBLIC_SHARE_HEADERS` and the ⁦20/min⁩ per-IP cap**
  the JSON reads already carry (ADR-0213 §5, B-10). An unknown code gets the
  generic app tags — never an answer that can be told apart from a real one, or
  the shell becomes the existence oracle the JSON route refuses to be. The trip
  name is HTML-escaped.
- **A cheap `previewByCode`.** `SharingService.byCode` runs the full projection,
  which generates a narrative; a crawler must never be able to trigger that.
- **`formatTripDates` does NOT move to `packages/shared`, and this note said it
  would.** It was flagged to the owner as the one shared-file change worth
  knowing about in advance, and reading the code killed it: that package's own
  `CLAUDE.md` forbids product formatting there in as many words (_"no ambient
  locale — `APP_LOCALE` is the frontend's"_), and **the repo had already answered
  this question**. The itinerary PDF is a server-rendered Hebrew surface and it
  keeps its words in `itinerary-pdf.copy.ts`, whose docblock explains that a
  second locale consumer is a constraint rather than a preference. So what moved
  to shared is the **shape** — `tripRangeShape`, a four-case discriminant with no
  locale in it, the same form as `eventEndBoundary` — and the month names stayed
  with each renderer. The backend's come from `Intl` with `he-IL` rather than a
  hand-typed table, which is the only way the two are identical by construction
  rather than by review. `proseTripRange`'s en dash is the app's own convention,
  so the preview inherits it rather than inventing `עד`.
- **Two assets**, `og-cover.svg` and `og-invite.svg`, cut to PNG by
  `scripts/gen-app-icons.mjs` — already the single cut for every raster icon
  (ADR-0087), so this is an entry in its list, not a new script.
- **One badge asset** plus the `sw.ts` line.

## Deliberately not taken

A **per-trip generated cover** (the trip's name, destination and route drawn into
the image). It is a Chromium render per crawler hit, on a page whose whole
`no-store` posture (ADR-0213) forbids caching the result, and crawlers give up
fast. The card's _text_ already carries the specifics, which is what §4 measures.
On the backlog, not in this round.

## Built — what the two verification passes found

The mockup's five findings are in the ADR. Two more arrived after it, from steps
a mockup cannot take, and both are worth the note because they name the limits of
the format rather than a mistake in it.

**Hand-transcribing CSS into SVG lost what the mockup had right.** The invitation
cover is `.join-ticket` at ⁦1.85×⁩, and in the mockup that is the shipped rules
doing the work. In `og-invite.svg` it is coordinates, and the first cut used
`text-anchor="end"` for right-aligned Hebrew — but SVG resolves the anchor against
the **inline-base direction**, so under `direction="rtl"` `end` is the LEFT edge.
Every Hebrew line pinned its left edge and flowed rightward out of the pass:
`יוצאים לדרך` ran ⁦200px⁩ past the ticket and the avatars landed on
`החבורה כבר בפנים`. Invisible in the markup, obvious the moment the PNG was
opened. **This is the cost the design-mockups skill warns about, arriving one
layer down** — the mockup inlines real CSS precisely so it cannot lie, and the
asset cut from it has no such protection.

**And a live run found a regression the unit tests were happy with.** The built
app was served from a real `backend/public` and fetched with WhatsApp's user
agent. `/join/<code>` now reaches the database to name a trip, so it gained the
same ⁦20/min⁩ per-IP cap the JSON reads carry — and it had **none** before. A group
of friends behind one NAT opening the same invite would have been handed the raw
error envelope where the join screen used to be. `TOO_MANY_REQUESTS` joined 404
and 401 in the exception filter's shell fallback: the guard has already rejected
the request, so the work the cap protects is not done either way, and the app can
show its own failure state. A programmatic fetch still gets JSON.

The rest of the pass confirmed rather than corrected: the three URLs' tags
against a seeded trip, the header set per route, an unknown code answering with
the generic tags at 200 (no existence oracle), a trip renamed to
`Osaka" /><script>alert(1)</script>` escaped in both `<title>` and every tag, and
the badge rendered **through Android's own rule** — the PNG used as a mask for a
white slot — beside the old asset, which reproduced the owner's white rectangle
exactly.
