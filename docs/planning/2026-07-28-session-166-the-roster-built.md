# Session 166 — the roster, built (ADR-0133 Phase 3)

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Code** — Phase 3 of [ADR-0133](../decisions/0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md): the header cluster becomes a control, `MemberSheet` generalises into the one member surface, and §10's two shipped defects are fixed rather than propagated. Closes the original "view members from the top bar" request.

## What was actually wrong, restated because the fix is small and the defect was not

The cluster was a `<div>` carrying a `title`. On a phone that is **not a control at all** —
hover is a desktop luxury (root rule 6 / ADR-0017) — and with `MEMBER_AVATAR_CAP = 2`
the inert `+N` meant most of a five-person group was reachable only by going to trip
settings. The new button measures **74×44**, so it meets the touch floor the old markup
never did, and the sheet lists **everyone**: that is what turns the cap back into a
rendering detail instead of a truncation, which is the "removes a mechanism" outcome
§9 was after.

## One member component, two entry points

`MemberSheet` moved out of `screens/TripSettings.tsx` into `ui/domain/` and gained the
detail rows; `MemberRow` is now the one row **both** lists render, and it renders the
shipped `.set-member` grammar rather than a second copy. So the roster and the settings
party list cannot drift into looking like different things, which was the actual risk in
having two member lists.

The joined date came **off** the row and onto the surface, per the owner's "a little too
much": a row names who is present, a card describes them.

## The admin verbs are host-provided, and that was a judgement call

`MemberSheet` takes optional `onPromote`/`onRemove`, and **only trip settings passes
them**. Not because the roster is a lesser surface — the gate has always been
server-side (ADR-0039), and §9's own correction says the verbs are gated by role rather
than by arrival surface — but because trip settings owns the machinery around them: a
`ConfirmDialog` for the kick, and `reloadRemoved()` to refresh the ADR-0067 "Removed"
list a kick has just added to.

Giving the roster the same verbs means extracting that confirm-plus-reload flow so both
hosts can call it. That is a real refactor, and rule 8 says to **ask** before taking one
on rather than doing it silently. So it is a backlog line with its reasoning, not
unannounced scope — and the UI half is already done, since the callbacks exist.

## The two §10 defects, verified in a browser rather than asserted

Both were shipped bugs on elements this phase reuses, which is why they were this
phase's to fix:

1. **`+{n}` rendered as `n+`.** Bare text in the RTL chrome, so the sign drifted past
   the digits — the ADR-0118 bug class the frontend `CLAUDE.md` documents for `−3`. Now
   `ltrIsolate`, and the DOM reads `⁦+2⁩` with the isolate controls actually present.
2. **`.role.owner` spent amber on a role.** `rgba(233,166,60,.16)` on `--amber-deep`,
   where amber is time & commitment only (ADR-0028 / rule 4). Now `--ink` on a neutral
   6% ground with an inset hairline, so `admin` still separates from `peer` by weight
   and border rather than by a reserved hue. **Measured** in the running app:
   `rgb(22, 35, 61)`.

The unit tests for these can only assert the _hook_ — jsdom loads no CSS, so nothing
there can see a colour or a bidi-reordered glyph run. Saying that plainly matters more
than the test count: the real check was `getComputedStyle` in a real browser, and the
tests exist so the class and the isolate cannot quietly disappear.

## And one the roster exposed by existing

`.set-member .av` inherited `.av`'s **chrome** styling — 31px with a 2px indigo border,
which is there to seam avatars overlapping on the dark header. On a white card that
border is a heavy dark ring around every face. It has shipped in trip settings all
along and nobody noticed, because one of them reads as a design choice; **five in a
column read as a mistake.** Dropped for paper rows.

That is the third time in this epic that putting a thing on screen found something no
test could: the Phase 1 avatar's UA button border, the Phase 2 hue clustering, and now
this.

## Also fixed while here

**The joined date was hand-rolled, and the owner caught it.** I wrote
`${d.getDate()}.${d.getMonth() + 1}` — `14.3` — beside an app that already has exactly
one numeric date shape: `he-IL` with `2-digit`/`2-digit`, which is why a trip-date range
reads `20.07–29.07`. The formatter behind it (`tripDateNumeric`) was module-private, so
"reuse it" meant **exporting** `formatDayMonth` from `lib/time.ts` rather than copying
the `Intl` options — one formatter, two callers, and a second surface can no longer
invent its own shape. The date now reads `14.03`, with its own test asserting the padded
form against a trip range.

The member surface also closed with `ביטול` ("cancel"), inherited from when it was purely
an actions sheet. A read-only detail card has nothing to cancel, so it closes with
`סגירה`.

## What is left of the epic

**Phase 4** — upload's storage half only: a byte ceiling, a crop/resize step, and the
trust-class call against `storage.ts`. The control is designed and nearly free
(`FilePicker`'s inputs behind a badge on the hero).

Unchanged and still open: the identity ramp's **dark values have never been judged on a
real dark render** (every pass in this epic has been light mode), a rename is not
broadcast to co-members (§8), and the emoji-as-UI-controls sweep — `MemberSheet` carried
its `👑`/`🚪` across verbatim, deliberately, so this stayed a relocation rather than a
redesign.
