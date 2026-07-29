# Session 175 — the back parity scan (2026-07-29)

> _"Basically when there's a back button on a form or a search or whatever, a system back
> should do the same as if the button was clicked. I want you to do a full app scan for all of
> these and create an app wide solution for all of this once and for all. System backs (android
> swipe gesture) shouldn't do anything different when there's a back button (or cancel,
> exit)."_

The audit that session 170 opened is closed here. Its own note guessed five findings from
reading the code; two of those turned out to be dead, and the one that actually explained the
owner's reports was not on the list. The difference between the two sessions is the method,
and that is the thing worth carrying forward.

## The method: reproduce in a browser, then fix

Session 174 spent four shipped-and-still-broken fixes learning that this class of bug lives in
the seam between a DOM handler and a history traversal — a screen unmounting, a navigation, a
screen mounting on the far side. Any jsdom fixture mocks at least one of those away, so a unit
test can be green and the app still wrong.

So every finding below was **reproduced in Playwright first**, fixed second, and re-run third.
The specs are written as the owner's sentence rather than as implementation detail: drive the
surface into a state that shows a back / cancel / close control, press the platform back,
assert the state the control itself would have produced.

- `e2e/back-parity.spec.ts` — the three parity gaps (new).
- `e2e/back-map.spec.ts` — the Map tab's own layers, including the errand round trip (new).
- `e2e/back-index.spec.ts`, `e2e/back-navigation.spec.ts` — the pre-existing coverage, unchanged
  and still green.

## Finding 0 — the mechanism: a spent marker from another URL

**The one that explains the reports.** ADR-0103's markers are counted push-only, and the count
was global. When a surface navigates while its overlays unmount — exactly what a place errand
does — the count keeps markers pushed **at the old URL**, so the new screen's layers look
already-markered and get none. The next back then rides an entry belonging to the screen you
left.

Reproduced: booking → `＋ מיקום` → the Map. Two Index overlays closed during the navigation,
leaving depth 2; the Map's field and errand layers got no markers; one back rode onto a stale
`?tab=index` entry, off the tab, errand still live. Which is _"it sometimes exits to the main
screen"_ and _"closing the map search entered from the map should return you back to the map
and not home"_ — one mechanism, two reports.

Marker depth is per-URL now. ADR-0103 amended in place.

Worth naming: the accepted tradeoff in that ADR was _"at most one **no-op** back"_. What was
actually happening was a back that **left the screen**. A documented tradeoff stops covering
you the moment the behaviour exceeds what it described.

## Findings 1–3 — controls that were never registered

None of these is a mechanism failure. Each is a visible way back that nobody put in the back
stack.

| Surface            | Visible control                               | What back did instead                                               |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------- |
| Map filter panel   | the row's pinned `✕` (`openDisclosure(null)`) | left the tab — the layer was gated on the QUERY, not the disclosure |
| Plan resolve sheet | `אירוע אחר` step-back                         | dismissed the whole sheet (`Modal`'s `onClose` was the only layer)  |
| All-trips header   | back arrow into the live trip                 | exited the app (`/trips` is a declared root)                        |

All three fixed with the existing `useBackLayer` — no new mechanism, per rule 8. The resolve
sheet's is the interesting one: it registers in the sheet's own component, which is the
`Modal`'s **parent**, so child-first effect ordering puts the step layer above the close layer
and back peels the step before the sheet.

## What the scan cleared

Everything else already agrees, and most of it by construction: `Modal`/`Sheet`/`ConfirmDialog`/
`RowManageSheet` all register `onClose`, and every sheet, dialog, picker and confirm in the app
renders through one of them. Checked and correct: `EventForm` and `BookingSheet` (both pass
`requestClose` — the unsaved-changes guard — as `onClose`, so back prompts exactly as `ביטול`
does), `SearchOverlay`, `PlacePicker`, `DestinationPicker`, `ZonePicker`, `DocumentViewer`,
`IndexDocumentsView`, `IndexBookingsView`, `RosterSheet`, `MemberSheet`, `SyncReviewSheet`,
`DocumentUploadSheet`, `BookingDetail`, `BookingManageSheet`, `DocumentManageSheet`, and the
four shell routes whose arrows run the shared `useAppBack`.

**Deliberately out of scope:** a `✕` that clears a value or dismisses a notice — the place
picker's clear, `FilePicker`'s remove, `StatusBanner`'s dismiss, the shelf card's remove, Home's
stay dismissal. Same glyph, different job. Back navigates; it does not edit.

## Session 170's findings, resolved

- **#1 — back from a non-Home tab goes to trip Home even when you arrived from elsewhere.**
  Still ADR-0090 §2 as designed, still the owner's call. It is _not_ what the reports were:
  those are finding 0.
- **#2 — an errand costs two backs.** Confirmed, and now correct rather than merely true: back
  #1 closes the auto-opened field (the `✕`), back #2 cancels the errand (the banner's `ביטול`)
  **and hands the form back**. Each press does what the control beside it does, which is the
  rule. Whether the field should be part of the errand rather than a layer over it remains a
  product question — but it is no longer a bug.
- **#3 — a spent marker can eat one back.** Dead, twice: falsified in jsdom (session 173) and
  again in a browser here.
- **#4 — `exit-trip` pushes where every other action replaces.** Partly moot: back from
  `/trips` is now an explicit layer navigation rather than a ride on that push, so the
  asymmetry no longer decides anything. Left as-is.
- **#5 — idle-resume drains overlays by running their handlers.** Still unverified. It needs a
  30-minute hidden window, so it wants its own fixture rather than a note.

## Coverage after this session

46 e2e (36 → 46), 1633 unit tests. The Map tab had **no** browser-contract back coverage before
today and now has five cases; the parity rule has five more. Both files are written so the next
surface with a back control is one `test.describe` block, not a new harness.
