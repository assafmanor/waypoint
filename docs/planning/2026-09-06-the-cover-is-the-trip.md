# The cover is the trip — per-trip link previews, and a bidi fix the screenshot found

**2026-09-06.** Follows [`2026-09-05-the-app-is-seen-before-it-is-opened.md`](2026-09-05-the-app-is-seen-before-it-is-opened.md).
Decision record: [ADR-0220](../decisions/0220-a-pasted-link-is-the-app-before-the-app-is.md)'s
2026-09-06 amendment (§F–§H).

## What was asked

Three messages off a real WhatsApp thread, all one gap:

1. _"I noticed that it doesn't render the trip's icon."_
2. _"If you're already getting info dynamically like the trip's icon, why not also show the
   trip's name instead of a generic `יוצאים לדרך`?"_
3. _"Also in the live sharing preview I think."_

The card's **text** had named the trip since the day it shipped. The **picture** never did:
one PNG per surface, cut at build time, served to every crawler. So an invitation to Georgia
and an invitation to Iceland were the same boarding pass, and the live share's masthead printed
the wordmark in the slot where the reader page puts the trip's own icon and name.

## What shipped

The two shared covers are rendered per request from the **same templates** the build-time
cutter uses, filled with the trip's facts instead of `defaults.json`'s generic text. The
picture in the chat is now the screen the link opens.

- `scripts/og-covers/*.html` gain `{{…}}` slots. Two fillers, both throwing on an unknown slot.
- `og-cover.template.ts` reads the cover markup, the app's three real sheets and the brand
  mark off disk (the `Dockerfile` copies all of them), inlines the app's faces, and fills.
- `og-image.service.ts` screenshots `.og-cover` and caches by a hash of what is drawn.
- `RenderBrowserService` — `PdfBrowserService`'s pool, **extracted** so one Chromium and one
  `PDF_RENDER_CONCURRENCY` serve the paper and the covers.
- `GET /og/join/:code.png` and `/og/s/:code.png`, on the shell controller that already
  resolves those codes, with its throttle, its headers and its refusal to be an oracle.

## The four things worth carrying forward

**1 · The backlog line's objection was half right, and the halves are different.** It deferred
this partly because _"`no-store` forbids caching the result"_. `no-store` binds intermediaries
and clients; it says nothing about what our own process may hold — and a cover is not the
response, it is a pure function of five trip facts. Keyed on a hash of exactly those, staleness
is **structurally impossible** rather than carefully avoided: change the icon and the key
changes, and `og:image`'s `?v=` changes with it, so every crawler's own cache is correct with no
invalidation path anyone can forget to call. The half that was right — crawlers give up fast —
is why a failed or slow render falls back to the committed PNG instead of erroring.

**2 · An isolate belongs around the numeric island, never around the sentence holding it.**
ADR-0220 §4 measured `11–22 בספטמבר`, found the run painting as `22–11`, and wrapped
`ltrIsolate` around `heTripRange`'s **whole return value**. An isolate forces a direction on
everything inside it, so on a cross-month range — two Hebrew date phrases — both halves flipped,
and the owner's own screenshot read `גאורגיה, באוגוסט 5 – בספטמבר 28`.

The measurement was real and the generalisation was not. `heTripRange` returns four shapes and
exactly one has a neutral between two numbers; the isolate now goes there and nowhere else.
Both shapes were re-measured in a browser (painted x of each number as a whole token — a
per-character sort is the wrong instrument, because digits run left-to-right _inside_ a number
and it reports `28` as reversed).

**3 · A count and a row of faces are the same fact.** The first render drew a fixed row of
three avatars beside `נוסע אחד כבר בפנים`. Caught by the owner looking at the image, not by
anything in the suite. `INVITE_AVATARS` (glyph, colours, cap) moved to `@waypoint/shared` and
both renderers build the row from it — as `DEFAULT_TRIP_ICON` did in the same change, for the
same reason.

The companion defect: `1 נוסעים כבר בפנים`, in the same screenshot. `t.shell.join.members` has
had the singular since the join screen shipped and only the preview's copy lacked it. A dual
(`שני נוסעים`) was drafted here and **dropped** — the screen does not say it, and a preview that
improves on the screen it advertises is drift by another name.

**4 · The element's own CSS decides which range a slot takes.** The live cover's `.sh-dates` is
`--font-mono`, which is JetBrains Mono and ships **Latin only** by design, so the prose range put
every Hebrew month name into a fallback face. It takes `heTripRangeNumeric` (`05.08–28.09`);
the ticket's body-font `.ticket-meta` keeps the prose. Both are what their own screen shows.

## The rule the covers now have

**Nothing on a cover may go stale.** It is cached by us and then by every chat app that ever
fetched it, so the ticket's `בעוד 6 ימים` countdown is dropped, the reader's `עודכן לפני…` is
not drawn, and the face row is capped rather than being a live roster. An icon, a name, a
destination and a date range still read true a month later. This replaced `README.md`'s
**"No trip name, ever"**, which read as a privacy rule and was only ever a consequence of
cutting one PNG at build time.

## Not done

- **Nothing was seen in a real chat app.** Every render here was a local screenshot. What a
  per-trip cover looks like arriving in WhatsApp, iMessage and Slack — and whether `?v=`
  actually defeats their caches on a renamed trip — is a field pass.
- **The colour emoji font is unverified in the built image.** The container had no emoji
  coverage at all (`backend/assets/fonts/README.md`), so `fonts-noto-color-emoji` is installed
  for the covers; the reasoning that it cannot reach the PDF is a property of `@font-face`
  beating system fallback inside a declared `unicode-range`, and `pdf-smoke` is what would say
  otherwise.
