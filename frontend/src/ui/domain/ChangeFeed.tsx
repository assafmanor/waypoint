// ChangeFeed (domain, review U-09 / ADR-0081). A QUIET, dismissable strip that
// narrates recent SHARED peer edits ("נועם הזיז את ראמן ל-20:00"). NOT a second
// loud element (design-language "one loud element" — the board is the only loud
// surface): neutral chrome, no amber/teal/plan. Auto-collapses to nothing when
// empty, so it costs no space until a peer actually changes something.
//
// Presentational only: entries + `now` (for relative time) + dismiss handlers
// via props — no trip-state, no screen imports (dependency direction §12). The
// buffer + attribution live in state/change-feed.tsx.
import { type ChangeEntry } from '../../state/change-feed';
import { t } from '../../i18n/he';
import './change-feed.css';

export interface ChangeFeedProps {
  entries: ChangeEntry[];
  /** Current time in ms, for relative "לפני N ד׳" labels (re-renders per tick). */
  now: number;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

type Rel = { now: true } | { n: number; unit: string };

function relTime(atMs: number, nowMs: number): Rel {
  const minutes = Math.max(0, Math.floor((nowMs - atMs) / 60_000));
  if (minutes < 1) return { now: true };
  if (minutes < 60) return { n: minutes, unit: t.changeFeed.relTime.minUnit };
  return { n: Math.floor(minutes / 60), unit: t.changeFeed.relTime.hrUnit };
}

export function ChangeFeed({ entries, now, onDismiss, onDismissAll }: ChangeFeedProps) {
  if (entries.length === 0) return null;
  const rt = t.changeFeed.relTime;
  return (
    <section className="wp-changefeed" aria-label={t.changeFeed.title}>
      <div className="cf-head">
        <span className="cf-title">{t.changeFeed.title}</span>
        <button
          type="button"
          className="cf-clear"
          onClick={onDismissAll}
          aria-label={t.changeFeed.clearAllLabel}
        >
          {t.changeFeed.clearAll}
        </button>
      </div>
      {/* role=log + polite/additions: a new peer change is announced calmly once,
          and per-tick relative-time updates to existing lines are not re-read. */}
      <ul className="cf-list" role="log" aria-live="polite" aria-relevant="additions">
        {entries.map((e) => {
          const rel = relTime(e.at, now);
          return (
            <li key={e.id} className="cf-item">
              <span className="cf-line">
                <b className="cf-actor">{e.actorName}</b> {e.lead}
                {e.time && (
                  <span className="cf-time" dir="ltr">
                    {e.time}
                  </span>
                )}
              </span>
              <span className="cf-meta" dir="rtl">
                {'now' in rel ? (
                  rt.now
                ) : (
                  <>
                    {rt.prefix}{' '}
                    <span className="cf-num" dir="ltr">
                      {rel.n}
                    </span>{' '}
                    {rel.unit}
                  </>
                )}
              </span>
              <button
                type="button"
                className="cf-x"
                onClick={() => onDismiss(e.id)}
                aria-label={t.changeFeed.dismiss}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
