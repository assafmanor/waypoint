// **Coming home** (ADR-0241 §3): the first open of a finished trip plays a short beat before the
// memory Home. An opener, then `memoryFigures` one card at a time counting up, then the card
// settles into the cover over `--t-cinematic`.
//
// A `Modal` at `full`, so back, Escape and `דילוג` are one skip (ADR-0103). Presentational: the
// screen decides whether it plays and remembers that it did.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { COMING_HOME } from '../../constants';
import { autoIsolate } from '../../lib/bidi';
import { motionDurationMs } from '../../lib/motion';
import type { MemoryFigure } from '../../lib/memory-home';
import { useCountUp } from '../../lib/useCountUp';
import { t } from '../../i18n/he';
import { Avatar, type AvatarPerson } from '../primitives/Avatar';
import { Modal } from '../primitives/Modal';
import './memory-cover.css';
import './coming-home.css';

export interface ComingHomeProps {
  name: string;
  /** The cover's own `when` line, composed by the screen. */
  when: string;
  people: readonly (AvatarPerson & { id: string })[];
  figures: readonly MemoryFigure[];
  /** The beat ended, was skipped or backed out of. */
  onDone: () => void;
}

/** A figure's value split so its number can count up and keep the figure's own face: the `~` of
 *  an estimate, the sign of a clock shift, a decimal, a thousands comma. */
const FIGURE = /^([~+-]?)([\d,]+)(?:\.(\d+))?$/;

function CountedValue({ value }: { value: string }) {
  const parts = FIGURE.exec(value);
  const decimals = parts?.[3]?.length ?? 0;
  const scaled = parts
    ? Math.round(Number(`${parts[2]!.replace(/,/g, '')}.${parts[3] ?? '0'}`) * 10 ** decimals)
    : 0;
  const shown = useCountUp(scaled, parts != null);
  if (!parts) return <>{value}</>;
  const number = decimals
    ? (shown / 10 ** decimals).toFixed(decimals)
    : parts[2]!.includes(',')
      ? shown.toLocaleString('en-US')
      : String(shown);
  return <>{`${parts[1]}${number}`}</>;
}

export function ComingHome({ name, when, people, figures, onDone }: ComingHomeProps) {
  /** -1 is the opener; then an index into `figures`. */
  const [step, setStep] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const [settle, setSettle] = useState<CSSProperties | null>(null);
  const beatRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, then: () => void) => void timers.current.push(setTimeout(then, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** **The settle, a FLIP**: the beat clips to the cover card's box as it is measured NOW, and
   *  fades, with the memory Home already mounted beneath it. */
  const startSettle = useCallback(() => {
    const beat = beatRef.current?.getBoundingClientRect();
    const cover = document.querySelector('.mem-cover')?.getBoundingClientRect();
    if (beat && cover) {
      setSettle({
        '--to-top': `${Math.max(0, cover.top - beat.top)}px`,
        '--to-right': `${Math.max(0, beat.right - cover.right)}px`,
        '--to-bottom': `${Math.max(0, beat.bottom - cover.bottom)}px`,
        '--to-left': `${Math.max(0, cover.left - beat.left)}px`,
      } as CSSProperties);
    } else setSettle({});
    later(motionDurationMs('--t-cinematic'), onDone);
    // `later` is a stable closure over a ref.
  }, [onDone]);

  const advance = useCallback(() => {
    if (leaving || settle) return;
    setLeaving(true);
    later(motionDurationMs('--t-quick'), () => {
      setLeaving(false);
      if (step + 1 < figures.length) setStep(step + 1);
      else startSettle();
    });
  }, [leaving, settle, step, figures.length, startSettle]);

  // Each card holds for its dwell, then moves on by itself. A tap is the same `advance`.
  useEffect(() => {
    if (leaving || settle) return;
    const id = setTimeout(advance, step < 0 ? COMING_HOME.OPEN_HOLD_MS : COMING_HOME.CARD_MS);
    return () => clearTimeout(id);
  }, [step, leaving, settle, advance]);

  const figure = step >= 0 ? figures[step] : undefined;
  return (
    <Modal variant="full" ariaLabel={t.planHome.past.comingHome.kicker} onClose={onDone}>
      {(close) => (
        <div
          ref={beatRef}
          className={'mem-beat' + (settle ? ' is-settling' : '')}
          style={settle ?? undefined}
          onClick={advance}
        >
          <div className="mem-beat-top">
            <div className="mem-beat-steps" aria-hidden="true">
              {figures.map((f, i) => (
                <i key={f.key} className={i <= step ? 'on' : undefined} />
              ))}
            </div>
            <button
              type="button"
              className="mem-beat-skip"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
            >
              {t.planHome.past.comingHome.skip}
            </button>
          </div>
          <div className="mem-beat-stage" aria-live="polite">
            {figure ? (
              <div key={figure.key} className={'mem-beat-card' + (leaving ? ' is-leaving' : '')}>
                <span className="mem-beat-v" dir="auto">
                  <CountedValue value={figure.value} />
                </span>
                <span className="mem-beat-l">{figure.label}</span>
                {!!figure.unresolved && (
                  <span className="mem-beat-open">
                    {t.planHome.past.unresolved(figure.unresolved)}
                  </span>
                )}
              </div>
            ) : (
              <div className={'mem-beat-card' + (leaving ? ' is-leaving' : '')}>
                <span className="mem-beat-kicker">{t.planHome.past.comingHome.kicker}</span>
                <h2 className="mem-beat-name">{autoIsolate(name)}</h2>
                <span className="mem-beat-when">{when}</span>
                {people.length > 0 && (
                  <span className="mem-faces-row">
                    {people.map((person) => (
                      <Avatar key={person.id} person={person} size="inherit" />
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
