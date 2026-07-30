import { useCallback, useState, type CSSProperties } from 'react';
import { MAP_CARD_BODY_H, MAP_SHEET_STOPS } from '../constants';
import { zoomPerLevelPx } from '../lib/canvas-gestures';
import {
  clearTuning,
  mapReading,
  setTuning,
  tuningOverrides,
  type DevTunableKey,
} from '../lib/dev-tuning';
import { DevPanel } from './DevPanel';
import {
  MAP_LOOK_QUESTIONS,
  MAP_TUNABLES,
  tuningWarnings,
  type LookQuestionKey,
  type MapTunable,
} from './map-tunables';

// The device-pass instrument (ADR-0146). Dev-only: `screens/Map.tsx` mounts it behind
// `import.meta.env.DEV`, as a SIBLING inside the split — never a wrapper around
// `<MapPane>`, which would remount it, and a remount is a billed map load (ADR-0121 §4).
//
// Three things it does, because the cluster it serves is three kinds of thing (§1):
// steppers for the seven preferences, readouts for the two values that turned out to be
// measurements rather than tastes, and a checklist for the five look questions that need
// no control at all. Then it emits all of it as text, because a sitting whose result
// cannot be reproduced has to be repeated.
//
// **Steppers, not sliders** (§5): a slider fires tens of events per gesture — the
// re-render shape this surface is most expensive about — and cannot reliably land on 0.40
// under a thumb, so the value chosen would not be the value reportable.

type LookAnswer = 'ok' | 'bad';

/** One section open at a time, because the panel must not cover the thing being judged —
 *  the same reason `DevTimeTravel` is a badge. All four at once measured 430px of an 844px
 *  phone, which is the whole canvas at the `half` stop. */
const SECTION = { tune: 'tune', read: 'read', look: 'look', out: 'out' } as const;
type Section = (typeof SECTION)[keyof typeof SECTION];

export function DevMapTuner() {
  const [section, setSection] = useState<Section>(SECTION.tune);
  const [overrides, setOverrides] = useState(() => tuningOverrides());
  const [looks, setLooks] = useState<Partial<Record<LookQuestionKey, LookAnswer>>>({});
  const [readings, setReadings] = useState(() => measure());
  const [emitted, setEmitted] = useState<string | null>(null);

  const refresh = useCallback(() => setReadings(measure()), []);

  const bump = (t: MapTunable, direction: 1 | -1) => {
    const current = overrides[t.key] ?? t.base;
    const next = clampStep(current + direction * t.step, t);
    setTuning(t.key, next === t.base ? undefined : next);
    setOverrides(tuningOverrides());
    refresh();
  };

  const reset = () => {
    clearTuning();
    setOverrides({});
    setEmitted(null);
  };

  const dirty = Object.keys(overrides).length > 0 || Object.keys(looks).length > 0;
  const warnings = tuningWarnings(chosenValues(overrides));

  return (
    <DevPanel icon="settings" label="map tuning" slot={1} active={dirty} column>
      <div style={rowStyle}>
        {Object.values(SECTION).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSection(id);
              if (id === SECTION.read) refresh();
            }}
            aria-pressed={section === id}
            style={{ flex: 1, opacity: section === id ? 1 : 0.5 }}
          >
            {id}
          </button>
        ))}
      </div>

      {section === SECTION.tune &&
        MAP_TUNABLES.map((t) => {
          const value = overrides[t.key] ?? t.base;
          return (
            <div key={t.key} style={rowStyle}>
              <span style={labelStyle}>{t.label}</span>
              <button type="button" onClick={() => bump(t, -1)} aria-label={`${t.label} down`}>
                −
              </button>
              <span
                style={{ ...valueStyle, color: t.key in overrides ? '#ffc46b' : '#fff' }}
                data-tune={t.key}
              >
                {format(value, t)}
              </span>
              <button type="button" onClick={() => bump(t, 1)} aria-label={`${t.label} up`}>
                +
              </button>
            </div>
          );
        })}

      {/* A broken combination is stated rather than made unreachable (§7): narrowing the
          steppers so a bad pair could not be expressed would make them lie about what the
          constants can be. Shown in every section, since it survives a section change. */}
      {warnings.length > 0 && (
        <div style={warnStyle} role="status">
          {warnings.map((w) => (
            <div key={w}>! {w}</div>
          ))}
        </div>
      )}

      {/* The readings (§1b). `half`'s fraction is read off the drag the app already has,
          and the card's body is measured — neither is a number anyone has to pick, which
          is why neither has a stepper in `tune`. */}
      {section === SECTION.read && (
        <div style={readoutStyle}>
          <div>live zoom: {readings.zoom ?? '-'}</div>
          <div>
            sheet: {readings.sheetFraction ?? '-'} of {readings.splitH ?? '-'} (stop {HALF_FRACTION}
            )
          </div>
          <div>
            card body: {readings.cardH ?? '-'} (const {MAP_CARD_BODY_H})
          </div>
          <div>
            pane {readings.paneH ?? '-'} / {readings.perLevel ?? '-'} px per level
          </div>
          <button type="button" onClick={refresh}>
            measure
          </button>
        </div>
      )}

      {section === SECTION.look &&
        MAP_LOOK_QUESTIONS.map((q) => (
          <div key={q.key} style={rowStyle}>
            <span style={labelStyle}>
              {q.label} <span style={{ opacity: 0.5 }}>#{q.adr}</span>
            </span>
            {(['ok', 'bad'] as const).map((answer) => (
              <button
                key={answer}
                type="button"
                aria-label={`${q.key} ${answer}`}
                aria-pressed={looks[q.key] === answer}
                onClick={() =>
                  setLooks((prev) => ({
                    ...prev,
                    [q.key]: prev[q.key] === answer ? undefined : answer,
                  }))
                }
                style={{ opacity: looks[q.key] === answer ? 1 : 0.45 }}
              >
                {answer === 'ok' ? '✓' : '✗'}
              </button>
            ))}
          </div>
        ))}

      {section === SECTION.out && (
        <>
          <div style={rowStyle}>
            <button type="button" onClick={() => setEmitted(emit(overrides, looks, measure()))}>
              emit
            </button>
            <button type="button" onClick={reset}>
              reset
            </button>
          </div>
          {/* Selectable text FIRST, the clipboard only as a bonus (§6): the sitting happens
              on a phone reaching the dev server over http on the LAN, which is not a secure
              context, so `navigator.clipboard` is undefined exactly there. */}
          {emitted !== null && (
            <>
              <textarea readOnly value={emitted} rows={12} style={emitStyle} />
              <button type="button" onClick={() => void copy(emitted)}>
                copy
              </button>
            </>
          )}
        </>
      )}
    </DevPanel>
  );
}

const HALF_FRACTION =
  'fraction' in MAP_SHEET_STOPS.half ? MAP_SHEET_STOPS.half.fraction : undefined;

/** The full chosen set, defaults filled in — what the invariants are checked against. */
function chosenValues(
  overrides: Partial<Record<DevTunableKey, number>>,
): Record<DevTunableKey, number> {
  const out = {} as Record<DevTunableKey, number>;
  for (const t of MAP_TUNABLES) out[t.key] = overrides[t.key] ?? t.base;
  return out;
}

function clampStep(value: number, t: MapTunable): number {
  const clamped = Math.min(Math.max(value, t.min), t.max);
  return Number(clamped.toFixed((t.decimals ?? 0) + 2));
}

function format(value: number, t: MapTunable): string {
  return t.decimals ? value.toFixed(t.decimals) : String(value);
}

interface Readings {
  zoom: number | null;
  paneH: number | null;
  splitH: number | null;
  sheetH: number | null;
  sheetFraction: string | null;
  cardH: number | null;
  perLevel: number | null;
}

/** One layout read, on demand, which is exactly the thing prod may not do on this screen
 *  (ADR-0128 §2: `MAP_CARD_BODY_H` is a constant because the screen re-renders every
 *  second, not because 130 is a preference). A dev panel measuring it once is the
 *  instrument that was missing. */
function measure(): Readings {
  const height = (selector: string) => {
    const el = typeof document === 'undefined' ? null : document.querySelector(selector);
    const box = el?.getBoundingClientRect();
    return box && box.height > 0 ? Math.round(box.height) : null;
  };
  const paneH = height('.map-pane');
  const splitH = height('.map-split');
  const sheetH = height('.wp-snapsheet');
  return {
    zoom: mapReading().zoom,
    paneH,
    splitH,
    sheetH,
    sheetFraction: sheetH && splitH ? (sheetH / splitH).toFixed(3) : null,
    cardH: height('.map-placecard'),
    perLevel: paneH ? Math.round(zoomPerLevelPx(paneH)) : null,
  };
}

function emit(
  overrides: Partial<Record<DevTunableKey, number>>,
  looks: Partial<Record<LookQuestionKey, LookAnswer>>,
  readings: Readings,
): string {
  const lines = ['# map device pass — ADR-0146', ''];
  lines.push(`viewport ${window.innerWidth}×${window.innerHeight}`);
  lines.push('');
  lines.push('## preferences');
  for (const t of MAP_TUNABLES) {
    const chosen = overrides[t.key];
    lines.push(
      chosen === undefined
        ? `${t.path}: ${format(t.base, t)} (unchanged)`
        : `${t.path}: ${format(t.base, t)} → ${format(chosen, t)}`,
    );
  }
  lines.push('');
  lines.push('## readings');
  lines.push(
    `MAP_SHEET_STOPS.half.fraction: ${HALF_FRACTION} → ${readings.sheetFraction ?? '?'}` +
      ` (sheet ${readings.sheetH ?? '?'} of split ${readings.splitH ?? '?'})`,
  );
  lines.push(`MAP_CARD_BODY_H: ${MAP_CARD_BODY_H} → ${readings.cardH ?? 'card not open'}`);
  lines.push(`live zoom at emit: ${readings.zoom ?? '?'}`);
  lines.push(`pane ${readings.paneH ?? '?'} → ${readings.perLevel ?? '?'} px/level in force`);
  lines.push('');
  lines.push('## look questions');
  for (const q of MAP_LOOK_QUESTIONS) {
    const answer = looks[q.key];
    lines.push(
      `ADR-${q.adr} ${q.label}: ${answer === 'ok' ? 'OK' : answer === 'bad' ? 'NO' : '?'}`,
    );
  }
  const warnings = tuningWarnings(chosenValues(overrides));
  if (warnings.length > 0) {
    lines.push('');
    lines.push('## INVARIANTS VIOLATED — do not land these as they stand');
    for (const w of warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n');
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Absent on an insecure origin, which is the normal case here — the textarea above is
    // the way out, not this.
  }
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4 };
const labelStyle: CSSProperties = { flex: 1, minWidth: 0, fontSize: 11 };
const valueStyle: CSSProperties = {
  minWidth: 34,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
};
const readoutStyle: CSSProperties = { fontSize: 11, lineHeight: 1.5, opacity: 0.9 };
const warnStyle: CSSProperties = { fontSize: 10, lineHeight: 1.4, color: '#ffb0a0', paddingTop: 2 };
const emitStyle: CSSProperties = { width: '100%', fontSize: 10, fontFamily: 'monospace' };
