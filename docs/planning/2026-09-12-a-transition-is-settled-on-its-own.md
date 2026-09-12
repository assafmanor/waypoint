# 2026-09-12 — A transition is settled on its own

**ADR:** [0224](../decisions/0224-a-transition-is-settled-on-its-own.md) (Accepted and built the same day)
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

## The build, same session

The owner's answer to the mockup was **"Do this"**, so the design was accepted and built in one go: `endStatus` on `TripEvent` + the Prisma column and migration, `edgeStatusOf` / `isEdgeSettled` / `eventEdgeSchema` in `packages/shared`, the edge threaded through the one status route (controller → service → column), and through the client's whole write path (`api.ts` → outbox op → cache change → reducer action → `applySetStatus` → the undo descriptor), then the two hosts and the two derivations.

**What the build found, and it is the same shape three times — a rule stated only as far as the data model allowed:**

1. `hero-booking.ts`'s missed-check-in arm tested `!== DONE`, not "settled", so a check-in the group had decided **against** went on being reported as missed; and its LIVE arm tested nothing at all, so a checked-in stay was offered for the rest of its grace or window. One `isEdgeSettled` guard above the pair covers both — more than §5 asked for.
2. `glance.ts` restated "settled" inside two of its three arms and not the third. Since the per-edge answer has to be asked anyway, it became **one rule prior to all three**, and the arms below are now purely about clocks. ADR-0171 §6 is untouched.
3. The **undo had to carry the edge**, or withdrawing a check-out mark would write `status` and claim something about the check-in. The descriptor, the outbox op, the reducer action and the REST call all take the same optional `edge`, absent everywhere it was absent before — so an op already queued in a user's outbox replays unchanged.

**One shipped test asserted the rule this reverses** — `TransitionRow.test.tsx`'s _"does NOT settle a ceiling or a window — both expire by their own clock"_ — and became an assertion of the new rule with the old reasoning kept, because that reasoning was right about the count and wrong about the surface it was applied to.

**And the proposed CSS shrank from two rules to one.** The mockup's `.hero-next-settle` padding was reasoned from "a hand-assembled block inherits none of `.hero-point`'s part rules", which is true and irrelevant: `Settle` returns a `.hero-part`, which carries the padding itself. What ships is §6's — the settled record's type on the day row, which without it inherits the body size and out-shouts the `13.5px` title the row exists to show.

Green: shared 608, backend 1396, frontend 5518, `pnpm typecheck` and `pnpm build` clean. New coverage: the two accessors, the hero dropping a settled edge on both ends, the day count dropping a settled check-out before its ceiling, the horizon's `nextEdge`, the day row's per-edge answer and words, the backend's two columns and its change payload, and Home's own seam — the `אתמול` regression and the pair reaching `verbs.done(event, 'end')`.

**A note on how the suites were run here, because the first run looked like 289 failures and was none of them:** this sandbox has no Docker, so `pnpm test` reported the whole backend red with `Can't reach database server`. A system cluster (`pg_ctlcluster 16 main start`) plus the role, the database, `prisma migrate` and `prisma/seed.mjs` — the no-Docker path `prerequisites-checklist.md` already documents — turns it green. `backend/vitest.config.ts` reads `backend/.env` and not the repo root's, so `DATABASE_URL` has to be exported for the run.

## One fork the owner still owns

The label (§6) ships on and wants a device pass. And the owner's sentence does name two things — _"dismiss … or mark as already"_ — which this ADR reads as one; if "get it off my board without saying anything" turns out to be a real need in use, that is a new enum value and a new decision, not an extension of this one.
