// **A one-shot answer beat**, and the reason it is one file rather than three copies
// (ADR-0160 §7, root CLAUDE.md rule 8).
//
// The app now answers three different "there is no destination" moments with the
// same kind of motion:
//
//   `.is-nudging`    — a form refuses a save (ADR-0150).
//   `.is-landing`    — a lifted hero touches back down (ADR-0160 §7).
//   `.is-rebuffing`  — a tap on a hero with nothing to open (ADR-0160 §9).
//
// **The rebuff was designed, retired, and then claimed by a different surface** — worth
// knowing because the history is in three ADR amendments and looks like churn. §9 wrote it
// for the Trip board; §A withdrew it, because once the board lifts in a gap an empty tap is
// the rare end-of-day case and silence is right there. What brought it back is **Plan
// mode's prep hero**, which genuinely never opens (§H): its depth is the checklist rendered
// directly beneath it, so there is nothing to lift, and a tap that answers with nothing at
// all reads as a dead surface rather than a calm one.
//
// It is deliberately NOT `NUDGE` reused. That beat is a horizontal shake meaning *something
// is wrong*, and a tap on the prep hero is not an error — it is a tap on something that was
// never a control.
//
// All three share the same four properties, and every one of them is a thing that
// was got wrong once somewhere in this repo:
//
//   1. **One shot, applied imperatively.** A CSS animation does not replay because
//      an attribute changed value, so a repeat attempt at the same field would do
//      nothing visible. The class comes off, a reflow is forced, the class goes back
//      on. This is `useFormErrors`' own comment, generalized.
//   2. **`linear`, and the keyframe offsets ARE the timing.** Under a non-monotone
//      easing an `offset: 0.6` fires in the first fifth (ADR-0140 §7's build log),
//      so an oscillation must not be resampled by a curve.
//   3. **Symmetric, so no `--dir`.** Unlike every other translate in this RTL app,
//      mirroring one of these produces the identical animation.
//   4. **The duration comes from a token, through `motionDurationMs`** — which
//      answers 0 both under reduced motion and when the token is unreadable, so the
//      class is never left on an element whose animation never ran.
//
// What differs between them is the axis and the meaning, which is exactly the part
// that should be per-case: the CSS keyframes live with the surface they belong to.
// ADR-0139 is the precedent for what happens otherwise — three copies of one control
// drifted on four axes before anyone counted them.
import { motionDurationMs } from './motion';

/** The three beats, named so a call site cannot invent a fourth spelling. Each has
 *  its keyframes beside the surface that owns them: `form-errors.css`,
 *  `board.css`, `screens.css`. */
export const BEAT = {
  /** A form refuses: a horizontal shake, because something IS wrong. */
  NUDGE: 'is-nudging',
  /** A lifted surface touching down: one small compression on the axis it landed on. */
  LANDING: 'is-landing',
  /** A tap on a surface with nothing to open: a small rise that settles back. Vertical
   *  rather than lateral on purpose — it answers "there is nothing above this" and must
   *  not read as the refusal `NUDGE` is. No colour and no text (ADR-0160 §9). */
  REBUFF: 'is-rebuffing',
} as const;

export type Beat = (typeof BEAT)[keyof typeof BEAT];

/**
 * Play one beat on an element, once.
 *
 * Returns the duration it will take, in ms — **0 when nothing will animate**, which
 * is what lets a caller sequence something after it without asking twice.
 *
 * `animationend` is deliberately NOT what removes the class. It does not fire when
 * no animation runs (reduced motion, or `tokens.css` absent as in every jsdom test),
 * which would leave the class on the element forever — a state that only exists
 * during an animation outliving the animation, which is ADR-0140 §5's whole subject.
 * A timer keyed to the same token the CSS uses cannot disagree with the CSS.
 */
export function playBeat(el: HTMLElement, beat: Beat, token = '--t-base'): number {
  el.classList.remove(beat);
  // Force a reflow between the removal and the addition, or the browser coalesces
  // them and the animation does not restart.
  void el.offsetWidth;
  el.classList.add(beat);
  const ms = motionDurationMs(token);
  // The removal is ALWAYS scheduled, never done inline — including at 0ms. Removing
  // it synchronously would mean the class is never observable at all, which is both
  // a behaviour change for the shipped nudge (its own test caught this) and wrong for
  // anything that reads the class as state rather than only as an animation trigger.
  // At 0ms the timer is the next task, which is soon enough and still asynchronous.
  window.setTimeout(() => el.classList.remove(beat), ms);
  return ms;
}
