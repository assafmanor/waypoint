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
- The plane is authored **nose-left** and the bracket **opening left**, for the
  reason `exit` is authored mirrored: forward and inward are leftward in RTL, and
  this app has no LTR mode to transform back to.

## Fourth amendment (2026-08-02) — a door says nothing about whose it is

Asked of the two trip-settings screenshots: _"the icon for leave group or remove
from group — is it inverted in Hebrew? Should it face the other side?"_

**The direction is right and stays.** `exit` is authored mirrored from the LTR
log-out convention — door on the trailing side, arrow leading away leftward, which is
forward in RTL — the same call the plane and the bracket make in this ADR's third
amendment. What the question caught is one step earlier than direction: the **same
mark** was drawing two different verbs. `הסר מהטיול` (remove that member) and
`עזוב את הטיול` (leave, yourself) both rendered `CONTROL_ICON.leave`, so a row aimed
at someone else's name wore the mark for walking out of your own trip. A door frame
carries no subject, so nothing in the shape distinguished them — the arrow pointing
away from a person's name is what read as backwards.

`Icon` gains `userMinus` (one figure + a minus, badge on the trailing side where a
mirrored `user-minus` puts it) and `CONTROL_ICON` gains `removeMember`. That is §2's
split applied once more: **one verb, one mark, and a verb that takes an object does
not share with one that doesn't** — the rule already stated here for `swap`/`sync`,
where one emoji had served two meanings. `exit` keeps trip settings' own leave row,
which is now its only job.

The direction is pinned by a geometry test (`Icon.test.tsx`) rather than a comment,
because "un-inverting" the mark back to the LTR original is exactly the well-meant
change a future reader might make.

**Un-mirroring it was tried in this session and withdrawn, which is the part worth
recording.** The mirrored mark was reported as reading backwards twice — _"back is
pointing right in Hebrew and in the app. The leave arrow is pointing left. They're not
the same"_ — and the door was moved to the left on that report before the reasoning
was finished. Two things then settled it:

- **Back and exit are opposites in LTR too.** Back points ← and log-out points → there;
  mirroring both preserves that. Leaving pointing the way back points would be wrong in
  either locale. What back does is retrace, against the flow; what exit does is continue
  out, with it — `הבא`'s direction, not `חזור`'s.
- **The report had a confound, and it was the real defect.** It came from two screens at
  once, and on one of them the door was aimed at another person's name (`הסר מהטיול`,
  above). With that row carrying `userMinus` instead, the thing that looked wrong is
  gone independently of which way the arrow points.

So the mirrored path stands. Worth knowing anyway: a reader who follows the same instinct
should reach for the second bullet first, because the confound is the cheaper explanation
and it was the true one. If the leave row still reads wrong on a device now that the
member row no longer wears a door, this is a one-line path swap and the test above says
so out loud.

## Amendment (2026-08-04, session 211) — §8's `הזז` leaves the menu for the row's own time

Decided in [ADR-0161](0161-a-move-names-a-position-and-an-event-owns-its-length.md) §7 and recorded here because it moves a control §8 placed.

**§8's rule stands: reorder must be reachable without a drag.** What changes is where it is reachable from. ADR-0161 makes the builder row's time (`.bld-time`, which already renders `10:00–12:00` and the duration beneath it) a **button** opening the day-position picker — so `הזז` and a duration edit are the same control, and that control is the thing the answer is written on. A focusable button in the row satisfies §8's requirement more directly than a menu row does, and `10:00–12:00` is a better name for "move this" than the word `הזז`.

**What put it here was this file's own §1 being read as a destination.** ADR-0161's first draft added five verbs to the sheet, which rendered as eight rows that scroll, with the destructive verb below the fold and two unrelated verbs (`משך`, `דחה את שאר היום`) reaching for the same `clock` glyph. The owner rejected it off the mockup, and the glyph collision was the diagnosis: **§1 says the row menu is ONE surface, not that it is where a verb goes.** The rule that follows, and the one to apply before adding a row here:

> A verb goes on the object it changes, if that object is on screen. The menu is the residue.

By that test the sheet keeps four rows (`ערוך` · `שכפל` · `העבר למדף` · `מחק`) — the same count it had before ADR-0161, with `הזז` out and `שכפל` in, because a copy is the one verb with no object on the row to hang off.

**§1's actual claims are untouched:** there is still exactly one row-menu component (`RowActionList`), it still partitions danger into its own group, its icons are still SVG and never emoji, and its subject line still names kind and slot. Nothing here reopens the fifth-copy problem §1 solved.

## Amendment (2026-08-17, session 258) — §6 is withdrawn: the register is verbal nouns, and the singular was gendering the app

**§6 is reversed.** It read the change one way — `עריכה`/`מחיקה` → `ערוך`/`מחק`, "a menu item is something you tell the app to do, so the verb wins" — and both halves of that reasoning survive intact. What it did not account for is the register the rest of the app is written in, and what the singular imperative costs in Hebrew specifically.

**The count is the argument.** By 2026-08-17 `frontend/src/i18n/he.ts` held roughly **60** singular-masculine imperative labels against roughly **46** plural ones, and they collided on the same screens: the documents screen said `הוסף מסמך` while Plan Home's documents row said `העלו`; `index.sheet.save` was `שמור` next to the canonical `common.save: 'שמירה'` that U-02 exists to enforce; `map.scheduleToDay` was `שיבוץ ליום` and `actions.scheduleToDay` was `שבץ ליום` for the same action; one clear action was spelled three ways (`נקה חיפוש` / `ניקוי` / `ניקוי הסינון`). §6 could not have prevented that — it named a rule for _menus_ and the imperative spread to primaries, empty states, placeholders and pickers, because nothing said where it stopped.

**And a Hebrew imperative singular picks a gender.** This app's subject is a mixed group of five people travelling together, so every `ערוך` and `שמור` addresses one of them as masculine. No amount of internal consistency fixes that half, which is why the repair is not "make the imperatives plural" (`ערכו`/`מחקו` read stiffer than what they replace) but a register with no grammatical person in it at all.

**The rule that replaces §6** lives at the top of `he.ts`, where a copy change will actually be read, and is summarised in [`design-language.md`](../design/design-language.md)'s **Voice and register** entry:

| where                    | register    | example                               |
| ------------------------ | ----------- | ------------------------------------- |
| a control                | verbal noun | `עריכה` · `מחיקה` · `שמירה` · `ניקוי` |
| a dialog title           | infinitive  | `למחוק את הפתק?` · `לצאת בלי לשמור?`  |
| a sentence to the reader | plural      | `נסו שוב` · `בדקו את החיבור`          |

Two carve-outs, both deliberate and both named so the next pass does not "finish" them:

- **A disclosure toggle keeps `הצג`/`הסתר`.** One matched pair for one job, picked by the owner on 2026-08-16 for the Plan checklist, and `הצגה`/`הסתרה` on a caret row reads like a setting rather than a switch.
- **A stepper keeps its imperative** (`actions.delayBy`, `actions.earlierBy`): `דחייה 15 דק׳` is not a thing anyone says.
- **An act on someone ELSE's state takes the infinitive** — `settings.promote` is `להפוך למנהל`. The owner rejected the noun form on sight (_"`מינוי כמנהל` sounds very formal"_), and it is: `מינוי` is what a committee does, and `הפיכה למנהל` is not a phrase anyone says. Hebrew's casual way to name an act on another person's state is the infinitive, and the same call reworded the two toasts beside it (`מונה למנהל` → `הוא מנהל עכשיו`), which had inherited the same root.

**What §6 got right and is kept:** the menu's actions and the same actions elsewhere must read as one vocabulary. That is now true in the other direction — `actions.edit`, `index.detail.edit` and `docs.manage.edit` are all `עריכה`, and they match `common.save`/`cancel`/`delete`, the `map.make.edit`/`del.action` pair, and every `notes.manage`/`tasks.manage` row, which were nouns the whole time. §1–§5 and §7–§9 are untouched; nothing here reopens the fifth-copy problem or the emoji guard.

**The one gendered verb left in the app is the change feed**, and it is the narration that forces it: the feed reports what a _named_ person did, so there is a grammatical subject. A verbal noun drops the actor (`הזזה של האירוע` says nothing about who), and so does the passive. It stays masculine-by-convention, documented at `changeFeed` in `he.ts`, and is worth revisiting only if `Member` ever carries a pronoun.

## Amendment (2026-08-27) — §10: a glyph with a FACING mirrors with the reading direction

Owner, reviewing M8a's mode-set drawing: _"All glyphs that have a direction should have RTL
variants. For example the person should be facing left and not right if the app is in Hebrew. The
bike as well."_

**Agreed, and it belongs here rather than in ADR-0206.** ADR-0206 §AA3 is what made this visible —
it is the amendment that put a walker and a bicycle into the set, and those are the app's first
`Icon` entries that depict a person moving — but the rule is about the icon vocabulary, so this ADR
is its home. Drawn and measured in
[`mockups/the-mode-set-and-transit-declared-v1.html`](../../mockups/the-mode-set-and-transit-declared-v1.html)
§5; **nothing here is built.**

### §10.1 One declaration, because the mechanism already exists

```css
.icon[data-mirror] {
  transform: scaleX(var(--dir));
}
```

`--dir` is `tokens.css`'s **"one place a direction is named"** — `-1` under `:root`, `1` under the
`[dir='ltr']` block that sits after it — and its own comment already says _"nothing else may
hard-code a direction."_ So the mirror is correct in both directions with no second copy of
anything, and `NavArrow` is the precedent one layer down: it authors its arrow RTL-first and lets
`[dir='ltr']` mirror it.

**The sign lands the other way round here, and that is deliberate.** These glyphs are authored
**right-facing** — the icon-set convention, and what already ships — so RTL is the mirroring case.
Reading the token rather than writing `-1` is what keeps that honest: nothing in the rule knows
which direction is which.

**`.icon` is the `<svg>` root**, i.e. an ordinary replaced box, so the transform origin is already
its centre and no `transform-box`/`transform-origin` is needed.

### §10.2 A named allowlist, and `clock` is why it cannot be a rule of thumb

The set is `MIRRORED`, beside this file's existing `FILLED` and `ROTATE` — the same shape, so the
three lists that qualify a glyph live together.

**"Mirror whatever looks asymmetric" is wrong, and the app's own subject is the counter-example:**
`clock`'s hand reads ~1:10, and mirrored it reads a **different time**. A clock runs clockwise in
every locale. `check` is the second: a mirrored ✓ is not a ✓, it is a tick drawn backwards. Both are
asymmetric and neither may ever mirror.

**Measured over all 58 entries** (the 57 shipped plus §AA3's new `transit`), by sampling each path at
240 points and matching the mirrored point set to its nearest neighbours:

| bucket                                  | count  | what it is                                                                                                            |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| symmetric — the question does not arise | **28** | `driving` and `transit` among them, so **only 2 of the 4 mode glyphs** need the rule                                  |
| asymmetric, no facing — never mirror    | **21** | `edit` (a pencil), `members`, the `cloud-*` trio, `map`, `share`, `link`, `offline`, `sparkle`, `swap`, `currency`, … |
| asymmetric **with** a facing            | **9**  | `walking` + `cycling` (this milestone) and the 7 in §10.4                                                             |

**The threshold is not a judgement call.** Symmetric glyphs top out at **0.33** (`calendar`) and
asymmetric ones start at **1.74** (`members`) — an empty band, so any value inside it gives the same
58 answers. The sampler compares **nearest neighbour** rather than index-to-index, because mirroring
reverses the traversal order of every subpath; an index comparison reports a large error for a
perfectly symmetric glyph.

**"Asymmetric" and "has a direction" are different sets — 30 against 9 — and that gap is the whole
reason the list is explicit.**

### §10.3 A member may not also take `dir`

`Icon` writes its `dir` rotation as an **inline** transform, which out-ranks a stylesheet rule, so a
glyph cannot be both rotated and mirrored. No member of `MIRRORED` takes `dir` today; the unit test
should assert the two sets are disjoint rather than leaving it to notice.

### §10.4 Seven more candidates, and they are a sweep rather than this change

The audit names seven glyphs that have a facing and do not mirror today: **`exit`**, **`undo`**,
**`external`**, **`navigate`**, **`search`**, **`bracket`**, **`ticket`**. Two of them (`exit`,
`undo`) are the same class as `NavArrow` — leaving and going back are directions of travel — and two
are a genuine argument rather than an oversight (a magnifier's handle, a compass needle).

**They are a backlog line, not part of M8a.** Seven glyphs across eight screens is exactly the quiet
widening root `CLAUDE.md` rule 8 forbids, and each of the arguable ones deserves its own look rather
than being carried in on a mode set's coat-tails.
