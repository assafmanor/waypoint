// The device-pass panel's own table (ADR-0146 §1a): what each tunable is called, what it
// shadows, and the range the stepper offers. Dev-only — nothing in the app imports this
// file, so a production build drops it with the panel.
//
// The ranges are NOT cosmetic. ADR-0146 §7 asserts the cluster's invariants over every
// value a stepper here can produce, so the owner cannot step into a state that violates
// one and mistake it for a design failure. Widening a range means re-running those
// properties, which is the point.
import { MAP_DRAG_ZOOM, MAP_REFIT_FILL_SHARE, MAP_ZOOM } from '../constants';
import { TUNE, type DevTunableKey } from '../lib/dev-tuning';

export interface MapTunable {
  key: DevTunableKey;
  /** The `constants.ts` path, so the emitted block says what to edit (ADR-0146 §6). */
  path: string;
  /** Short enough to sit beside a stepper on a 360px phone. */
  label: string;
  base: number;
  min: number;
  max: number;
  step: number;
  /** Decimals to render, for the one fractional tunable. */
  decimals?: number;
}

export const MAP_TUNABLES: readonly MapTunable[] = [
  {
    key: TUNE.zoomPlace,
    path: 'MAP_ZOOM.PLACE',
    label: 'zoom: place',
    base: MAP_ZOOM.PLACE,
    min: 10,
    max: 19,
    step: 1,
  },
  {
    key: TUNE.zoomMaxFit,
    path: 'MAP_ZOOM.MAX_FIT',
    label: 'zoom: fit cap',
    base: MAP_ZOOM.MAX_FIT,
    min: 10,
    max: 20,
    step: 1,
  },
  {
    key: TUNE.zoomStepInMax,
    path: 'MAP_ZOOM.STEP_IN_MAX',
    label: 'zoom: ladder top',
    base: MAP_ZOOM.STEP_IN_MAX,
    min: 12,
    max: 21,
    step: 1,
  },
  {
    key: TUNE.zoomDotBelow,
    path: 'MAP_ZOOM.DOT_BELOW',
    label: 'zoom: dots below',
    base: MAP_ZOOM.DOT_BELOW,
    min: 6,
    max: 16,
    step: 1,
  },
  {
    key: TUNE.refitFillShare,
    path: 'MAP_REFIT_FILL_SHARE',
    label: 're-fit fill share',
    base: MAP_REFIT_FILL_SHARE,
    min: 0.1,
    max: 1,
    step: 0.05,
    decimals: 2,
  },
  {
    key: TUNE.dragPxPerLevel,
    path: 'MAP_DRAG_ZOOM.PX_PER_LEVEL',
    label: 'drag: px / level',
    base: MAP_DRAG_ZOOM.PX_PER_LEVEL,
    min: 40,
    max: 300,
    step: 10,
  },
  {
    key: TUNE.dragTapGapMs,
    path: 'MAP_DRAG_ZOOM.TAP_GAP_MS',
    label: 'drag: tap gap ms',
    base: MAP_DRAG_ZOOM.TAP_GAP_MS,
    min: 200,
    max: 900,
    step: 50,
  },
];

/** Every value a stepper can land on, which is what the property tests quantify over. */
export function tunableRange(t: MapTunable): number[] {
  const out: number[] = [];
  const places = t.decimals ?? 0;
  for (let v = t.min; v <= t.max + t.step / 2; v += t.step) {
    out.push(Number(v.toFixed(places + 2)));
  }
  return out;
}

/**
 * The invariants a chosen set must satisfy, checked live (ADR-0146 §7).
 *
 * The ranges deliberately overlap — narrowing them so a bad pair were unreachable would
 * make the steppers lie about what the constants can be — so the panel **says** when a
 * combination is broken instead. That is what keeps "the owner cannot step into a violating
 * state and mistake it for a design failure" true: they can step there, and it tells them.
 *
 * Each entry is named for the bug it prevents, not for the arithmetic.
 */
export function tuningWarnings(values: Record<DevTunableKey, number>): string[] {
  const out: string[] = [];
  if (values.zoomDotBelow >= values.zoomPlace) {
    // The camera would deliver you to a place at a zoom where every pin is a dot — i.e. to
    // precision it has just thrown away.
    out.push('dots below ≥ zoom: place — a focused place lands in dot tier');
  }
  if (values.zoomPlace > values.zoomMaxFit) {
    // A fit has real extent behind it; the no-extent fallback must not be the tighter one.
    out.push('zoom: place > fit cap — a guess is tighter than a real fit');
  }
  if (values.zoomMaxFit > values.zoomStepInMax) {
    out.push('fit cap > ladder top — locate cannot reach its own fit');
  }
  return out;
}

/** The five look questions (ADR-0146 §1c). No control — the panel carries them so the
 *  sitting records its own answers instead of reporting five judgements from memory. */
export const MAP_LOOK_QUESTIONS = [
  { key: 'crosshairVsFrame', adr: '0126', label: 'crosshair ≠ frame glyph over real tiles' },
  { key: 'bandHeavyAtHalf', adr: '0126', label: '44px band OK at half on 360×640' },
  { key: 'areaPillTappable', adr: '0126', label: 'באזור pill reads as tappable' },
  { key: 'hatchIsTexture', adr: '0130', label: 'maybe hatch = texture at 34px, not noise' },
  { key: 'asideSeparates', adr: '0130', label: '0.72 aside separates today from general' },
] as const;
export type LookQuestionKey = (typeof MAP_LOOK_QUESTIONS)[number]['key'];
