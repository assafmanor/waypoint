---
date: 2026-08-17
kind: build session
surface: frontend/src/i18n/he.ts — all Hebrew UI copy
status: built
adr: decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md (2026-08-17 amendment)
---

# The Hebrew was two apps talking

The ask:

> I want to improve the hebrew in the app and make it more natural, sometimes more casual.

## What the read found, which was not what the ask implied

Not a word-choice problem. **The target voice already exists in this app** — `עוד פעם ויוצאים
מהטיול 👋`, `יאללה, יש טיול 🎉`, `היום עוד פתוח`, `אפשר לנשום`, `רגע - התאריך כבר עבר` — and it
lives entirely in the onboarding, trip-birth and hero surfaces. It never reached settings, sync,
errors or row menus, which were written in a different register altogether. So the work was not
"pick warmer words"; it was to find why one file had two voices and remove the seam.

Three structural findings, ~120 strings changed.

### 1 · A near 50/50 imperative split, and the singular gendered the app

Counted before touching anything: **~60** singular-masculine imperative labels (`שמור`, `ערוך`,
`מחק`, `נקה`, `בחר`, `העלה`) against **~46** plural occurrences (`נסו`, `בחרו`, `הזמינו`, `העלו`,
`שתפו`, `בדקו`). They collided on the same screens:

- the documents screen said `הוסף מסמך`; Plan Home's documents row said `העלו`
- `index.sheet.save` was `שמור`, next to the canonical `common.save: 'שמירה'` that U-02 exists to enforce
- `map.scheduleToDay` was `שיבוץ ליום` and `actions.scheduleToDay` was `שבץ ליום` — same action
- one clear action, three spellings: `נקה חיפוש` / `ניקוי` / `ניקוי הסינון`

[ADR-0138](../decisions/0138-the-row-menu-is-one-surface-and-icons-are-ui.md) §6 had chosen the
imperative for row menus on sound reasoning ("a menu item is something you tell the app to do").
What it could not do is hold a line — it named a rule for _menus_, and the imperative spread to
primaries, empty states, placeholders and pickers because nothing said where it stopped.

**And the half no consistency argument reaches:** a Hebrew imperative singular picks a gender. This
app's subject is a mixed group of five people travelling together, so every `ערוך` and `שמור`
addressed one of them as masculine. That is why the repair is _not_ plural imperatives — `ערכו` and
`מחקו` read stiffer than what they replace — but a register carrying no grammatical person at all.

§6 is withdrawn. The rule that replaces it is at the **top of `he.ts`**, where a copy change is
actually read, and mirrored in `design-language.md`'s new **Voice and register** entry:

| where                    | register    | example                               |
| ------------------------ | ----------- | ------------------------------------- |
| a control                | verbal noun | `עריכה` · `מחיקה` · `שמירה` · `ניקוי` |
| a dialog title           | infinitive  | `למחוק את הפתק?` · `לצאת בלי לשמור?`  |
| a sentence to the reader | plural      | `נסו שוב` · `בדקו את החיבור`          |

What §6 got right is kept, in the other direction: `actions.edit`, `index.detail.edit` and
`docs.manage.edit` are all `עריכה` now, matching `common.save`/`cancel`/`delete`, the
`map.make.edit`/`del.action` pair, and every `notes.manage`/`tasks.manage` row — which had been
nouns the whole time.

### 2 · Seven words for the same five people

חבורה · חבר'ה · חברים · משתתפים · מטיילים · נוסעים · קבוצה. The owner's own in-flight edits had
started moving toward `החבר'ה` and left `party`/`roster`/`rosterOpen` disagreeing on one screen.
Settled: **the group is `החבר'ה`, the people in it are `נוסעים`.** `משתתפים` reads like a webinar,
not a trip; `מטיילים` was a third word for the same rollup.

### 3 · `הזמנה` meant two different things

A _booking_ across the entire Index, and an _invitation_ in the join flow — so
`shell.join.loading: 'טוען הזמנה…'` literally read "loading booking". An invitation is a `לינק`
now, or `הזמנה לטיול` where the ticket badge needs the noun.

## Three carve-outs, named so a later pass does not "finish" them

- **A disclosure toggle keeps `הצג`/`הסתר`** — one matched pair for one job, and the owner picked it
  on 2026-08-16 for the Plan checklist. `הצגה`/`הסתרה` on a caret row reads like a setting rather
  than a switch. This also means `index.pastToggle` finally follows that same 2026-08-16 call about
  the count: `הצג הזמנות מהעבר (3)` → `הצג 3 מהעבר`, since brackets are a UI convention, not Hebrew.
- **A stepper keeps its imperative** (`actions.delayBy`, `earlierBy`): `דחייה 15 דק׳` is not a thing
  anyone says.
- **An act on someone else's state takes the infinitive.** Added mid-session: the first pass wrote
  `promote: 'מינוי כמנהל'` and the owner rejected it on sight — _"מינוי כמנהל sounds very formal"_,
  and it is. `מינוי` is what a committee does and `הפיכה למנהל` is not a phrase, so the infinitive
  is the only casual form left: `להפוך למנהל`. **The correction was applied at the root, not at the
  string named** — the two toasts beside it had inherited the same word (`מונה למנהל`) and were
  reworded in the same pass.

## One truth bug found on the way in

`tasks.filter.noResults` had just been changed to `הכל סגור`. That is a claim, not an empty state:
one string serves three facets, so under `הושלמו` with nothing settled it said "everything is
closed" about a list of open tasks, and under `שלי` it spoke for other people's rows. Now
`אין כלום כאן` — a string serving three facets may not describe any of them.

## The tests were the other half of the work

Eleven assertions across five files (`RosterSheet`, `ChangeFeed`, `UserPicture`, `FilePicker`,
`WhenField`) had the old wording **frozen as literals**, so a copy change was a test failure by
construction. They read `t.*` now. Two of them assert on `document.body.textContent` rather than
`getByText`, because those two sentences share a text node with a neighbour — `settings.you` renders
after a `·` separator, and the picture screen's two hints live in one container div.

Suite: **235 files, 3961 tests, all passing** — the same file and test counts as before the change,
which is the check the frontend `CLAUDE.md` asks for (a file that fails to _collect_ hides every
test in it, and a healthy-looking pass count is exactly how that goes unnoticed).

## What was deliberately left alone

- **The change feed stays gendered**, and the narration is why: it reports what a _named_ person
  did, so Hebrew demands a grammatical subject. A verbal noun drops the actor (`הזזה של האירוע` says
  nothing about who) and so does the passive. Masculine by convention, now documented at
  `changeFeed` in `he.ts` with the reasoning rather than just the convention. Revisit only if
  `Member` ever carries a pronoun.
- **`he.ts` only.** English strings elsewhere in the codebase are untouched, and so are the ~40
  `:hover` rules the frontend `CLAUDE.md` already backlogs.
- **The `t.map.del.refs` gender table** — the one copy derivation with its own test file. Its
  grammar is the thing under test and this pass had no reason to touch it.

## Two things worth carrying forward

**A count beats an impression.** The whole diagnosis turned on `grep`-ing the two imperative
families and finding 60 against 46. "The Hebrew feels inconsistent" would have produced a list of
favourite rewrites; the count produced a rule, and the rule is what stops the split reopening.

**Copy asserted as a literal is copy that cannot be improved.** Five test files made a wording
change cost eleven failures with no defect behind any of them. Assert `t.*`.
