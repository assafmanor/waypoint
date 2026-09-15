# 0229 — In Trip mode the row opens **what you do**; the read is **one tap further**

**Status:** **ACCEPTED AND BUILT** — 2026-09-15, on the owner's _"let's build this, with the photographs, your recommendations"_. The three forks were taken as recommended: the band at **88px**, the summary **off**, and the card **closes** when the read opens. Read the build log at the end before §2.
**Date:** 2026-09-15
**Session note:** [`planning/2026-09-15-the-read-in-trip-mode.md`](../planning/2026-09-15-the-read-in-trip-mode.md)
**Mockup:** [`mockups/the-read-in-trip-mode-v2.html`](../../mockups/the-read-in-trip-mode-v2.html) (v1 is the dated record of the first answer, kept per ADR-0097)

**Amends in place:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §6 — _"No change to how the Trip-mode day card opens. It already expands and that expansion is the read"_ — which was true when it was written and has stopped being true since.
**Completes:** [0223](0223-a-confirmation-code-is-looked-up-not-carried.md) — its mitigation, stated twice, is _"every surface that dropped the code is one tap from the booking that has it."_ On the Trip-mode day that holds for the transition and stay rows and fails for the event card, which is what a booked activity renders as.
**Builds on:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §4 (`EventDetail`/`DetailSheet` — the surface this reaches rather than rebuilds), [0219](0219-a-day-is-a-place-you-can-see.md) §6 (what the read now holds), [0228](0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) (the band this must not join, and why)
**Relates:** [0016](0016-plan-trip-modes-one-surface.md) / [0025](0025-trip-mode-edit-capability-tiers.md) (editing is de-emphasised in Trip, never disabled — a read is neither), [0029](0029-trip-mode-day-scope-gating.md) / [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (the past day and the browsable archive, which is where this matters most), [0138](0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §1 (why the `⋯` sheet is refused), [0028](0028-plan-violet-color-budget-dark-ready.md) (rule 4 — why the label is `--cta`)

## Context

The owner, with three screenshots of the running app — the Trip-mode day with `Jökulsárlón Zodiac Boat` expanded, and the same booking's read in Plan:

> There's a discrepancy between day view (trip mode) and plan day (plan mode), between how we display information about events and bookings. See how the plan day has a way to see info while trip mode doesn't.
>
> We should think how to do this in a way that's convenient and like not a main function probably, because trip mode should be more glanceable, different than plan mode.

Four things reading the code changed about the report, and the third turns a preference into a defect.

**1 · It is not "Plan has a read and Trip does not."** Both surfaces reach the trip's own content in one tap: `HostDocuments` → `HostTasks` → `HostNotes` render inside Trip's expanded card (`EventCard`'s `*Slot` props) and inside `DetailSheet` for Plan. What Trip cannot reach is exactly the half `DetailSheet` names `knowledge` + `facts`: the picture and the summary (ADR-0219 §6), the address, the duration, and the confirmation code. The gap is **the facts**, which are precisely the half the day row deliberately stopped printing.

**2 · The verb band cannot host the reach, and that is structural.** `event-actions.ts`'s own header: _"A quick action answers 'what do I do about this **now**'"_, and every entry is gated on `live(c) = c.today && !c.readOnly`. A row on tomorrow's day or on a past day gets `[]` and `EventActions` returns `null` — **no band at all**. Those are exactly the rows whose facts you want: tomorrow's pickup address, and the finished trip ADR-0040 promises is browsable. A read inside that band would be absent wherever it matters most.

**3 · ADR-0223's mitigation is kept by one row family on this screen and broken by the other.** It deleted the confirmation code from five surfaces on one mitigation, written twice: _"every surface that dropped the code is one tap from the booking that has it."_ On the Trip-mode day that is **true of a `TransitionRow`** (a hotel check-in, a flight edge) and of `UnplacedCommitment` — both are wired to `onOpenDetail` → `BookingDetail`, which `DayView.tsx` already renders. It is **false of the event card**, which is what a booked _activity_ renders as: no tap on it reaches the booking. So one screen carries two row families that disagree about whether a booking can be read, and the family that cannot is the one holding the confirmation code. It went unnoticed because a HARD row's edit warning happens to print the code (ADR-0174 §8's carve-out); a **soft booked** row shows it nowhere.

> **Corrected 2026-09-15, after this ADR was first pushed.** The first draft of this section said the day view had "no path to a booking at all" and that `BookingDetail`'s only callers were `PlanDay.tsx` and `IndexBookingsView.tsx`. Both are wrong: it has **five** render sites — those two plus `Map.tsx` and `DayView.tsx` itself — and `DayView` reaches it from `TransitionRow`/`UnplacedCommitment`. The grep was run and its output was read past the relevant line, which is root `CLAUDE.md`'s _"count the call sites before claiming what a derivation does"_ failing in the one direction it warns about. The defect is real and narrower than claimed, and the narrower version is the sharper one: the inconsistency is **within a single screen**, not between screens.

**4 · ADR-0174 §6 already answered this question, and its answer expired.** _"No change to how the Trip-mode day card opens. It already expands and that expansion is the read."_ True on 2026-08-08. Since then ADR-0219 §6 gave the read a picture and a summary Trip has no way to show, ADR-0223 moved the code **into** the read, and ADR-0228's amendment moved `⋯` onto the face. This ADR is that sentence re-asked against what the read now holds.

## Decision

### 1. The rule

**In Trip mode the row opens what you DO. The read is one tap further, and it is the read that already exists.**

Not a second read surface, not a facts block copied into the card, not a new screen: the same `BookingDetail`/`EventDetail` Plan opens, reached from inside the panel the row already opens. The branch is the one `PlanDay.tsx` already has — a booked event routes to `BookingDetail` (ADR-0172 §1: a linked pair is one context), an unbooked one to `EventDetail`.

This keeps the difference the owner asked to keep. Trip mode's panel stays a doing surface with the group's own content under it; the knowing surface is the app's one read, unchanged and un-duplicated.

### 2. Where the reach lives — the band

**Revised 2026-09-15 on the owner's _"let's be more creative in how we display the information"_.** The first answer was a text row — `להזמנה` over an address, with a caret. It is not wrong and it is timid: it _points at_ the information instead of displaying any of it, which is the half of the report v1 answered and the half it did not. The default changes; v1's row survives only as the measurement baseline and as what a placeless row actually gets (below).

**The panel's knowledge band is a photograph.** The place's shot as a full-width band, the address and its credit over the scrim, and the whole band is the way into the read. A picture answers "what is this" faster than three lines of prose ever will — and the day view is the one surface that already fetches the shot (ADR-0219 §1) and then shows it at 40px inside a badge.

**It is not a new mechanism. It is `.wp-dayhead-shot` at a card density** — the day's own head is already a band with a `<figure>`, an `<img>` and a `<figcaption>` scrim carrying `strong` (what it is) and `span` (the credit, which ADR-0219 §6 makes structural rather than decorative). The proposal renders _that class_; `.rd-shot` overrides a height, a radius and two clamps. A second shot primitive is what this refuses to be.

It still sits **after the verb band and the hard-edit warning, above `HostDocuments`** — the read surface's own sequence with the facts compressed, re-entered after the verbs because Trip mode is doing-first. And it still cannot live _in_ the verb band, for Context 2's reason.

**A place with no photograph gets a sentence, not a grey box** — v1's row, at the 44px floor. Most places have no image (ADR-0166 §11.3: 0 of 7 Tokyo restaurants had one), and an empty band is worse than a line.

#### What makes a richer panel affordable, which v1 never went and checked

`DayView.tsx:698` — `toggle: (id) => setOpenId((cur) => (cur === id ? null : id))`. **The day is a single-open accordion.** One card is open at a time, ever, so the panel's height is paid once per day and never per row. v1's "+54px" was therefore being weighed against the wrong thing: the number that decides is how much of a 640px screen the one open card takes.

**Measured** (360×640 and 390×844, both themes, off the rendered DOM; the frames are cut to a real 640px screen and scrolled to the open card):

|               | card                               | neighbours still on screen |
| ------------- | ---------------------------------- | -------------------------- |
| today         | —                                  | **3** of 4                 |
| v1's text row | ⁦447px⁩                            | **2** of 4                 |
| **the band**  | **⁦482px⁩** (⁦+35px⁩ over the row) | **2** of 4                 |

**The photograph costs no more of the day than the sentence did.** Both spend one neighbour against today; the picture is ⁦35px⁩ more card and the same amount of screen. The band itself is ⁦89px⁩ at the proposed height; the placeless row is ⁦44px⁩; a two-line summary under the band would add ⁦58px⁩, which is why it is off by default.

### 3. Three containers drawn and refused, each for its own reason

Measured in v1 against that file's baseline, and unchanged by the band: the refusals are about _where_ a reach may live, not about what it looks like.

- **A fifth control on the face (ג).** ⁦0px⁩ of height and ⁦26px⁩ of the title at 360 — 191 → ⁦165px⁩, i.e. ⁦13.6%⁩ of the name. The face already holds four targets (badge → map, face → open, `⋯` → Tier-2, chevron), and **ADR-0174 §4 refused exactly this addition on the Plan row for exactly this reason**. Also the wrong register: a face control is a main function, and the owner asked for the opposite.
- **A row in the `⋯` sheet (ד).** Free, and therefore tempting. ADR-0174 §4 already refused it, citing ADR-0138 §1's row menu as a list of **verbs**; the owner rejected the same shape once before, for notes (_"notes don't belong in a menu"_). A thing you open in order to **know** does not belong in a list of things you **do**.
- **The facts inside the card (ה).** ⁦+164px⁩ — and, by coincidence worth recording, the identical number ADR-0174 §4's mockup measured for "expansion in place" on the Plan row. It buys mode parity, which is the thing the owner asked NOT to buy, and it is a second rendering of `bk-facts`. If it is ever wanted, the route is the exported `Fact`/`LocationFact`, never a second list.

### 4. The sheet opens on a closed card

The read is a `Sheet`, so it lands over a card that is still open — and documents, tasks and notes then appear twice, once per layer. **The card closes when the read opens**: one line in the caller (`ctx.toggle`), no branch inside `DetailSheet`.

The alternative — suppressing the host sections in the sheet when it is opened from the day — is a per-caller branch inside the shared shell, which is the shape ADR-0094 is a retraction of. Refused.

## What rendering it found

**v2 (the band), three passes, all one wrong assumption** — that the day head's caption, written for a short day title alone on its line, would hold an address and a credit with a control beside them. (a) The way-in pill painted on top of the credit. (b) Reserving a track for it fixed the overlap and broke the credit instead, ellipsising it from its **start** (`…A 2.0 · Ulrich Latzenhofer`) — so the pill moved to the band's top trailing corner and the caption went back to full width: move the control, do not shrink a licence obligation. (c) Neither line clamped, so a long address ran past the picture and the credit wrapped to two lines, which at 88px leaves almost no photograph. All three would have shipped.

**v1 (the row):**

- **A real confirmation code breaks the hard-edit warning onto two lines.** The stress row carries `#MEGAZIP-T141215488` — the code from ADR-0174 §8's own device report — inside the shipped `.wp-event-hard-warn`, and it wraps. It wraps rather than overflows, so it is not a defect; it is ⁦16px⁩ the card spends on a fact the read states properly as `קוד אישור`, and one more argument for where the code belongs.
- The file's first pass hand-rolled the `⋯` sheet and it rendered as one squashed line — the rule-8 failure a file that inlines the real CSS exists to catch, inside the file whose premise is that it does not invent markup.
- The way-in glyph was `NavArrow` and was wrong; see §2.

## Consequences

- `DayView.tsx` gains the `PlanDay.tsx` branch it does not have (`booking ? BookingDetail : EventDetail`) and one piece of state. No new component, no new overlay, no change to `DetailSheet`.
- The Trip-mode day's two row families stop disagreeing about whether a booking can be read: a `TransitionRow` already opens `BookingDetail`, and now so does the card a booked activity renders as.
- The open card grows ⁦89px⁩ where the place has a photograph and ⁦44px⁩ where it has not — ⁦0px⁩ while closed, which is every row you are not looking at, and the day only ever has one open.
- On a past day and on any day that is not today the read row is the **only** thing in the panel above the host sections, and that is the point (§2 / Context 2).
- `ui/domain/event-card.css` grows ~60 lines, most of it the placeless fallback; the band itself is `.wp-dayhead-shot` plus a height, a radius and two clamps. `day-head.css` is untouched — the head's caption is correct for the head, and the clamps belong to the second host's density.
- The day view starts showing the enrichment photograph it has always fetched at something larger than 40px, which is the asset ADR-0219 bought and this surface never spent.

## The forks for the owner

1. **The band's height** — ⁦72⁩ / ⁦88⁩ / ⁦116px⁩, shipped at **88**. The day head's own number is 116, but a head is the first thing on the screen and this sits mid-list, where 116 pushes the rows after the card below the fold. A control in the mockup's toolbar; a phone in a hand answers it and a desktop screenshot cannot.
2. **The summary under the band** — two clamped lines of what the world knows, ⁦+58px⁩. Off by default: on the ground the picture and the address are what you act on, and the extract is planning knowledge. Also a control.
3. **Whether the card closes when the read opens** (§4), or the duplication is simply lived with as Plan effectively does.

## Rejected

- A fourth mark on the meta line ("there is a booking here"). ADR-0174 §8 closed that line to glyphs and no text, ADR-0028 has already spent its budget, and a booked row is nearly always hard — the lock on the when line says it.
- A picture in the read row. The badge already carries the photograph at ⁦0px⁩ (ADR-0219 §1), and the full hero is in the read.
- Making the badge's tap the reach. It is `מפה`, settled by ADR-0121 §8, and the map is the one destination it may have.
- A long-press anywhere. No hover, no discoverability, and nothing in this app teaches it.
- **A band on every row, open or not.** A day with eight stops becomes a gallery, and that is where "glanceable" genuinely breaks. The band lives in the state you asked to open.
- **The confirmation code on the band.** ADR-0223 is four days old and explicit: the code appears in the booking and in the save warning, nowhere else. The band is the _way to_ the code — which is exactly what was missing — not a second printing of it.
- **A two-sided panel** (`לעשות` / `לדעת`, swapped by a segmented control). The genuinely different structure, drawn in v2 §4 and refused on three counts the drawing turns into numbers: the control sits on _every_ open card even when there is nothing to know, which is the clutter ADR-0228's amendment just removed; the `לדעת` side is a second copy of `bk-facts`, the shape ADR-0094 is a retraction of; and it teaches a second navigation model inside a card when the sheet already answers that question everywhere else in the app.
- **A perforated ticket-stub pill.** Pleasant physicality, but a dashed border is this app's grammar for an _absence_ (ADR-0174 §5) and a radial-gradient perforation is decoration — two separate reasons, each sufficient.
- **A full-height ⁦116px⁩ hero**, the day head's own number. The control exists so it can be _seen_; §2 measures what it costs the rows below.

## Build log (2026-09-15)

### What shipped

- **`ui/domain/PhotoBand`** + `photo-band.css` — the band, extracted from `DayHead`'s own `Shot`, which was the single call site doing almost this job. Root rule 8's "generalise the existing one-off rather than set a second beside it", taken literally: `DayHead` is now its first consumer and renders identically, and `.wp-dayhead-shot` became `.wp-photoband`. Two densities, `day` (⁦116px⁩, ADR-0219 §3's one number) and `card` (⁦88px⁩).
- **`ui/domain/ReadBand`** + `read-band.css` — the band or, with no photograph, the ⁦44px⁩ line. It is the button; `PhotoBand` takes `interactive={false}` there, because a button inside a button is invalid HTML.
- **`EventCard` gains `readSlot`**, rendered after the verbs and the hard warning and above the documents, mounted only while the card is open.
- **`DayView`** resolves the place, the photograph and the booking, and opens `BookingDetail` or `EventDetail` — the branch `PlanDay` already had. `EventDetail` is rendered here for the first time; `BookingDetail` already was.
- **`t.day.read.details`** — `פרטים`. A booked row says `t.hero.toBooking`, the string the lifted hero already uses for the same journey.

### What the build corrected in this ADR

**Context 3 was overstated and is fixed in place** (see the note there). `BookingDetail` has five render sites, not two, and `DayView` was already one of them — reached from `TransitionRow` and `UnplacedCommitment`, never from an event card. The defect is real and narrower, and the narrower version is the sharper one: the disagreement is **inside one screen**.

### Three things rendering forced, none visible in the source

The day head's caption is written for a **short day title alone on its line**; an address with a control beside it is neither.

1. The way-in pill painted **on top of** the credit.
2. Reserving a track for it fixed that and broke the credit instead — ellipsised from its **start** (`…A 2.0 · Ulrich Latzenhofer`), mangling a licence obligation (ADR-0166 §12.2). **The pill moved to the band's top trailing corner**: move the control, not the obligation.
3. Neither caption line clamped, so a long address ran past the picture and the credit wrapped — at ⁦88px⁩ that leaves almost no photograph. Both clamp now, **on `is-card` only**: the head's own titles are short and its picture is ⁦116px⁩, so it is unaffected.

### Seen in the running app, not only in the mockup

Driven headless against a seeded trip (`DEV_AUTH=1`): the read row renders in the right place on an open card, a booked row says `להזמנה` and an unbooked one `פרטים`, the tap opens the sheet, the sheet carries `קוד אישור`, and **the card closes behind it**. The seed holds no enrichment, so the photograph path was verified by re-pointing the mockup at the **shipped** sheets — `the-read-in-trip-mode-v2.html` now inlines `photo-band.css` and `read-band.css` and renders the app's real classes, which makes it a render of what shipped rather than a drawing of what was asked for.

### Deliberately not built

**The summary under the band.** The recommendation was off and the owner took the recommendations, so `read-band.css` carries no rule for it — shipping one would be shipping a fork nobody chose. The mockup keeps the rule in its own non-shipping block so the control can still show what the other answer costs (⁦+58px⁩).
