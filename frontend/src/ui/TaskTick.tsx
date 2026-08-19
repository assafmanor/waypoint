// **The completion control, once** (ADR-0195). Four surfaces drew this same eight-line
// `<button>` by hand — `IndexTasksView`, `TaskBandRow`, `AutomaticTaskRow` and
// `TaskSection` — identical down to the four attributes, differing only in which density
// class they wrote. That was survivable while the control had no behaviour of its own; a
// beat added at one of them is a beat three surfaces do not have, which is exactly the
// shape this feature has already paid for twice (`.chk-toggle`'s font reaching one of two
// callers, `.tsk-who-row`'s assignee reaching one of two rows).
//
// It owns the beat and the hold, and nothing else: no state, no data, no copy of its own.
//
// **AND A PARENT'S LEAD IS THE SAME TICK, WEARING ITS PROGRESS** (ADR-0196 §3, reversed
// 2026-08-19 on the owner's _"you should be able to tick the parent task to mark all as
// complete"_). §3 first drew it as a READ — a parent has no completion of its own, so a press
// there looked like a control with nothing to do. What that missed is that a checklist has an
// obvious bulk verb and the ring is exactly where a hand reaches for it. So it is the same
// 44px box, the same hit radius and the same ✓, with the ring FILLED to the fraction, and the
// press settles every open step (or reopens them once they are all settled). The caller
// decides what that means: `taskVerbs.tickTask` is the one place that knows.
import { useEffect, useRef, type CSSProperties } from 'react';
import { BEAT, playBeat } from '../lib/one-shot';
import type { SubtaskProgress } from '../lib/tasks';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './tasks.css';

/** The two densities (ADR-0188 §2, ADR-0191 §4). They share every rule in `tasks.css` and
 *  differ in `--tick-ink` / `--tick-inset` — a third spelling of a tick is not something a
 *  host gets to invent, so this is a union rather than a `className`. */
export type TickDensity = 'row' | 'section';

const DENSITY_CLASS: Record<TickDensity, string> = {
  row: 'tsk-tick',
  section: 'tsk-tick-sec',
};

export function TaskTick({
  done,
  title,
  onTick,
  density = 'row',
  progress,
}: {
  done: boolean;
  /** The task's title, for the accessible name — a bare ✓ says nothing about which row it
   *  closes. */
  title: string;
  onTick: () => void;
  density?: TickDensity;
  /** **Present with `total > 0` makes this a PARENT'S tick** (ADR-0196 §3) — the checklist's
   *  progress, drawn as an arc on the ring it already has, and a press that answers for every
   *  step. `total: 0` is not a parent and renders the ordinary control, which is why no
   *  surface needs a second test. */
  progress?: SubtaskProgress;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  /** A tick whose beat is still playing and whose `onTick` has not run yet. */
  const holding = useRef<{ timer: number; fire: () => void } | null>(null);

  // **A held tick is flushed, never dropped.** The hold delays the CALLER, so an unmount
  // inside the beat's 240ms — switching tab, backing out — would otherwise lose the write
  // silently, which is the one failure this whole mechanism must not add. Nothing else
  // unmounts a ticking row: until `onTick` runs, no state has changed.
  useEffect(
    () => () => {
      const held = holding.current;
      if (!held) return;
      window.clearTimeout(held.timer);
      holding.current = null;
      held.fire();
    },
    [],
  );

  // **What "done" means here.** A leaf answers for itself; a parent answers for its steps, so
  // its fullness is the fraction rather than its own row — which is also the state the press
  // reverses, and therefore what decides whether the beat plays.
  const parent = progress && progress.total > 0 ? progress : undefined;
  const full = parent ? parent.done === parent.total : done;

  const press = () => {
    // Un-ticking is answered by the open state's own transition, not by a beat (§2).
    if (full || !ref.current) return onTick();
    const ms = playBeat(ref.current, BEAT.TICK);
    // 0 under reduced motion and wherever `tokens.css` is unreadable — including every
    // jsdom test, which is why the specs on all four surfaces still see a synchronous
    // tick and needed no clock.
    if (!ms) return onTick();
    holding.current = {
      fire: onTick,
      timer: window.setTimeout(() => {
        holding.current = null;
        onTick();
      }, ms),
    };
  };

  // **A parent wears the arc and keeps the press.** The fraction rides in the accessible
  // name, so a reader who cannot see the ring is told the same thing the ring says — and the
  // name says what the press DOES, which on a parent is every step at once.
  return (
    <button
      ref={ref}
      type="button"
      className={parent ? `${DENSITY_CLASS[density]} tsk-arc tsk-ring` : DENSITY_CLASS[density]}
      aria-pressed={full}
      aria-label={
        parent ? t.tasks.subtasks.tickAll(title, parent.done, parent.total) : t.tasks.tick(title)
      }
      data-done={parent ? full : undefined}
      style={parent ? ({ '--tsk-frac': parent.done / parent.total } as CSSProperties) : undefined}
      onClick={press}
    >
      <Icon name="check" />
    </button>
  );
}
