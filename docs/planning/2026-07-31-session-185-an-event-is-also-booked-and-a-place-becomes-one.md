# Session 185 — an event is also booked, and a place becomes one (2026-07-31)

The build of [ADR-0136](../decisions/0136-an-event-can-also-be-booked.md) and
[ADR-0135](../decisions/0135-a-place-becomes-an-event-or-a-booking.md), which had been
designed across sessions 181–184 with no code behind either. Both backlog lines are pruned.
Three commits plus docs: the primitive, the form, the map.

Two ADRs were **amended in place** while building, both because the design was wrong about
something a keyboard finds and a mockup does not. Neither got a new ADR — that is the
"amend, don't accumulate" rule, and both amendments are in the section they correct.

## ADR-0136 §1 said "no new primitive, and none needed". It was wrong.

It read _"the idiom exists"_ as _"the component exists"_. The idiom existed **four times**,
hand-rolled in `map.css`: `.map-maybes`, `.map-scopechip`, `.map-facets`, `.map-nearchip` —
and three of their on-states were the same three declarations written out three times. The
form's row would have been the **fifth** copy, in a form, outside `map.css`.

That is precisely the pile root rule 8 exists to stop, and the same warning
`frontend/CLAUDE.md` already carries for `ui/feedback/` ("this family replaced roughly six
one-off copies; don't add a seventh"). But rule 8 also says **ask first** when generalising
is a substantial refactor rather than a small extraction, and four shipped call sites on the
tab holding a billed `google.maps.Map` is not small. So it was costed and put to the owner
before any code: extract now, or ship the fifth one-off with a backlog line. **The call was
extract, and migrate all four.**

Reading the four before costing them turned up two things the design had not:

- **`.map-facets` was never an `aria-pressed` toggle.** It has no such attribute. Its
  on-state says _filtering is live_ and its tap **opens** the facet strip. Putting it on a
  pressed primitive would announce a disclosure opener as pressed, which a screen reader has
  no way to see through. So `ToggleChip` carries a `semantics: 'toggle' | 'indicator'` axis
  and only a toggle emits `aria-pressed`. **Three real toggles, one look-alike** — which is
  the sort of thing you only learn by reading the call sites instead of counting them.
- **Two of the visual differences are semantics, not drift.** `.map-nearchip`'s teal is a
  **location** affordance (ADR-0109 §6-7 / ADR-0028) and `.map-maybes`'s dashed off-state is
  **provisional** (ADR-0110 §2). A primitive that flattened either would have been a
  regression dressed as cleanup, so they survive as tones. What _was_ drift — `.map-maybes`'s
  7px/12.5px/600 against the `.choice-pill` grammar beside it in the strip, undocumented and
  unmeasured — is corrected.

`.map-addmaybe` was deliberately **not** absorbed. It is a create, so it has no on-state to
carry, and ADR-0135 §1 had already decided it is the footer's control.

The primitive owns **appearance only**; where a chip sits and how it enters or leaves stays
with the screen, through `className`. That is what keeps `map.css`'s commented
`.wp-snapsheet-headrow .map-nearchip` visibility/transition machinery matching after the
migration — the one part of those rules that was never about how a chip looks.

**Cost, as predicted:** ~100 lines of `map.css` deleted, four call sites, and seven test
assertions that reached for these chips by class. One was an exact-array equality on the
className strings of `.map-controls > *`; it now reads each control's identifying `map-*`
class instead, because that assertion is about _which three controls are in the row_, not
about how a chip is styled.

## The owner caught a false sentence in ADR-0136 §2

§2 ended: _"A train station opens on `transport` and guesses `flight`; a train is one tap on
the category the form was showing anyway."_

**There is no category to tap.** `EventCategory` has a **single** `transport` value while
`BookingType` has `flight`, `train` and `other`, and `BOOKING_TYPE_TO_CATEGORY` maps both
transport types back to that one category. So the correction path the ADR promised did not
exist: a train booked from this form arrived as a `flight`, and the only fix was the
booking's own type picker on a different screen.

I costed three ways out and the owner chose the third, with a mockup first.

1. **Keep the collapse** — the ADR as written, with the honest edge already in Consequences.
2. **Refine from the icon** — `ICON_SET`'s transport group has four rail glyphs, so
   `🚄 → train`. Genuinely additive and never worse. Withdrawn once `אחר` entered the design:
   `BOOKING_TYPE_ICON.other` is `📄`, so a booked bus ride would have taken a document glyph.
   Recorded because the _shape_ of it was right — read a signal the human already controls —
   and only the third option's arrival made it lose.
3. **Ask, for that one category.** Chosen.

**Why this is not the schema question §1 retires**, which is the whole justification. That
question — "event or booking?" — is asked of **everyone, before they can type**, and it
demands they know the model. This is the **one genuine ambiguity in the derivation**, asked of
the one person who has it, at the moment they have it, with a default already chosen. Nine
categories still state their guess and never ask. A picker for _every_ category stays
rejected, and §2's amendment says so in as many words so a later reader does not read this as
the fence coming down.

The design, drawn in `event-also-booked-v1.html` and read back from its live DOM:

- **Three pills** in the form's own `.choice-pill` grammar, at the 44px floor, inside the
  `Collapsible`, **above** the code — it is the more consequential of the two fields, and the
  statement at the foot of the block summarises both.
- **Both alternatives visible.** A two-state cycle button would have hidden that `רכבת`
  exists, which is fatal for a _correction_ affordance: the person who needs it is the person
  who does not know it is there.
- **No field-label.** The pills say what they are and the statement below names the result; a
  label would be the third place one screen says "transport". Same 20px argument as §1's row.
- **`🚌` for `אחר`**, not `BOOKING_TYPE_ICON.other`'s `📄` (owner's call). All three pills
  answer "which transport", so a document among two vehicles reads as a different kind of
  answer. It costs nothing elsewhere: a linked booking's Index row borrows the **event's**
  icon and only falls back to the type's.
- **A nullable override, not a fourth `*Touched` guard.** `bookingType: BookingType | null`,
  where `null` re-derives and a category change clears it — the idiom this form's zone
  `override` already uses. ADR-0136's Consequences had said a third guard is the moment to
  generalise; this declines to add one at all, which is the cheaper answer to the same
  warning.
- **`אחר` is soft.** It is not a span type, so `bookingDefaultKind` makes it soft while
  flight and train are hard. Deliberately not special-cased — commitment has one source
  (§4), and this row must not become a second opinion about it.

Measured on the real `.modal-form`: **482 → 560 → 642 → 696px**. The pills cost **+54px**,
in the one category that asks. Every other booked save is still 642px.

Two smaller copy corrections while in there, both toward the shipped vocabulary rather than
the mockup's: the code placeholder is `קוד אישור · לא חובה` (the app's own name for that
field, `index.form.codeLabel`) rather than `מספר אישור`, and the derived statement names the
type with `t.index.bookingType[…]`, so `hotel` reads `לינה` as it does everywhere else rather
than the mockup's ad-hoc `מלון`.

## The conversion's undo was the hard part, and it is an ordering problem

§3 says the two writes must undo as one. What made it awkward is that **bookings do not live
in the reducer** — they are trip-state's own `useState` — so `TRIP_ACTION.UNDO`'s snapshot,
which restores events and ideas, cannot touch them.

Rather than grow a second optimistic path beside `indexVerbs.createBooking` (rule 8),
`VerbDeps` gained a `bookings` bridge to the two writers that already own that state, and
`reverseRest` took the whole `deps` instead of just `tripId`. One new `UndoDescriptor` kind
covers the whole save, and **it is set last** so it survives the `update` descriptor
`applyUpdateEvent` writes on its way through — undoing a booked save is one action, not the
last of three.

**The order inside that undo is load-bearing twice:**

- **The booking is deleted first**, because that is what clears the event's `bookingId`
  server-side (ADR-0047 §3's unlink). Restore the place before that and ADR-0048's invariant
  nulls it straight back out. There is a test that fails if the two are swapped.
- **`deleteEvents` is the difference between the two shapes.** On a create the linked event
  only ever existed because of the booking, so it goes too. On a conversion the event
  predates the booking and must survive — with its place and category handed back, which
  nothing else can do, because the conversion moved them onto the booking.

`confirm: true` on both compensating writes, since a converted event may be hard by then and
the server's own guard would otherwise refuse the restore.

**Two things a test caught that the design had not named.** A failed link left the booking
orphaned — the exact half-applied conversion §3's Consequences warns about — so it is now
deleted, and the stale `update` descriptor cleared with it: offering to reverse a write that
never applied is worse than offering nothing. And `applyUpdateEvent` had to start reporting
whether it applied, which incidentally stops `verbs.update` toasting success immediately
after an error toast.

**One gap matched rather than half-fixed.** Undo leaves a consumed idea consumed
server-side: there is no un-consume endpoint (`updateMaybeItemSchema` takes `targetDate` and
nothing else), and the shipped `applySchedule` undo — a bare `{ kind: 'create' }` — has
exactly the same hole. Fixing it for one of two callers would have been worse than leaving
both honest. It is a backlog line and a comment at the site, not a silent asymmetry.

## The map half went as ADR-0135 designed it, §3 included

§3's finding held under the build: this is **not the errand run backwards**. The errand's
whole cost is machinery for surviving a round trip between two screens, and there is no round
trip here — the form opens over the map, on the map's own tab, so `Modal`'s `useOverlay` is
the entire back story. What the errand _was_ owed is the one hook call §3 names, and
forgetting it would have reproduced session 165's failure on a fifth host.

`soleIdeaFor` carries §5, and the ADR asked for its reason to be stated so that an edit has
to argue with it — so the reason is in the function's own comment, including the part the
data does not show: **it is deliberately not day-scoped**, because an idea pencilled in for
another day is still a second intention, and consuming "the one in scope" would eat it
silently.

## Method: four traps, and every one of them failed first

The repo's standing lesson, and it earned its keep again. Each was written as a
reproduction and watched fail against the wrong behaviour before being trusted:

| Reproduction            | What it caught when broken                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| the booked branch       | `verbs.create` called — the save writing an event instead of a booking |
| the conversion's kind   | a soft sightseeing event reading **`🔒 קשיח`** after one toggle        |
| the category default    | `bookedTouched` ignored: the row moving back on after a human said no  |
| the map's two-idea case | the second intention consumed when relaxed to "any idea"               |

Plus three more for the map half: the footer surviving a live errand, the scroll landing on
`center` instead of `nearest`, and the form opening without its place.

**And two test-harness bugs the same discipline surfaced.** Four of the new `EventForm`
assertions first "passed" by reading an **earlier test's** `mock.calls[0]` — the verb mocks
were never cleared per test. And `EventForm.test.tsx` had no `setSimulatedNow` despite every
fixture in it carrying a fixed date, so it was reading the real system clock. Both fixed for
the whole file, not only the new tests.

## Not done here

- **Phase 11** (booking phase labels on pins) and **ADR-0131 §9's long press** — both
  explicitly out of scope, both still open.
- **Un-consuming server-side** on an undo (above). Backlogged.
- **Generalising the `*Touched` guards.** `EventForm` now carries three (`iconTouched`,
  `kindTouched`, `bookedTouched`), which is the moment ADR-0136's Consequences named. The
  transport type declined to add a fourth by being a nullable override instead; the
  generalisation itself is a backlog line.
- **The device pass** both ADRs describe. Nothing here has been seen on a phone, and the one
  thing I would put first is whether the statement moving under the category pill — and now
  under the type pills too — reads as clever or as unstable.
