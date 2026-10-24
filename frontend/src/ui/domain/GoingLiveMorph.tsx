// **The prep hero becomes the board** (ADR-0221 §4) — the first morning's host on Trip Home.
//
// A shared element, not a recolour: the violet plan face and the board are the same box at
// the same place, so the first open lets one turn into the other. Both faces sit in one grid
// cell (`HeroLift` keeps the collapsed board under the lifted card the same way); while the
// Shell holds the chrome at plan the face is shown over a dormant board, and when the chrome
// flips the face fades AND SHRINKS to the board's height over `--t-cinematic` while the
// board's own shipped power-on is delayed to the end of the fade, so the ignition is the
// climax and not the overture.
//
// Both heights are read off the DOM at play time, never constants — the same rule the lift's
// flight follows (ADR-0193 §4). The owner caught the first cut keeping the plan hero's height
// on a device, which is why the height transition exists at all.
//
// Skippable by a tap anywhere on it (`onSkip`): a celebration you cannot interrupt is a modal
// dialog wearing a costume. Under reduced motion the sequence never starts, so this never
// mounts with a face.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GOING_LIVE_STAGE, type GoingLiveStage } from '../../state/mode-state';

export function GoingLiveMorph({
  stage,
  face,
  children,
  onSkip,
}: {
  stage: GoingLiveStage;
  /** The plan face (`PrepHero`), rendered until the morph is over. */
  face: ReactNode;
  /** The board. */
  children: ReactNode;
  onSkip: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // Pin the face at its measured height while held, so the shrink has a start value; on the
  // flip, send it to the board's own height in the same commit as the stage attribute.
  useLayoutEffect(() => {
    const el = host.current;
    const faceEl = el?.querySelector<HTMLElement>(':scope > .prep');
    const board = el?.querySelector<HTMLElement>(':scope > .wp-board');
    if (!faceEl || !board) return;
    if (stage === GOING_LIVE_STAGE.HOLD) {
      faceEl.style.height = `${faceEl.getBoundingClientRect().height}px`;
    } else {
      faceEl.style.height = `${board.getBoundingClientRect().height}px`;
    }
  }, [stage]);
  const dataStage =
    stage === GOING_LIVE_STAGE.HOLD ? 'plan' : stage === GOING_LIVE_STAGE.MORPH ? 'morph' : 'board';
  const live = stage !== GOING_LIVE_STAGE.DONE;
  return (
    <div
      ref={host}
      className="prep-morph"
      data-stage={dataStage}
      onClick={live ? onSkip : undefined}
    >
      {live && face}
      {children}
    </div>
  );
}
