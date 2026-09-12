# 2026-09-12 — A transition is settled on its own

**ADR:** [0224](../decisions/0224-a-transition-is-settled-on-its-own.md) (Proposed — design only, nothing built)
**Mockup:** [`mockups/a-transition-is-settled-on-its-own-v1.html`](../../mockups/a-transition-is-settled-on-its-own-v1.html)

## The ask

A screenshot of the lifted hero at 10:59 on a live Iceland day — `הבא בתור · Gissurarbúð 5 · צ׳ק-אאוט · 11:00 · 🔒 קשיח`, one-minute countdown beside it — and one sentence:

> We should add a way to dismiss check in check out and the like, or mark as already checked in or out. Let me know if there's a need to mockup, if there is then please do and send the html once done

Answer given: **yes**, and the reason is §3 below — the cheap-looking half of the ask is a missing call site, and the other half is a stored field the data model does not have.

## What reading the code changed, before anything was drawn

Four findings, in the order they landed:

1. **`SettleControl` is already built for this surface.** Four densities since ADR-0139, and `board` was drawn for the lifted hero specifically (ADR-0160 §11), down to the low-alpha-fill-plus-brightened-ink recipe that keeps `--ok`/`--miss` legible on the app's one always-dark card.
2. **The `הבא בתור` block is not a `Point`.** `HeroLift`'s `Point` renders `<Where/> <Note/> <Tasks/> <Settle/>`; the next block is hand-assembled in the same file and renders the first three. The screenshot's slot has no answer in it because nobody passed one, not because the control is missing.
3. **`status` is already the OPENING edge's answer, and nobody wrote that down.** `glance.ts:508` clears a `not-before` row on `status === DONE` and `hero-booking.ts:123` tests the same field in the missed-check-in arm. So the field is spoken for, and a check-out written through it says "we checked in", a day late, moving a number that was already right. This is the finding root `CLAUDE.md` asks for by name — _count the call sites before claiming what a derivation does_ — and the count is what killed the free option.
4. **`TransitionRow`'s gate is a count rule applied to a control.** It offers the pair only on `NOT_BEFORE`, with the reason in the source: _"a ceiling and a window expire by their own clock and need none"_. True of `נותרו היום`. False of the board, where `CHECKOUT_LEAD_MIN` is **180** — three hours of a card counting down to something you did at 08:30.

And one about the words, which is the part that could have shipped wrong quietly: **ADR-0208 gave `skipped` a real job on this data** (a skipped stop denies the plan the right to claim where you are), so `דילגנו` on a check-out you made is not a weak word, it is a false record. `היינו` is merely vague.

## What the render found that no reading would have

- **The pair reads as a third row of chips.** In the lead point `Settle` follows prose; in the `הבא בתור` block it lands immediately under `במפה · ניווט · להזמנה`, and every other block in that card carries a `.hero-lbl` (`איפה` · `פתק` · `משימה`) while `Settle` carries none. `כבר קרה?` costs **19px** and is drawn as a **control**, not a decision — it would land on both hosts of the `board` density, so the two points do not differ, and that is a device-pass call (ADR-0017).
- **A fidelity bug in the file itself, worth keeping as the trap.** §2's first render put `.hero-part` straight inside `.wp-board.hero-lifted` — which is `padding: 0`, because its three regions (`.hero-head` / `.hero-scroll` / `.hero-foot`) pad themselves — so eight labels sat flush against the card's clipped edge. Restoring `.hero-scroll` fixed it. The skill's rule 2 in one screenshot: the layout tree is a fact you go and find.
- **A shipped defect, drawn by accident.** Reproducing the screenshot faithfully meant asking where `אתמול` came from one minute before 11:00 **today**. `Home.tsx`'s `boardNext.day` is `shownNext.date !== today`, and for a check-out `shownNext` is the **stay**, whose `date` is the check-in day — while the slot shows `endsAt`. The token has to follow the instant being shown: `todayInTz(tz, new Date(nextInstant))`. Independent of the rest and written into the ADR as §7 so it ships with it.

## Measured, off the live DOM (light · 360px; 390px differs only in the two width rows)

| what                                    | number                          | against                                                                       |
| --------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| what the answer adds to the lifted card | **+51px** (70px with the label) | the card itself is 255px, and it scrolls                                      |
| `כבר קרה?` above the pair               | **19px**                        | includes `.hero-lbl`'s own `margin-bottom`                                    |
| `board` button                          | **38 × 75px**                   | under ADR-0017's 44px floor, deliberately and unchanged — ADR-0139 §3's trade |
| `compact` button                        | **32 × 32px**                   | the same trade `ListRow`'s kebab already makes                                |
| what the pair adds to the day row       | **0px**                         | row stays 79px; `.transition-row .wp-settle.compact` already exists           |
| day-row title with the pair             | **183px** (213px at 390)        | what the pair costs the name                                                  |
| widest of the eight verb pairs          | **181px** (`checkIn`, `נכנסנו`) | 300px of inner row at 360px — 119px spare                                     |

## Decisions taken, and what was refused

Taken: the answer belongs to the **edge** (`endStatus` beside `status`, on `startWindowEnd`/`endWindowStart`'s precedent); the done verb comes from the transition key; one shared `לא קרה` for the other arm; two hosts, both at shipped densities; settling takes the edge off the hero.

Refused, each with its reason in the ADR: a third `dismissed` state (§8 — four surfaces for a distinction the done arm already serves), letting `status` serve both edges (§9 — finding 3 above), a fifth density (§10), per-edge skip words (§11), and a device-local dismissal with no stored field (§8 — "we're out" is a group fact with a write path already).

## Left for the build, and one fork the owner still owns

The ADR is **Proposed**. Nothing is built: no `endStatus` column, no migration, no call site. The label (§6) wants a device pass. And the owner's sentence does name two things — _"dismiss … or mark as already"_ — which this ADR reads as one; if "get it off my board without saying anything" turns out to be a real need in use, that is a new enum value and a new decision, not an extension of this one.
