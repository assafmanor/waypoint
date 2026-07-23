// HomeSkeleton — tier 2's content-shaped snapshot skeleton (ADR-0105). Renders
// the two per-mode shapes Home resolves into using the REAL component classes
// (`ui/domain/board.css`'s `.wp-board-*`, `screens.css`'s `.quick`/`.qa`/
// `.prep-*`/`.checklist`/`.chk-*`, `ui/domain/glance-card.css`'s `.glance-day`)
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
      {/* Abstracted, not line-for-line: one shimmering bar standing in for the
          whole rail, one for the lead count, one for the free-until foot line —
          echoes the real .rail/.lead/.glance-foot rhythm (and its full height)
          without drawing a separate rectangle for every micro label. */}
      <div className="glance-day">
        <div className="rail">
          <Skeleton shape="block" height={14} />
        </div>
        <div className="lead">
          <Skeleton shape="block" height={32} width={90} />
        </div>
        <div className="glance-foot">
          <Skeleton shape="line" height={12} width="60%" />
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
      <div className="checklist">
        <div className="chk-row">
          <div className="chk-ic">
            <Skeleton shape="circle" width={18} height={18} />
          </div>
          <div className="chk-main">
            <Skeleton shape="line" height={13} width="46%" />
          </div>
          <Skeleton shape="block" width={68} height={28} />
        </div>
        <div className="chk-row">
          <div className="chk-ic">
            <Skeleton shape="circle" width={18} height={18} />
          </div>
          <div className="chk-main">
            <Skeleton shape="line" height={13} width="58%" />
          </div>
          <Skeleton shape="block" width={68} height={28} />
        </div>
        <div className="chk-row">
          <div className="chk-ic">
            <Skeleton shape="circle" width={18} height={18} />
          </div>
          <div className="chk-main">
            <Skeleton shape="line" height={13} width="38%" />
          </div>
          <Skeleton shape="block" width={68} height={28} />
        </div>
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
