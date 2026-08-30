# The share control grants two different things

**Date:** 2026-08-30
**Status:** built the same day
**Decision record:** [ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md), 2026-08-30 amendment
**Mockup:** [`mockups/sharing-and-inviting-are-one-control-v1.html`](../../mockups/sharing-and-inviting-are-one-control-v1.html)

Owner, on the sharing feature merged that morning:
_"The share button should be both for sharing the trip and inviting (let's mockup this)."_

## The problem, stated once

The app hands out two public links and treats them as unrelated features. `/join/<code>`
([ADR-0067](../decisions/0067-revocable-code-invites-and-removal-blocks.md)) adds a person to
the roster — a `Membership`, full live data, edit rights — and lives at the foot of Trip
Settings, past the roster and the removed-members list. `/s/<code>` (ADR-0213) hands a
stranger a revocable projection and no account, and its control sits on the trip header and
every All Trips card.

"Send my sister the trip" and "add my sister to the trip" are one sentence in Hebrew and two
screens in the app — and the control labelled `שיתוף` is the one people press.

## What was decided

**The audience is the sheet's first question.** `למי זה הולך?` above everything the sheet
already asks, with the body branching under it. Not a third button beside `לינק חי` and
`PDF`: those two are two formats of **one** grant, and a row of three teaches that all three
are interchangeable. The cost of that lesson is asymmetric — a peek can be revoked, a person
in the trip is in it.

**Join is the default.** It is the common audience for a live trip and the one that could not
be reached without leaving the screen.

**No new mechanism.** The fork is a second `ChoiceGrid` over the same `.choice-card` the
detail levels use. `ChoiceGrid`'s existing `lead` field now renders in the grid layout too,
so a card can draw an `Icon` instead of a string glyph — a generalisation of a field that was
already there, not a second card shape.

**One link component, three hosts.** `ui/TripLinkRow.tsx` serves both branches of the sheet
and Trip Settings, rather than a second copy of "the trip's link". It is neutral: the
`.invite-box` it replaces paints `--plan-tint` and a dashed violet border on a screen that is
not Plan mode, spending a hue [ADR-0028](../decisions/0028-plan-violet-color-budget-dark-ready.md)
reserves.

**Authorization is untouched, and that is the point.** `POST /trips/:id/invite` was already
get-or-create for any member and `…/invite/rotate` already admin-only — the same split this
sheet already drew for the read-only link. A peer sees the invite branch in full without the
rotate row.

## What rendering the mockup changed

Three things, and none was visible in the code.

**Emoji were doing a control's job.** The first draft marked the two audience cards `🧳`/`👀`
via `GLYPH`. The design language's rule is "emoji are content, icons are UI", amended twice —
_a glyph with a sibling control already drawing an icon is a control_ — and `GLYPH` is
deliberately down to one entry. They are `Icon`s now, and `eye` was added to the set because
nothing in it meant "look".

**The sheet's spacing was one flat number.** `.share-sheet` set `gap: 12px`, so a question sat
exactly as far from the control answering it as from the next subject — the same as having no
grouping at all, and most of why the sheet read as a stack of grey slabs. It is now 16px
between groups and 8px inside one, both off the spacing ramp, and the redesigned sheet comes
out **shorter** than today's (428px against 490px) despite asking one more question, because
grouping removed two floating blocks.

**A missing manifest entry hid the spacing for three rounds.** `form-actions.css` owns
`.modal-form` — the flex container the sheet's gap lives on — and it was not in the mockup's
`APP-CSS` manifest, so every block rendered at a **0px** gap while the app's own was 12px.
Found by a probe reading `rowGap` off the live DOM, not by looking at the screenshot. The
generalisable lesson is the one ADR-0097 already carries: a mockup argues from the CSS it
inlined, so an incomplete manifest is an argument from CSS the app does not have.

## Rejected, by name

- **A link that lets the recipient choose** — it hands the authorization decision to the party
  that does not hold it, and inverts ADR-0067's "the code **is** the grant".
- **A shortcut in the sheet pointing at Trip Settings** — it keeps the long journey and adds a
  sign to it.
- **Borrowing the hard/soft grammar for the two audiences.** It fits the meaning almost
  perfectly (one is a commitment, one is provisional) and was refused anyway: that grammar
  belongs to events (ADR-0011), and spending it on something that is not an event teaches that
  dashed means "read-only" rather than "movable" — the same devaluation the colour budget
  forbids.

---

# Addendum · six more reports on the shared page, and a seventh about the card

**Date:** 2026-08-30, later the same day

The share feature merged that morning drew seven reports. Six were fixed in
[ADR-0213](../decisions/0213-a-shared-trip-changes-emphasis-and-print-is-its-own-rendering.md)'s
second amendment; the seventh became
[`mockups/the-trip-card-has-room-for-one-more-control-v1.html`](../../mockups/the-trip-card-has-room-for-one-more-control-v1.html)
and [ADR-0033](../decisions/0033-all-trips-home.md)'s.

## What the six had in common

Four of them were one mistake in different costumes: **a line the server composed was treated
as if it were a single value**. `dir="auto"` sniffs a direction from content, so a route line
whose first stop was Latin laid out left-to-right, putting the origin on the left with the
arrow pointing back at it — while the identical line with a Hebrew first stop read correctly.
The same shape was wrong on day summaries, the appendix and the route strip.

The remaining two were about **what a derivation could not see**: a leg's endpoints live on
its `Booking`, so the day title could not name the day's first and last legs; and a mode was
in the contract as a `z.string()` that neither renderer read, so a walk and a drive printed
identically.

And one was a font rule the design language already states: `.pdf-subtitle` set the whole row
in JetBrains Mono, which ships no Hebrew, so `12 ימים · עודכן` printed as boxes in a container
whose only monospace is Liberation Mono.

## The seventh, and why the answer was not the one proposed

_"The share icon is taking much space and is causing a line overflow. Perhaps we need a long
click instead?"_ Measuring first inverted the answer. The share is expensive; the **status
chip** is more expensive, and it is the only one of the card's three fixed tenants that
repeats something already beside it. Moving the chip into the meta line gives back more width
than deleting the share entirely does. The long press was drawn and measured rather than
argued about, and rejected as the default on discovery grounds — it stays the right fallback
if a device pass finds the card still tight.

The general lesson is the one the mockup skill exists for: **the reported symptom named the
newest thing on the card, and the newest thing was not the biggest.** Measuring all three
tenants took one render and changed what gets built.
