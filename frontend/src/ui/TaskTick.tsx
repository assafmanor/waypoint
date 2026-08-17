// **The completion control, once** (ADR-0195). Four surfaces drew this same eight-line
// `<button>` by hand — `IndexTasksView`, `TaskBandRow`, `AutomaticTaskRow` and
// `TaskSection` — identical down to the four attributes, differing only in which density
// class they wrote. That was survivable while the control had no behaviour of its own; a
// beat added at one of them is a beat three surfaces do not have, which is exactly the
// shape this feature has already paid for twice (`.chk-toggle`'s font reaching one of two
// callers, `.tsk-who-row`'s assignee reaching one of two rows).
//
// It owns the beat and the hold, and nothing else: no state, no data, no copy of its own.
import { useEffect, useRef } from 'react';
import { BEAT, playBeat } from '../lib/one-shot';
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
}: {
  done: boolean;
  /** The task's title, for the accessible name — a bare ✓ says nothing about which row it
   *  closes. */
  title: string;
  onTick: () => void;
  density?: TickDensity;
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
