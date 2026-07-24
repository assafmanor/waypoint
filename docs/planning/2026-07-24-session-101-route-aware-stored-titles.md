# Session 101 — Bug: the shortened route stopped at the components, so a stored title still showed two full airport names and a text arrow

**Date:** 2026-07-24
**Kind:** Bug fix, from a report against the shipped build (screenshot of a real trip's day view). Extends session 95's shortening and the design-language "arrows are SVGs" rule.
**ADRs:** [0059](../decisions/0059-booking-presentation-on-home-and-index.md) **session-101 amendment**, [design-language](../design/design-language.md) (emoji are content, icons are UI).

## The report

On the day view of a live trip, the Stokksnes card's overlap warning read:

> ⚠︎ חופף ל-נמל התעופה בן גוריון ← נמל התעופה הבינלאומי קפלאוויק (קשיח) · 07:15

…while the flight's own card, one row below, read `בן גוריון ← קפלאוויק`. Two complaints in one line: the abbreviation didn't apply, and the arrow was the text `←` rather than the app's SVG.

## Diagnosis

Session 95 shortened place names **in the two title components** (`EventTitle`, `BookingTitle`) and called that "consistency is by component, not by screen". That holds for surfaces that render an **entity** — they have `fromPlaceId`/`toPlaceId` and resolve the route. It says nothing about surfaces that render a **title**.

A transport booking has no name (ADR-0059 §3): `routeTitle` stores `origin ← destination`, full names, with the textual separator. Every surface that only ever receives a title string therefore printed it raw:

| surface                                                | reachable for a flight?                   |
| ------------------------------------------------------ | ----------------------------------------- |
| hard-conflict flag (`EventCard`, `Board`, `EventForm`) | yes — a conflict is with a **hard** event |
| hard-edit / hard-delete confirm gate                   | yes — the gate exists _for_ hard events   |
| ⋯ manage-menu header (Trip card + Plan builder row)    | yes                                       |
| transition row (departure / arrival edges)             | yes — transport is what brackets a day    |
| change-feed narration                                  | yes — a peer editing a flight             |
| toast "scheduled", settle/resolve sheet titles         | no — shelf ideas and soft events only     |

So the bug wasn't one call site. It was that a stored route title had no display form.

## The fix

**1. `lib/route-title.ts` owns route titles in both directions.** `routeTitle` moved here from `booking-edit.ts` (its `arrow` parameter dropped), `parseRouteTitle` reads a title back into `{from, to}`, and `ROUTE_TITLE_ARROW` is the one separator both use.

Parsing a stored string is safe here precisely because the string is ours:

- the separator is **padded with a space on both sides**, so `ANA · TLV←HND` is not a route;
- exactly two parts, both non-empty, or it's not a route — a half route (`routeTitle('TLV','')`) has no separator at all;
- anything unmatched is returned **untouched**. Same failure mode as `shortPlaceLabel`: "no change", never a wrong name.

**2. `ui/TitleLabel` is the display form of a title.** A route title renders as a shortened `RouteLabel` (SVG arrow); everything else passes through. It needs no bookings/places, so it works in a provider (`ConfirmProvider`) and in presentational components alike.

Where the entity IS in reach, the id-resolved route still wins — it reflects a place renamed after the title was stored. `EventTitle`/`BookingTitle` and both day rows now **fall through** to `TitleLabel` instead of emitting a raw string, so "no booking in reach" degrades to a route rather than to debris.

**3. Copy that wraps a title is split around it.** `event.conflictWarn` became `{before, after(time)}`; the two `confirm.*Body` strings lost their `title` parameter (the node leads the sentence). That is the shape for the next sentence that needs a node inside it — not a second interpolated string.

**4. `shortRoute`** (`place-label.ts`) replaces four copies of "shorten both endpoints" (`EventTitle`, `BookingTitle`, `routeDisplay`, `TitleLabel`), so no surface can shorten one half and not the other.

**5. Where only a string can go, it is still shortened.** `shortTitleText` — short names, textual separator — narrates the change feed. The booking detail's accessible name keeps the **full** names: it is the record, and a screen reader isn't width-starved.

**6. `Modal`/`Sheet`/`RowManageSheet` accept a `ReactNode` title,** so a visible sheet heading showing an event's title can show its route with the SVG arrow instead of the primitive forcing a string. `aria-labelledby` still names the dialog by the heading's rendered text.

## The arrow sweep

- `i18n/he.ts` lost `arrows.route`. The **lint guard** now also covers string/template literals in `frontend/src/i18n/**` and template literals inside JSX — previously only JSX text and JSX literal expressions, which is why a `'←'` sitting in the copy file was never flagged. The selectors are named consts in `eslint.config.mjs` and composed per block, because `no-restricted-syntax` is one rule key and a second block for the same files would otherwise silently drop the ADR-0026 clock guards.
- The TimePicker's "nearest round" hint was a CSS `content: '↩'` → now `<Icon name="undo">` in the trailing slot the selected row's ✓ uses.
- `ICONS.fxUp`/`fxDown` (`▲`/`▼`) deleted — unused entries waiting to render low.
- The app's one remaining textual arrow is `ROUTE_TITLE_ARROW`: stored data + screen-reader labels, where an SVG says nothing.

## Tests

- `lib/route-title.test.ts` — `routeTitle` (moved out of `booking-edit.test.ts`), `parseRouteTitle` (round-trip, hand-typed title, half route, unpadded arrow inside a name, three endpoints), `shortTitleText`.
- `ui/TitleLabel.test.tsx` — a stored route renders shortened with the SVG arrow and **no** `נמל התעופה` and **no** text arrow; a hand-typed title is untouched (no `.route` element).
- `ui/domain/EventCard.test.tsx` — the reported case as a test: a conflicting flight's flag shows `בן גוריון` / `קפלאוויק`, no full names, no text glyph, and an `<svg>` in `.arr`.

Full suite **833** passes; `typecheck` + `lint` (0 errors) + `build` green.

## Note on what was _not_ changed

The **stored** title still holds the full names. It is the record and the place-less fallback, and the detail view + the form still show it in full (session 95). Shortening stays display-only, so nothing here needs a migration and nothing can corrupt a name — which is also why the fix had to be at display time: the titles already in the trip that produced the screenshot are long, and no write path would reach them.
