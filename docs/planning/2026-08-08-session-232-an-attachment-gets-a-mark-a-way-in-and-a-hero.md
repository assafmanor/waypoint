# Session 232 — an attachment gets a mark, a way in, and a hero

**Date:** 2026-08-08
**Outcome:** [ADR-0174](../decisions/0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) **Accepted for §1/§2/§3/§5/§7 and built**; §4 still open. [ADR-0160](../decisions/0160-the-hero-lifts-and-shows-a-horizon.md) amended in place (§T). Mockup [`attachments-and-event-preview-v1.html`](../../mockups/attachments-and-event-preview-v1.html) rewritten in place.
**Branch:** `claude/attachments-event-preview-ux-h4mez5` (session 231's PR #534 merged; this restarted from `main`).

## What the owner asked for

Session 231 designed and measured and built nothing. The ask this session was to give
recommendations rather than options on every fork, to push the attach control further than the
+4px that had been drawn, to fix the mockup — which was called the weakest part of what shipped —
and to mock up **the lifted Trip hero, which ADR-0174 had missed entirely**.

## The forks, and what was recommended

| Fork                                                                 | Recommendation                                                                                                                                                                                                                                          | Status                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Does the Plan row's tap stop opening the editor?                     | **Yes — `EventDetail`, `BookingDetail`'s peer.** The drag geometry (an expansion is the only option that must survive `resolveRowDrop`/`useFlipRows`/`useHoldToDrag`), the fact that a booked event's read already exists, and ADR-0053's own argument. | **Owner's call. Not built.** |
| Container for the event preview                                      | A `Modal` sheet, like every other overlay.                                                                                                                                                                                                              | With §4                      |
| Does a booked event route to `BookingDetail` or get its own surface? | **`BookingDetail`.** A linked pair is one context (ADR-0172 §1), so the booked event's read already exists and is reached today from the Index and from nowhere in Plan mode.                                                                           | With §4                      |
| Is the archived-trip read the same surface?                          | **Yes**, and it closes that hole for free — `readOnly` makes `.bld-main` a `<div>` today, so a finished trip's events cannot be opened at all.                                                                                                          | With §4                      |
| Where does `HostDocuments` sit on each host?                         | **Above the notes, everywhere.** A document is a thing you need; a note is something about it. The app must not teach one order on the form and another on the read.                                                                                    | **Built**                    |
| How does the hero show documents?                                    | **A chip per document in the point's own `hero-acts` row**, opening the viewer directly — not a section, not the mark alone.                                                                                                                            | **Built**                    |
| How prominent is too prominent for the attach control?               | **`.pp-trigger`'s geometry** (44px, solid border, icon in a tinted square, trailing `＋`). A filled `--cta` is too far, and the reason is structural: the form already has exactly one and it is `שמירה`.                                               | **Built**                    |

The owner's instinct on the hero — _"one tap to the actual file matters more than a tidy section"_ —
measured out: the section is 324px, the chip is 300px, and both are one tap.

## What rendering the mockup properly changed

The `design-mockups` skill (ADR-0175) landed on `main` **mid-session**, in the rebase. Running the
file through it found two things it was asserting without having earned them, and both are now
amendments to ADR-0174.

1. **The file had no webfont link at all.** Every number session 231 recorded was measured on the
   sandbox's fallback face — in the one part of a mockup that claims to be real. This is the first
   entry under "the environment" in `references/pitfalls.md`, and it had been shipped straight past.

2. **It measured one phone.** ADR-0017 calls 360 the design width, not the stress case. With the
   real Assistant face, the Plan builder row's naive mark costs **+0px at 390 and +14px at 360** —
   so `.bld-m`'s rebuild is still the prerequisite, and it is now _a defect you would not have seen
   on the phone you tested on_.

A third finding came out of drawing the hero in a real 360×640 frame: the lifted card's bound may
not be holding at all. `max-height: 100%` against an auto-height `.modal-card` resolves to `none`,
so the hero grows past the card and `.hero-scroll` never overflows — which is why "is the scroller
scrolling" reported "fits" about a card 46px over. Backlog line + an e2e assertion; jsdom cannot
see it.

Two smaller mockup artifacts, both worth keeping: `.modal-form`'s `75dvh` cap measures the **real**
viewport inside a fake phone (so §4's form rendered uncapped and the table said "0px below the
fold" about the surface whose whole argument is that what you came to read is below it), and the
first pass's marks used invented silhouettes with no stroke attributes rather than `ui/Icon.tsx`'s.

## The reuse audit, per item

What was **reused**: `NoteMark`'s shape and a11y contract; `attachmentCountsByHost` /
`attachmentCountFor`, which had shipped with ADR-0173 and had **zero call sites**;
`lib/host-context.ts` (third consumer, one resolved context read by both content types);
`.note-chip`'s button-plus-sibling-`✕` shape; `MediaViewer`/`DocumentViewer`, gaining call sites
and no variant; `HostNotes`'s structure and its `useAnchorName`, exported rather than copied;
ADR-0152 §6c's `nowrap`-line-of-elements rebuild, applied to a second surface; `.pp-trigger`'s
geometry for the attach control; `.hero-act`'s **neutral base rule, which was already in the
stylesheet and used by nothing**; `.place > .note-sec` and `.wp-event-actions-in > .note-sec`'s
declarations, mirrored one block up.

What is genuinely **net-new**: `DocumentMark`, `DocumentChips` (an extraction, not an addition —
the private `DocumentChip` moved out of `DocumentAttach.tsx` and gained an open), `HostDocuments`,
`attachmentCountForContext`, and one `.doc` density on `.hero-act`. Five things, three of which
are the peers ADR-0174 named.

## What is left

- **§4**, on the owner's answer.
- The hero's bound (backlog), which this change neither causes nor depends on.
- The reverse read — "where is this document attached?" — now **drawn once** in the mockup's §8 to
  show what is being given up, and still deliberately not built. Written down three times now.
