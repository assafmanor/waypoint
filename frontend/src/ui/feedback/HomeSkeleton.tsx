// HomeSkeleton — tier 2's content-shaped snapshot skeleton (ADR-0105). Renders
// the two per-mode shapes Home resolves into using the REAL component classes
// (`ui/domain/board.css`'s `.wp-board-*`, `screens.css`'s `.quick`/`.qa`/
// `.prep-*`/`.checklist`/`.chk-*`, `ui/domain/glance-card.css`'s `.glance-day` +
// `styles/day-track.css`'s `.wp-track`)
// with `Skeleton` bars standing in for text — not a parallel hand-tuned
// stylesheet. A real-class change (padding, radius, a hero gradient) is
// inherited automatically instead of the skeleton silently drifting out of
// shape (ADR-0096: reuse existing infra rather than a second copy of it).
// Both real stylesheets are already eager-bundled (Home.tsx pulls both in
// and is itself eager, F-07), so no extra import is needed here.
// The only tier that needs a mode variant (the ADR's own reasoning) — the
// chrome is already mode-themed by the time this shows, and a board skeleton
// popping into a violet hero (or vice versa) would jar. Purely decorative
// like the base Skeleton, so the whole thing is aria-hidden; the caller's
// LoadingState carries the one announced label.
import type { Mode } from '../../lib/mode';
import { Skeleton } from './Skeleton';

function TripHomeSkeleton() {
  return (
    <>
      <div className="wp-board">
        <div className="wp-board-top">
          <Skeleton shape="line" height={10} width={64} />
          <Skeleton shape="line" height={15} width={54} />
        </div>
        <div className="wp-board-now-title">
          <Skeleton shape="block" height={21} width="72%" />
        </div>
        <div className="wp-board-now-meta">
          <Skeleton shape="line" height={12} width="50%" />
        </div>
        <div className="wp-board-divider" />
        <div className="wp-board-next-row">
          <Skeleton shape="block" height={17} width={130} />
          <div className="wp-board-countdown">
            <Skeleton shape="block" height={21} width={30} />
          </div>
        </div>
        <div className="wp-board-progress" aria-hidden="true">
          <Skeleton shape="block" height={3} className="fb-skel-pill" />
        </div>
      </div>
      {/* Abstracted, not line-for-line: one shimmering bar for the track, one line for the
          sentence, one for the foot — the real `.glance-track`/`.glance-lead`/`.glance-foot`
          rhythm and its full height, without a rectangle per micro label. **And it sits HERE**,
          above the quick grid: the skeleton has to agree with the order the screen resolves into
          (ADR-0215 §1), or the loading state moves the card the moment the data lands. */}
      <div className="glance-day">
        <div className="wp-track glance-track">
          <div className="wp-track-marks" />
          <div className="track">
            <Skeleton shape="block" height={18} />
          </div>
        </div>
        <div className="glance-lead">
          <Skeleton shape="line" height={15} width={150} />
        </div>
        <div className="glance-foot">
          <Skeleton shape="line" height={12} width="60%" />
        </div>
      </div>
      <div className="quick">
        <div className="qa">
          <Skeleton shape="circle" width={20} height={20} />
          <Skeleton shape="line" height={11} width="70%" />
        </div>
        <div className="qa">
          <Skeleton shape="circle" width={20} height={20} />
          <Skeleton shape="line" height={11} width="70%" />
        </div>
        <div className="qa">
          <Skeleton shape="circle" width={20} height={20} />
          <Skeleton shape="line" height={11} width="70%" />
        </div>
      </div>
    </>
  );
}

function PlanHomeSkeleton() {
  return (
    <>
      <div className="prep">
        <div className="prep-count">
          <Skeleton shape="block" height={34} width="46%" />
        </div>
        <Skeleton shape="line" height={11} width="55%" />
        <div className="prep-ready">
          <div className="prep-track">
            <Skeleton shape="block" height={7} className="fb-skel-pill" />
          </div>
        </div>
      </div>
      {/* The checklist is `ListRow` since ADR-0190 — `.chk-row` and its parts retired with
          the convergence — so the skeleton follows it. Same rule as the rest of this file:
          the real classes, with `Skeleton` standing in for text, so the pre-draw cannot
          drift out of shape independently of what it is pre-drawing. No trailing CTA block
          either; that button was deleted with the row. */}
      <div className="checklist">
        {[46, 58, 38].map((titleWidth) => (
          <div className="wp-listrow" key={titleWidth}>
            <div className="wp-listrow-open">
              <span className="wp-listrow-badge">
                <Skeleton shape="circle" width={18} height={18} />
              </span>
              <span className="wp-listrow-main">
                <Skeleton shape="line" height={13} width={`${titleWidth}%`} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function HomeSkeleton({ mode }: { mode: Mode }) {
  return (
    <div className="fb-skel-home" aria-hidden="true">
      {mode === 'plan' ? <PlanHomeSkeleton /> : <TripHomeSkeleton />}
    </div>
  );
}
