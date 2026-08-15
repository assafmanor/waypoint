# Tasks phase 1b — the editor and the read, built

**Date:** 2026-08-15
**ADR:** [0189](../decisions/0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md) — written in this session, and it promotes the mockup that was Proposed.
**Design:** [`mockups/task-editor-and-read-v1.html`](../../mockups/task-editor-and-read-v1.html) · [design session](2026-08-15-tasks-editor-design-session.md)
**Follows:** [phase 1](2026-08-15-tasks-phase-1-built.md). **Precedes:** phase 2 (automatic tasks) — untouched here.

## What shipped

Everything the design proposed, plus the three owner calls that closed its forks.

- **`חשוב` is `EventForm`'s `יש הזמנה` row verbatim** — `.field` + `ToggleChip tone="cta" size="touch"` + a star. **44px** in the running app, against phase 1's 29px.
- **The assignee row is `ChoiceGrid layout="pills"` with a person where the glyph goes.** `Choice` grew one optional field; the density is the host's own `.tsk-who` wrapper, `.category-pills`' shipped pattern. **45.7px** per option against the shipped 28px.
- **`לא משויך`, selected by default.**
- **A task is read where it sits** — the row's tap opens it in place, the body is printed, and a foot line carries who owes it and `עריכה`. The `⋯` mark on the meta line says there is more, and costs 0px.
- **The Index order is `הזמנות · משימות · מסמכים · פתקים`**, pinned by a spec.

## Four decisions taken during the build that the design did not make

1. **`Choice.lead` is a `ReactNode`, not the `AvatarPerson` the design specified.** The unassigned option is a **person-shaped absence** — the same circle with a group glyph, dashed while unchosen — and there is no person to pass for it. A typed field would have forced it into a differently-shaped chip beside the people, which says "this is a different kind of answer" about the same question's default one. `Avatar` still does every bit of the drawing; the primitive does not need to know that is what it is holding.

2. **The foot was generalised rather than copied, and the rename was wider than the CSS.** `.note-open-foot`/`-host`/`-sp`/`-act` became `.row-open-*` in a new `ui/domain/row-open.css`, with `RowOpenFoot` as the shared shell — two consumers on day one, which is the bar rule 8 sets. `.wp-listrow.is-open`'s own rule moved with it (it describes any row that opens, not a note); `.note-open-url` stayed behind (a url is a note's own fact). **Four test files and one e2e spec were renamed with it** — that is the real cost of the generalisation and it is small, but it is not zero, and it is why the alternative kept looking cheap.

3. **Every row opens, whether or not it has a body.** The alternative was to make a body-less row keep opening the editor, which would have meant one list where the same gesture does two different things. An open task with no details still shows who owes it and the verb — the same answer the notes screen gives on a host's section.

4. **The row's tap no longer opens the editor**, which changes phase 1's behaviour on purpose. The spec asserting the old behaviour was **rewritten with the reason above it**, not deleted — a later phase reading it should see that the change was made, not infer that the coverage lapsed.

## What running the app found that the test suite could not

**A bidi defect in the new code, and it is the reason "render it" extends past the mockup.**

`.tsk-open-body` renders **stored content** — words the app did not write — so it needs `dir="auto"` (ADR-0118). It shipped without one, inheriting the page's RTL. Measured live, with a `2-14-5 Kabukicho, Shinjuku` body in a box spanning x=53–449:

|                             | first glyph paints at      |
| --------------------------- | -------------------------- |
| no `dir` (as first written) | **x=404** — the wrong edge |
| `dir="auto"`                | **x=67**                   |

**jsdom reports every rect as zero**, so no unit test could have seen it; the whole suite was green with the bug in. `frontend/CLAUDE.md` names this exact failure ("Rendering stored content with NO `dir` at all — the absence is the bug"), which is the uncomfortable part: it was written down, and it still shipped into the working tree, because the element looked like a `<div>` full of Hebrew in the fixture that was being looked at. **The fixture is what hid it** — a Hebrew body resolves the same either way.

Everything else verified live at 360px: the tile order, the 44px flag, the 45.7px pills, `לא משויך` checked, the radiogroup ARIA announcing `radio "לא משויך" checked` with the avatars decorative, the open row with no scrim, and no console errors.

## Verification

- `pnpm typecheck` · `pnpm build` · `pnpm lint` green (one pre-existing warning in `note-way-in.spec.ts`, untouched).
- Frontend suite **224 files / 3818 tests**, including four new specs for the read surface (and, from the change before it, one pinning the tile order).
- Driven in the running app against the live backend (`DEV_AUTH=1`) at 360px: create → save → open → read → edit.
- **e2e not run** — the specs touched there are selector renames, and a full e2e pass wants its own run.

## Owed after this

- **Phase 2 — automatic tasks.** Unblocked; nothing here forecloses it, and `.chk-*`'s retirement is still its deletion to make.
- **The device pass**, now three questions: whether a 26px ring reads as pressable under a thumb (ADR-0188), whether a 38px avatar in a pill reads as a person at arm's length, and whether a selection ring reads as "chosen" beside an avatar carrying a strong hue of its own.
- **`ListRow`'s title carries no `dir`** and it holds stored content at every consumer. Noticed while fixing the body block, **not fixed here** — it is a shared element holding mixed content (a title plus a star, plus a badge at some hosts), so the repair is per-consumer at the element that holds the value and nothing else, not one attribute on the shared span. On the backlog rather than taken silently.
