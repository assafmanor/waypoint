// **Measuring a box that a render is about to replace.**
//
// `locator.boundingBox()` resolves the node and then asks Chromium for its box model in a
// second round trip. If a React render detaches that node in between, the box-model call
// fails and Playwright returns **`null`** — it does not re-resolve the locator the way an
// action would. So the caller reads "this element is not visible" about an element that is
// visible before the call and visible after it, and the only tell is that the very next query
// succeeds.
//
// Proven rather than assumed (day-swipe, 2026-08-22): resolving the handle first and asking it
// afterwards reported `isConnected=false`, `getClientRects().length === 0`, and a fresh query
// in the same tick returning the correct `350x26` box.
//
// It surfaced on the day surface because a committed page turn swaps the day under the spec —
// and ADR-0116 §2d's third repair is what made it visible, by moving the commit onto the
// rendering clock so the URL changes closer to the paint that replaces the node. Nothing about
// it is specific to that surface: any spec measuring a box on a surface that re-renders can
// read a null here, which is why this lives beside `touch.ts` rather than inside one spec.
import { expect, type Locator } from '@playwright/test';

/** Per-attempt bound: generous next to a box read, short next to the poll around it. */
const ATTEMPT_MS = 1_000;
/** How long the element may keep being replaced before this is a real failure. Stated rather
 *  than inherited, because `expect`'s default is a different number's job. */
const POLL_MS = 5_000;

/** The locator's box, re-resolved until a render stops replacing the node under it. Fails the
 *  test with Playwright's own polling timeout if the element genuinely has no box, so an
 *  element that is really invisible still reports as a failure rather than as a retry. */
export async function stableBox(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  let box: Awaited<ReturnType<Locator['boundingBox']>> = null;
  await expect
    .poll(
      async () => {
        // **Each attempt is bounded, and the default is what makes that worth saying.**
        // `boundingBox()` inherits `use.actionTimeout`, which this config does not set — so it
        // is **0, meaning no timeout at all**, and a locator that never resolves hangs until
        // the TEST times out. That surfaces as `Test timeout of 30000ms exceeded` naming no
        // element at all. Bounding each attempt turns the same condition into this helper's own
        // polling failure, carrying the locator in its message.
        //
        // Caught rather than allowed to escape: an expired `boundingBox` REJECTS, and a throw
        // inside `expect.poll` is the caller's error rather than a retry — which would turn the
        // one slow attempt this helper exists to absorb into a hard failure.
        try {
          box = await locator.boundingBox({ timeout: ATTEMPT_MS });
        } catch {
          box = null;
        }
        return box !== null;
      },
      { timeout: POLL_MS, message: `no box for ${locator} — it never stopped being replaced` },
    )
    .toBe(true);
  return box!;
}
