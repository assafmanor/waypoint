# ADR-0138 — The `⋯` row menu is ONE surface, and a control's mark is an icon

**Status:** Accepted (design approved 2026-07-29; built the same session)
**Design reference:** [`mockups/row-menu-v1.html`](../../mockups/row-menu-v1.html)
**Amends:** [`design-language.md`](../design/design-language.md)'s "Emoji are content, icons are UI" (from stated to enforced) and its **Bottom nav** entry.
**Closes:** the backlog's "Emoji used as UI controls, swept out".

## Context

Two owner reports, 2026-07-29, both aimed at the sheet a row's `⋯` opens:

> _"it breaks the design language rule of emoji = content, svg = ui so we need to change this"_
> _"some of the options are useless or need to be elsewhere for example the הזז buttons are useless"_

Reading the surface to design the fix turned up three more problems on the same
sheet, and one of them is why the first two survived so long.

**The menu existed five times.** `RowManageSheet` served the booking row, the
document row and `EventCard`. The Plan builder had a hand-rolled copy with its own
`.row-actions` rules in `screens.css`. `MemberSheet` had a third with `.ms-act`.
Three CSS rulesets for one row shape, and they had already drifted — `14px` vs
`var(--text-body)` for the label, `17px` vs `var(--text-h3)` for the mark. This is
the rule-8 pattern that ADRs 0078, 0079, 0094 and 0095 exist to undo.

**The emoji problem was worse than the rule says.** The `no-restricted-syntax`
guard added in session 101 covers arrow/caret glyphs only, so ✏️ 🗑️ 📥 🔄 👑 🚪 ⬆️
📷 🔗 all sat outside it. Two of the five menus passed theirs as an **inline
literal** (`icon: '✏️'`), not through `ICONS` — so the sweep the backlog had
planned, which was scoped to `ICONS.*` call sites, would not have reached them.

**The root cause of the drift is that `ICONS` mixed both kinds in one object.** A
call site importing `ICONS.edit` and one importing `ICONS.weather` looked
identical. Nothing told you that one of them was breaking the rule.

Three things the mockup measured that a prop list could not:

1. **The destructive verb differed from its neighbours by text hue alone** — same
   fill, border, height, gap. And the emoji beside the red label kept its own
   colours, which is the tell that it was never part of the state.
2. **The builder's menu changed length per row.** `הקדם` was omitted at the top of
   the soft list and `אחר` at the bottom, so `מחק` sat at a different position
   depending on which row you opened — a destructive verb moving under the thumb.
3. **The booking and document menus named nothing.** Two anonymous rows over a
   scrim, with the thing you were about to delete hidden behind it. `EventCard`
   had a title; `MemberSheet` had a whole identity header. Three answers to one
   question, and the worst answer was on the menus holding the irreversible verb.

## Decision

### §1 · One component, one ruleset

Everything renders through `RowManageSheet`, or through `RowActionList` where a
sheet owns a different header. The builder's hand-rolled copy and `MemberSheet`'s
`.ms-act` are deleted along with their CSS; `MemberSheet` keeps its identity header
(real content — and the origin of §3) and renders its verbs through the shared list.

### §2 · `ICONS` splits into `GLYPH` and `CONTROL_ICON`

The split is the fix, because the type now tells you which rule applies.
`CONTROL_ICON` values **are** `IconName`s and can only be rendered by `<Icon>`;
`GLYPH` values are strings and are content. The test for a new entry: **does the
user aim at it?**

`RowAction.icon` is typed `IconName`. The four call sites that passed an emoji
literal no longer compile — which is a stronger guarantee than any lint rule, and
is why the lint guard deliberately does **not** carry an `icon=`-prop selector.

One emoji was doing two jobs and is now two shapes: 🔄 meant both "two events
exchanged slots" (`swap`) and "a write is in flight" (`sync`).

### §3 · Every menu names its subject

`title` is required. `subject` is a quiet fact line beneath it — type, time, state
— in the app's `·` grammar, so the sheet reads as the row it came from. A numeric
run inside it takes `ltrIsolate` (ADR-0118); the mockup drew `09:00–08:00` on its
first pass, which is exactly the bug that rule exists for.

### §4 · The bottom nav and the toast marks cross too

Both were open questions the backlog said to decide rather than assume, because
`design-language.md` names them as emoji itself. **Owner's call: both convert.**
Navigation is the case the rule names first, and the tab bar is the most-seen
surface in the app — the one place a platform's emoji font showed through loudest.
`ShowToast` now takes an `IconName` rather than a string, so a toast's mark is the
icon of the action it confirms and cannot be an arbitrary glyph.

The active tab thickens its stroke rather than only changing hue, so shape carries
state alongside colour — the same accessibility rule the sync cloud follows.

### §5 · A destructive action partitions; it does not just recolour

`danger` items collect into a trailing group below a hairline. 13px, and it makes
the one item you must not hit by accident stop looking like the ones you should.

### §6 · Menu copy is imperative

`עריכה`/`מחיקה` → `ערוך`/`מחק`. A menu item is something you tell the app to do,
and the same two actions on an event already read as verbs.

### §7 · The booking menu gains `שבץ במסלול`

The row says `לא משובצת במסלול` and its menu offered no way to fix that. The verb
opens the existing `BookingSheet` **on** the when-field (`focus="when"`), which is
what keeps it a shortcut rather than a second name for `ערוך` — scheduling has
always lived inside that form and nothing said so. Reads `שנה שיבוץ` once a slot
exists, so it never promises something the booking already has.

### §8 · `הקדם`/`אחר` become one `הזז` opening a position step

They go, but reorder does **not**. `lib/reorder.ts` permutes which soft event holds
which **slot**; doing that through `ערוך` means two edits through a collision, so
it is a real capability and not a shortcut. Dragging is the primary gesture and it
is pointer-only — session 119 removed the grip, so the row drags from anywhere and
there is nothing to hang a keyboard affordance on.

One item, always present, opens a **step inside the same sheet** listing the day's
soft rows with the one you came from marked and disabled. It fixes both complaints
at once: the menu stops changing shape per row, and you pick a destination you can
**see** instead of tapping `הקדם` twice and checking afterwards. The step registers
its own back layer with `remainsActive: true`, per the resolve-sheet pattern.

### §9 · The rule becomes enforceable

The lint guard extends from arrows to control emoji in rendered JSX. Scoped three
ways — to the glyphs this app reached for as controls (never "any emoji"), to JSX
(so `GLYPH` and `i18n/` stay expressible), and to non-test source (a fixture's
`icon="📄"` stands in for content).

**One trap, recorded because it silently inverted the rule:** these selector
regexes compile without the `u` flag, so a character class of astral emoji is a
class of **surrogate halves**. `[📥📋…]` all share the lead unit `\uD83D` and the
class therefore matched every emoji in the plane — it flagged 📍 and 🗺️ as controls
on the first run. The guard uses an **alternation**, where each branch is a whole
code point.

## What stays emoji, deliberately

Category and booking/document type badges, trip identity, the shelf's 💡, event
icon defaults, the empty states' illustrations, and the warmth in copy (🎉 👋 🙂).
These are content: a thing being described, not a control being offered. They live
in `GLYPH` or in `i18n/`, and `design-language.md`'s "icons that are part of a
sentence stay in the copy" is unchanged.

## Consequences

- `RowManageSheet` gains a required `title` and an optional `subject`; `ariaLabel`
  is gone, because a menu with no visible subject was the defect.
- `FeedbackAction.label` widens to `ReactNode` — the CTA labels were built as
  `` `${ICONS.add} ${copy}` `` template strings, which is only expressible while
  the mark is an emoji.
- `TripSettings`'s `ReadRow` takes a `ReactNode` icon for the same reason.
- `BuilderRow` is exported for its own test: the `הזז` step and its back layer are
  real behaviour, and mounting the whole of PlanDay to reach one sheet would test
  the harness instead of the row.
- `.wp-listrow-kebab` grew from 30×30 to the 44×44 touch floor (visible ink
  unchanged; the extra is negative-margined hit area). It is the control that opens
  the menu, so it came along.

## Known gap, not fixed here

**Escape does not go through the back stack.** `useDialogFocus` calls the modal's
`onClose` directly, so on any overlay with an internal step — this sheet's `הזז`,
and Plan mode's resolve sheet before it — Escape dismisses the whole sheet while
the system back and the visible control peel one step. That contradicts
`frontend/CLAUDE.md`'s rule that back, cancel, close, backdrop and Escape all run
one handler (ADR-0103's 2026-07-29 amendments).

It is **pre-existing and app-wide**, not introduced here; it surfaced because this
ADR's test asserted the invariant. Fixing it means routing `Modal`'s Escape through
the nav stack, which touches every overlay in the app, so it is on the backlog
rather than smuggled into a menu redesign. Desktop-only in practice — the platform
back gesture is the phone's path and it is correct.

---

## Amendment (2026-08-01) — the sweep was not finished, and the leftovers proved it

Reported by the owner off a screenshot of the Index landing: _"What about these? Do
we need to replace them? And others that may have been missed?"_ — pointing at the
🎫 and 🛂 on the two tiles. Yes, and the audit that followed found more.

**A shipped defect first.** The sweep script rewrote `{ICONS.x}` inside **template
literals** too, so six call sites shipped rendering the literal text
`$<Icon name="…" />`: `Board`'s now-label and five empty-state `action` props in
`DayView`/`PlanDay`. Neither `tsc` nor lint can see a bad string, and no test
asserted on those labels. Fixed as fragments — the props were already `ReactNode`.
**The lesson is about the method, not the strings:** a regex sweep over JSX will
also match inside a template, and the one place that produces garbage rather than a
compile error is exactly where nothing is watching.

**§2's split drew the content/control line in the wrong place, and the code showed
it.** `GLYPH` filed the Index and Home tile markers as "category badges". They are
not: each sits on a **tile you tap**. The proof is that the first sweep converted
`ICONS.navigate` in Home's quick-action row and left its three neighbours — so the
shipped row was 🎫 📶 [SVG compass] 🛂, four sibling buttons rendering two ways. The
Index's two tiles had the same problem one level up: the nav tab that leads to them
is `cards`, an SVG, while the tiles themselves were emoji.

So `ticket`, `wifi` and `documents` join `Icon`, and **`GLYPH` is down to one
entry** — `members`, the `5 👥` unit on a trip card's meta line, which is a marker
inside a _sentence_ and is what design-language's "icons that are part of a
sentence stay in the copy" actually describes. `atm`/`weather`/`fx` went out
unrendered: they had no call site, so they were a plan rather than content.

**Four more self-contradictions, each the same shape** — the app drawing one concept
two ways:

- `GLYPH.budget` 💰 was the one emoji among four SVG `ReadRow`s in the **same list**
  in trip settings. Now `Icon` `budget`.
- `BookingSheet`'s zone note drew 🕐 while `ZoneChip`, directly beside it, drew
  `Icon` `clock`.
- The Map's `כל הימים` scope chip is a **control** and still wore 🗓️.
- `kindHard: '🔒 קשיח'` baked the lock into the **string**, so the hard chip in
  `EventForm`/`BookingSheet` disagreed with the lock every other surface draws.

**A mark baked into a copy string can only ever be an emoji** — the call site cannot
put an SVG inside it. Six strings carried one (`kindHard` ×2, `modePill`, and four
`＋` CTAs). They are split now and the call site renders the icon, which is the same
answer the arrow guard's note already prescribed for directional labels.

**What deliberately stays emoji, restated after the audit:** per-entity badges
(`BOOKING_TYPE_ICON`, `DOCUMENT_TYPE_ICON`, `CATEGORY_DEFAULT_ICON` and the
`e.icon ?? '🏨'` fallbacks), trip identity and the `IconPicker` set, empty-state
**illustrations** (the Map's 🗺️/🗓️ — an illustration is not a control), PlanHome's
checklist section markers, Login's decorative feature list, and the warmth in copy
(🎉 👋 🙂 ✨). None of those sit beside an SVG doing the same job, which is the test
this amendment adds: **if a glyph has a sibling control already drawing an icon, it
is a control.**

## Second amendment (2026-08-01) — a default glyph is not a pick

The owner's call after the follow-up: _"default pins shouldn't override."_

`constants.ts` stated the rule as "a linked event's **user-picked** icon always
wins", and the rule was right — the reading of it was what slipped. `📌` is what
the form hands out when nobody chooses, so counting it as a pick let a
placeholder outrank a glyph that genuinely says what a thing is.

**It was reachable, by a path narrower than the shape of the bug suggests.**
`EventForm` re-derives the glyph from the category only while the icon is
_untouched_, and **editing an existing event counts as touched** — so an event
created with no category keeps `📌`, and giving it a category later never clears
it. From that point the pin shadows the category on every surface that reads it.

**Five sites, not the one reported.** The Index row and `BookingDetail` fall back
to a booking's type glyph; `TransitionRow` and `lib/glance.ts` fall back to the
**category's** glyph and are the more reachable pair, since no booking need be
involved at all. The fifth is `lib/booking-draft.ts`, and it is the one that
mattered most: it seeds the booking form's icon picker, so the pin was **saved
onto the booking** on the next edit rather than only drawn.

**One shared `chosenIcon(icon)`** in `constants.ts` returns `undefined` for
`DEFAULT_EVENT_ICON`/`DEFAULT_MAYBE_ICON`, so the `??` chain behind each call site
keeps running and no fallback order changes. Deliberately a **value test, not a
stored flag**: an `iconIsDefault` column would need every writer to maintain it,
would go stale the moment someone genuinely picked the pin, and would be wrong for
every row written before today — asking "is this glyph a placeholder" needs no
migration. The accepted cost is that deliberately choosing `📌`/`💡` now reads as
choosing nothing, which is the right trade while they are the defaults.

## Third amendment (2026-08-02) — the empty-state carve-out was wrong, and the guard could not have caught it

Owner, with two screenshots (the Index's documents card and the Map's list pane):
_"i noticed that you missed a few emoji removals."_

**The first amendment carved out exactly what the screenshots point at.** It ended
"what stays emoji is per-entity badges, trip identity, empty-state _illustrations_,
and the warmth in copy" — and one commit later `Map.tsx`'s `listBody` disproved it.
Four `EmptyState`s sit in a single ternary there; two pass `<Icon name="search" />`
and two passed `"🗺️"` / `"🗓️"`. That is the same failure the first amendment was
written about (Home's three emoji beside one SVG compass), in the file the
amendment shipped beside. **The carve-out is withdrawn**: an empty state is chrome
the app draws, not content it holds. What stays emoji is now per-entity badges,
trip identity, and warmth in copy.

The Index card was worse than a carve-out. It drew `DOCUMENT_TYPE_ICON.passport` —
a **content enum borrowed as decoration**, so an empty section announced itself as
a passport, and at 26px `📕` reads as a pink block.

### The guard was a denylist built from the sweep it was meant to outlive

`CONTROL_EMOJI` enumerated the twenty glyphs the first pass had just replaced. It
can therefore only catch a **regression** of those, never a miss — 📕 🗺️ 🗓️ 📍 📖
📄 🎫 👥 ✨ 📶 ★ were never on it, so CI was green the whole time.

**The JSXText half is now positional.** Any emoji written directly into markup
fails, with no list to maintain:

> Content flows in from entity data or a named constant. A glyph typed straight
> into the JSX is decoration by construction.

That test cannot go stale, and it earned its keep immediately: run once, it found
**four more** nobody had spotted by reading — `★` before a Google rating, `✨` on
the booking form's derived-value caption, `📶` on its Wi-Fi heading, and `⎣` on the
Day view's concurrent cluster. That last one is the arrow-glyph bug verbatim:
U+23A3 is a bracket **piece** meant for stacking multi-line math delimiters, so
Assistant has no glyph for it and the substitute sits below the baseline.

The **expression** half stays a denylist (`{e.icon ?? …}`, `icon={BOOKING_TYPE_ICON[b.type]}`),
because content legitimately flows through expressions and only the known control
glyphs are wrong there.

Making the rule exemption-free needed two literals named at their source instead:
`DEFAULT_PLACE_ICON` (📍 for a place with no category — three copies, one of them
in the research list) and four `GLYPH` entries for the `/join` boarding pass, which
stays deliberately playful. Naming them is the point rather than a workaround —
it is §2's "split the vocabulary at its source", applied to the last holdouts.

### Consequences

- `Icon` gains `flight` · `hotel` · `members` · `archive` · `star` · `sparkle` ·
  `bracket`. No `passport`: `documents` already replaced 🛂.
- `EmptyState` gains `size="pane"` for a state that owns a region rather than
  sitting in a list's flow — the owner's call on the Map, where a 30px mark centred
  in a tall sheet reads as a loading artefact. Only the icon grows; copy stays one
  size, so an empty pane never shouts louder than a full one.
- `.fb-empty-icon` is `--muted` now. A colour emoji carried its own palette; a
  monochrome mark at full `--ink` competes with the title beneath it.
- The plane is authored **nose-left** and the bracket **opening left**: forward and
  inward are leftward in RTL, and this app has no LTR mode to transform back to. (This
  bullet used to cite `exit` as the same call. It no longer is — see the fourth
  amendment, which un-mirrors the door and draws the line between the two cases.)

## Fourth amendment (2026-08-02) — a door says nothing about whose it is

Asked of the two trip-settings screenshots: _"the icon for leave group or remove
from group — is it inverted in Hebrew? Should it face the other side?"_

Two things came out of it, and the first one reversed a decision this ADR had made.

### The door is not mirrored, after all — owner's call

`exit` shipped **mirrored** from the LTR log-out convention: door on the right, arrow
leading away leftward, on the reasoning that leftward is forward in RTL. Defensible on
paper, and the platforms agree with it (Material and SF Symbols both flag their log-out
symbols for RTL mirroring). It still read as wrong on the device, twice, to the person
whose app it is: _"back is pointing right in Hebrew and in the app. The leave arrow is
pointing left. They're not the same."_

**The mark goes back to the LTR orientation** — door on the left, arrow leaving to the
right. The argument for mirroring is that an arrow claims a direction of travel; the
argument against, and the one that wins here, is that this particular arrow is part of a
**fixed idiom** — the exit sign everybody already knows — so mirroring it trades away
recognition to buy consistency with `NavArrow` that nobody reading the row was looking
for. Consistency with the nav arrows was the whole benefit, and it is worth less than
being instantly legible.

**The line this draws, so the next icon does not have to re-litigate it:** a shape that
describes **motion or enclosure along the reading axis** mirrors — `NavArrow`, the plane
sliding down `Board`'s transit track (a nose-right plane would fly backwards along it),
the bracket enclosing a cluster of rows. A shape that is a **pictogram of a thing**, whose
internal arrow is part of how that thing is drawn, does not. The third amendment's closing
bullet cited `exit` as precedent for the plane; it no longer does.

`userMinus` below is on the first side of that line only in a trivial sense — its minus is
a **badge position**, which follows the layout, so the person leads at the right in RTL.
Position follows the locale; an idiom does not.

### The same mark was drawing two different verbs

What the question also caught, one step earlier than direction: `הסר מהטיול` (remove that
member) and `עזוב את הטיול` (leave, yourself) both rendered `CONTROL_ICON.leave`, so a row
aimed at someone else's name wore the mark for walking out of your own trip. A door frame
carries no subject, so nothing in the shape distinguished them — plausibly a second reason
the mark read as backwards, since the arrow was leaving a person rather than a place.

`Icon` gains `userMinus` (one figure + a minus) and `CONTROL_ICON` gains `removeMember`.
That is §2's split applied once more: **one verb, one mark, and a verb that takes an object
does not share with one that doesn't** — the rule already stated here for `swap`/`sync`,
where one emoji had served two meanings. `exit` keeps trip settings' own leave row, which is
now its only job.

The orientation is pinned by a geometry test (`Icon.test.tsx`) rather than a comment,
because "mirror the directional icons" is exactly the well-meant RTL sweep that would flip
it back — and what stops it is a judgement about this shape, which no sweep can infer.
