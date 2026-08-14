// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAP_DRAG_ZOOM, MAP_LOAD_TIMEOUT_MS, MAP_ZOOM } from '../constants';
import { clearTuning, publishMapReading, tuningOverrides } from '../lib/dev-tuning';
import { zoomPerLevelPx } from '../lib/canvas-gestures';
import { THEME } from '../lib/theme';
import { DevMapTuner } from './DevMapTuner';

afterEach(() => {
  cleanup();
  clearTuning();
  document.documentElement.removeAttribute('data-theme');
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

  // Field report #28 / backlog workstream M: the load-failure capture rides on
  // production's OWN `onError`/`onTilesLoaded` signals (published via `publishMapReading`
  // exactly as `MapPane` does), so this only has to assert the panel reads them — not
  // re-derive the failure detection this suite already covers in `MapPane.test.tsx`.
  it('shows the load-failure diagnostics captured off production’s own signals', () => {
    publishMapReading({
      apiStatus: 'LOADED',
      apiError: null,
      tilesLoaded: true,
      tilesLoadedMs: 1234,
      webglContextLost: false,
      online: true,
    });
    open('diag');
    expect(screen.getByText(/api status: LOADED/)).toBeTruthy();
    expect(screen.getByText(/tiles loaded this attempt: yes/)).toBeTruthy();
    expect(screen.getByText(/webgl context lost: no/)).toBeTruthy();
    expect(screen.getByText(/online: yes/)).toBeTruthy();
    // Field report #35's deciding measurement, shown against the bound it is judged by:
    // a boolean cannot tell a hard failure from a first paint that was merely slow.
    expect(
      screen.getByText(`tiles paint: 1234ms of ${MAP_LOAD_TIMEOUT_MS.TILES}ms bound`),
    ).toBeTruthy();
  });

  it('reports the live document theme without legacy Google build configuration', () => {
    open('diag');
    document.documentElement.dataset.theme = THEME.dark;
    tap('measure');
    expect(screen.getByText(`document theme now: ${THEME.dark}`)).toBeTruthy();
    expect(screen.queryByText(/mapId:/)).toBeNull();
    expect(screen.queryByText(/colorScheme:/)).toBeNull();
  });

  it('emits the diagnostics block alongside the tuning report', () => {
    publishMapReading({
      apiStatus: 'FAILED',
      apiError: 'boom',
      tilesLoaded: false,
      tilesLoadedMs: null,
    });
    open('out');
    tap('emit');
    const value = (screen.getByRole('textbox') as HTMLTextAreaElement).value;
    expect(value).toContain('## load diagnostics (#28)');
    expect(value).toContain('api status: FAILED');
    expect(value).toContain('last error: boom');
    expect(value).not.toContain('mapId:');
    expect(value).not.toContain('colorScheme:');
    // A sitting that never got a paint has to say so as plainly as one that did — an absent
    // line would read as "not captured" where this reads as the finding it is.
    expect(value).toContain(
      `tiles paint: (never painted) ms of MAP_LOAD_TIMEOUT_MS.TILES ${MAP_LOAD_TIMEOUT_MS.TILES} ms`,
    );
  });

  it('resets everything, so a sitting can start over without a reload', () => {
    open();
    tap('zoom: place up');
    tap('out');
    tap('reset');
    expect(tuningOverrides()).toEqual({});
  });
});
