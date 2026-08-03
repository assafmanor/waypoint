// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEAT, playBeat } from './one-shot';

describe('playBeat', () => {
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    document.body.appendChild(el);
  });
  afterEach(() => {
    vi.useRealTimers();
    el.remove();
  });

  it('puts the class on synchronously, so it is observable', () => {
    playBeat(el, BEAT.LANDING);
    expect(el.classList.contains(BEAT.LANDING)).toBe(true);
  });

  // The regression the shipped nudge's own test caught while this was being
  // extracted: removing the class inline when the duration is 0 means it is never
  // observable at all, and jsdom always reports 0 because `tokens.css` is absent.
  it('schedules the removal even at 0ms rather than doing it inline', () => {
    const ms = playBeat(el, BEAT.LANDING);
    expect(ms).toBe(0);
    expect(el.classList.contains(BEAT.LANDING)).toBe(true);
    vi.runAllTimers();
    expect(el.classList.contains(BEAT.LANDING)).toBe(false);
  });

  // A CSS animation does not replay because a class was already there, so a repeat
  // attempt at the same element has to take the class off and put it back.
  it('restarts on a repeat, so a second attempt is felt again', () => {
    playBeat(el, BEAT.NUDGE);
    vi.runAllTimers();
    expect(el.classList.contains(BEAT.NUDGE)).toBe(false);
    playBeat(el, BEAT.NUDGE);
    expect(el.classList.contains(BEAT.NUDGE)).toBe(true);
  });

  it('restarts while still marked from the previous attempt', () => {
    playBeat(el, BEAT.NUDGE);
    expect(el.classList.contains(BEAT.NUDGE)).toBe(true);
    // No timer run in between: the class was still on, and must come off and go back
    // on rather than be left alone.
    const spy = vi.spyOn(el.classList, 'remove');
    playBeat(el, BEAT.NUDGE);
    expect(spy).toHaveBeenCalledWith(BEAT.NUDGE);
    expect(el.classList.contains(BEAT.NUDGE)).toBe(true);
  });

  it('leaves other classes alone', () => {
    el.className = 'wp-board is-tappable';
    playBeat(el, BEAT.LANDING);
    vi.runAllTimers();
    expect(el.className.split(' ').sort()).toEqual(['is-tappable', 'wp-board']);
  });

  it('every beat is a distinct class', () => {
    expect(new Set(Object.values(BEAT)).size).toBe(Object.values(BEAT).length);
  });
});
