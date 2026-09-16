# 2026-09-16 — The tab bar's order was never decided

**Outcome:** [ADR-0233](../decisions/0233-the-tab-bar-groups-the-day-surfaces-and-the-drawer-sits-at-the-end.md),
built the same session. One line of `TABS`, one e2e selector, two docs.

The owner asked whether the bottom bar should be reordered, and supplied the reasoning to test: the
Map and Day-by-day are day-aware, the Index is not, and usage probably runs home > day-by-day > map >
index. Everything of substance is in the ADR. Two things belong here instead, because they are about
how the answer was reached rather than what it says.

## The premise was checkable, and checking it is what made the answer firm

"Should we reorder" is a taste question until you find out whether the current order is a decision.
It is not: `grep` over `docs/decisions/` and `docs/design/` turns up the Bottom nav entry recording
four icons and an active-pill treatment, and nothing anywhere naming a sequence. The mockups then
disagreed with the app **and with each other** — seven map-session files draw
`בית · יום ביום · אינדקס · מפה` against the shipped `בית · מפה · אינדקס · יום-יום`. Seven drawings
independently moving Day-by-day to slot 2 without anyone deciding to is the whole argument for
treating this as a gap rather than a preference, and it took one `grep -A6` over `mockups/*.html` to
find. This is the root `CLAUDE.md` line about counting call sites before claiming what something
does, applied to a design question: the audit was the deliverable.

## Counting the consumers before touching the array

`TABS` is iterated in exactly one place (`App.tsx:684`) and indexed nowhere — `grep "TABS\["` is
empty. What the order **does** reach is test selectors, and there the count found one real trap:
`e2e/back-navigation.spec.ts` clicked `.last()` with the comment `// days (last of home/map/index/days)`.
The position was load-bearing and lived in a comment, so a reorder would have failed that spec on the
URL assertion two lines down with nothing pointing at the cause. It selects by name now. The sibling
assertion in the same test — `.first()` has `aria-current` — survives untouched, because Home stays
first and that is a property of the decision, not a coincidence of it.

Every other e2e already selected tabs by `hasText`, which is why the trap was singular.

## The one thing deliberately not done

Nineteen mockups carry the shell's nav markup. They were left alone: a mockup records what its
session promoted (ADR-0097/0175), and rewriting their bars would make those files claim a decision
their sessions never took. New mockups draw the new order.
