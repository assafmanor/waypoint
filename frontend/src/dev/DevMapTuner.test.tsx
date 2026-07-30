// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAP_DRAG_ZOOM, MAP_ZOOM } from '../constants';
import { clearTuning, tuningOverrides } from '../lib/dev-tuning';
import { zoomPerLevelPx } from '../lib/drag-zoom';
import { DevMapTuner } from './DevMapTuner';

afterEach(() => {
  cleanup();
  clearTuning();
});

const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

const open = (section?: string) => {
  render(<DevMapTuner />);
  tap('map tuning');
  if (section) tap(section);
};

describe('DevMapTuner', () => {
  it('is a badge until it is tapped, so it never covers the tab it sits on', () => {
    render(<DevMapTuner />);
    expect(screen.getByRole('button', { name: 'map tuning' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'zoom: place up' })).toBeNull();
  });

  it('steps a tunable and the pure reader picks it up with no prop and no re-render', () => {
    open();
    expect(zoomPerLevelPx(500)).toBe(MAP_DRAG_ZOOM.PX_PER_LEVEL);
    tap('drag: px / level down');
    expect(zoomPerLevelPx(500)).toBe(MAP_DRAG_ZOOM.PX_PER_LEVEL - 10);
  });

  it('clamps at the range ends rather than running past them', () => {
    open();
    for (let i = 0; i < 20; i += 1) tap('zoom: dots below down');
    expect(tuningOverrides().zoomDotBelow).toBe(6);
  });

  it('drops the override when a value is stepped back to its constant', () => {
    open();
    tap('zoom: place up');
    expect(tuningOverrides().zoomPlace).toBe(MAP_ZOOM.PLACE + 1);
    tap('zoom: place down');
    // Back at the constant means nothing is overridden — so `reset` and "step back" agree,
    // and the emitted block says "unchanged" rather than restating the default as a choice.
    expect(tuningOverrides().zoomPlace).toBeUndefined();
  });

  it('warns when a combination breaks an invariant instead of silently allowing it', () => {
    open();
    expect(screen.queryByText(/dot tier/)).toBeNull();
    // Walk `dots below` up past `zoom: place`, which is the pairing that would deliver you
    // to a place at a zoom where every pin is a dot.
    for (let i = 0; i < 4; i += 1) tap('zoom: dots below up');
    expect(screen.getByText(/dot tier/)).toBeTruthy();
  });

  it('emits selectable text naming each constant, its default and the choice', () => {
    open();
    tap('zoom: place down');
    tap('out');
    tap('emit');
    const block = screen.getByRole('textbox') as HTMLTextAreaElement;
    // A textarea, not only a clipboard write: the sitting happens on a phone reaching the
    // dev server over http on the LAN, where `navigator.clipboard` does not exist.
    expect(block.hasAttribute('readonly')).toBe(true);
    expect(block.value).toContain(`MAP_ZOOM.PLACE: ${MAP_ZOOM.PLACE} → ${MAP_ZOOM.PLACE - 1}`);
    expect(block.value).toContain('MAP_ZOOM.MAX_FIT: 15 (unchanged)');
    expect(block.value).toContain('MAP_SHEET_STOPS.half.fraction');
    expect(block.value).toContain('MAP_CARD_BODY_H');
  });

  it('records the five look questions, which have no control and still need an answer', () => {
    open('look');
    tap('hatchIsTexture bad');
    tap('areaPillTappable ok');
    tap('out');
    tap('emit');
    const value = (screen.getByRole('textbox') as HTMLTextAreaElement).value;
    expect(value).toContain('ADR-0130 maybe hatch = texture at 34px, not noise: NO');
    expect(value).toContain('ADR-0126 באזור pill reads as tappable: OK');
    // Unanswered stays visibly unanswered rather than defaulting to fine.
    expect(value).toContain('crosshair ≠ frame glyph over real tiles: ?');
  });

  it('resets everything, so a sitting can start over without a reload', () => {
    open();
    tap('zoom: place up');
    tap('out');
    tap('reset');
    expect(tuningOverrides()).toEqual({});
  });
});
