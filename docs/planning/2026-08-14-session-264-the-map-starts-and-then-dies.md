# Session 264 — the map does not fail to start, it starts and then dies (field report #35, solved)

**Date:** 2026-08-14
**Workstream:** `M` (#35, and #28 with it) — **root cause reproduced deterministically and fixed.** Five previous rounds each found a real defect and none was this.
**Touches:** `frontend/src/ui/domain/MapPane.tsx` (+ its test), `frontend/src/constants.ts`, `docs/decisions/0121-embedded-map-phase-6-design.md` (amended in place), `docs/backlog.md`.
**No new ADR, no mockup.** ADR-0121 owns the failure model, and this corrects it.

## 0. The brief

The owner, going AFK: _"conduct thorough independent research using this pc, the environment, internet access and every resource available to you to debug the bug, reproduce and fix, then measure and see that the bug isn't occurring or you introduced new ones … until the map no longer fails to load and if it does it is able to recover automatically."_

The standing instruction that made it findable was theirs too, one message earlier: **stop shipping fixes and reproduce it.** Four had gone out on inference.

## 1. Three harnesses, two of which failed honestly

Reproduction was the whole problem, so the failures are worth recording:

- **Visibility could not be forced.** The chrome-devtools browser is launched with `--disable-background-timer-throttling --disable-backgrounding-occluded-windows`, so it cannot background a page at all. In a clean Chrome, `Emulation.setPageVisibilityOverride` **no longer exists**, `Page.setWebLifecycleState('frozen')` leaves `visibilityState` visible with rAF still ticking, and neither `bringToFront` on a sibling page nor minimising the window hides anything. The harness now **asserts** the page went hidden and exits rather than reporting a result from an experiment it never ran — the first version silently "found nothing" while testing nothing.
- **Connectivity flapping is not it.** `offline → online` unmounts and remounts the pane through `mapPaneAvailable`, which looked like a strong candidate. It recovers **3/3**, and 2/2 again after the fix.
- **A lost GPU context is it.** `WEBGL_lose_context.loseContext()`, which is what a phone does to a long-backgrounded page.

## 2. What was actually wrong

With the context lost: terrain **gone**, Google's logo and attribution still drawn, list and chrome fine, **no cue, no error, no recovery, 26s+**. The screenshot is field report **#28** word for word — so #28 and #35 were one bug, sitting in front of us since session 247.

**Why nothing caught it:** `MAP_LOAD_TIMEOUT_MS.TILES` guards the **first** paint. `tilesPainted` is already true when the context dies, so no timer is armed and no signal exists. Every previous fix — the loader reset, the deadline teardown, the bound, the resume nudge — addresses _the map never started_. This is _the map started, then died_, which had **no detector at all**.

And session 247 named this very event and declined to act on it, reasoning that a post-paint loss is _"recovered mid-session rather than never loaded"_. Measured: **it is not recovered.** That one sentence cost five sessions.

## 3. The fix

`ContextLossRecovery` — listen for `webglcontextlost`, rebuild the map. Three properties, each measured:

- **Capture phase on the pane.** The event does not bubble; a capture listener on an ancestor still sees it, and unlike a canvas-bound listener it survives Google replacing its own canvas.
- **Rebuild, not restore.** `restoreContext()` does redraw — at the **default world camera**. Only a fresh map returns both a live context and the right camera.
- **Deferred until visible**, because a map built while the page is hidden is the failure that started all of this.

Bounded at 3 rebuilds (a rebuild is a billed instantiation, §4); past it the pane degrades to `ErrorState`, and a human retry resets the budget.

## 4. Measured after, in a real browser

| Property                                                 | Result                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| Single loss recovers                                     | **yes** — cue at +500ms, `webgl: ok` and map back by +2s |
| Rebuild loop (tearing down a canvas firing another loss) | **no** — exactly 1 loss event seen                       |
| Still recovered 10s later                                | **yes**                                                  |
| Four losses                                              | degrade to `ErrorState`, as designed                     |
| Human retry from there                                   | recovers                                                 |
| Offline-flap path                                        | 2/2, unchanged                                           |
| Never-painted path (bound, slow notice, retry)           | unchanged                                                |

Suites: frontend **3647**, backend **640**, shared **232**. Trap-checked — invert the "lost" flag and five of the new tests fail.

## 5. What this retires, and one correction owed

**The resume nudge is deleted.** Right observation (a resume fixes it), wrong inference (the map is alive and merely not rendering). It also had a hole that made it inert in the case it was written for: gated on `useMap()` returning an instance, and when the loader never reaches `LOADED` there is no instance, so no listener was ever registered.

**ADR-0186's framing is wrong and is corrected there.** The offline-map migration was partly justified as the cure for #35. MapLibre is also a WebGL canvas and inherits context loss identically — it would have needed this same recovery. The offline map stays worth building for the reason it always had: a map that works on a plane.

## 6. Still owed

The owner's own phone. Everything here is reproduced and measured on a desktop GPU; the mechanism is device-independent and the recovery is automatic, but the confirming resume is theirs.

## 7. A process note worth keeping

Four fixes shipped on inference before anyone reproduced this. The repo's own systematic-debugging rule puts the line at three, and the reason it exists is visible in the diff: each of those fixes was defensible, each was for a real defect, and none of them was the bug. **The reproduction took under an hour once it was attempted** — most of it spent discovering that three plausible ways to background a page do not work, which is exactly the kind of thing an assertion in the harness turns from a wrong answer into a known unknown.
