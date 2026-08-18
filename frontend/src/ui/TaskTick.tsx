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
// **AND A PARENT'S LEAD IS A READ, drawn by this same component** (ADR-0196 §3). A task
// holding a checklist has no completion of its own to press — it closes when its last step
// does — so its leading element is the same 44px box, the same 12px hit radius and the same
// ✓, with the ring FILLED to the fraction and no press at all. One component rather than two,
// for the reason the two densities are one component: a second spelling of a tick is how two
// ticks start disagreeing about what "done" looks like.
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
  /** **Present with `total > 0` turns this into a READ** (ADR-0196 §3) — the checklist's
   *  progress, drawn as an arc on the ring it already has. `total: 0` is not a parent and
   *  renders the ordinary control, which is why no surface needs a second test. */
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

  const press = () => {
    // Un-ticking is answered by the open state's own transition, not by a beat (§2).
    if (done || !ref.current) return onTick();
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

  // **A parent, and therefore a read.** `role="img"` with the count as its name: a screen
  // reader gets "2 of 5 done" where a sighted reader gets the arc, and neither is offered a
  // press that has nothing to do. The row's own tap opens it, where the steps are.
  if (progress && progress.total > 0) {
    const full = progress.done === progress.total;
    return (
      <span
        className={`${DENSITY_CLASS[density]} tsk-arc tsk-ring`}
        role="img"
        aria-label={t.tasks.progress(progress.done, progress.total)}
        data-done={full}
        style={{ '--tsk-frac': progress.done / progress.total } as CSSProperties}
      >
        <Icon name="check" />
      </span>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={DENSITY_CLASS[density]}
      aria-pressed={done}
      aria-label={t.tasks.tick(title)}
      onClick={press}
    >
      <Icon name="check" />
    </button>
  );
}
