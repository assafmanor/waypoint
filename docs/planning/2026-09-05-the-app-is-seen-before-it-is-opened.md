# 2026-09-05 — לפני שפותחים אותה: link previews and the notification's white rectangle

Design session. Two owner reports, one subject, one mockup:
[`mockups/the-app-is-seen-before-it-is-opened-v1.html`](../../mockups/the-app-is-seen-before-it-is-opened-v1.html).
No ADR yet — the strings are answered, the cover ground is a recommendation
awaiting the owner. Nothing was built.

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

## Still open — the one fork the mockup exists to settle

**Which ground the cover uses.** The measurements make this less of a taste
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

## What the build needs, when it is approved

Not built, and scoped in `docs/backlog.md` under **"The app outside the app"**.
The parts that are not obvious:

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
- **`formatTripDates` moves to `packages/shared`** with `APP_LOCALE`. It lives in
  `frontend/src/lib/time.ts` and the description needs its `prose` style
  server-side. A second date grammar for one surface is the duplicate rule 8
  forbids — and `proseTripRange`'s en dash is the app's own convention, so the
  OG description inherits it rather than inventing `עד`.
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
