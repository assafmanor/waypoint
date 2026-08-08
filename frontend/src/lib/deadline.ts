// **A bound on an await that has none.**
//
// A promise that never settles is not an error: `try`/`catch` sees nothing, `.catch()`
// never runs, `res.ok` is never reached, and whatever is waiting on it waits for the life
// of the page. That is not a hypothetical — it is field-report #20, where every one of the
// eight awaits in the document read path was unbounded and a jammed storage handle or a
// socket that went quiet left a spinner up until the app was restarted.
//
// Two kinds of phase, one mechanism:
//
//   - an **abortable** phase (`fetch`) is handed the signal and actually stops, so the
//     request is not left holding a connection after we have stopped listening;
//   - an **unabortable** one (the Cache API, `HTMLImageElement.decode`) is abandoned. Its
//     promise stays pending forever — which is what it was going to do anyway — and the
//     only thing that changes is that we are no longer waiting on it.
//
// Deliberately not the WS watchdog (`ws.ts`): that one re-arms on every inbound frame
// because a socket is a stream that proves itself alive repeatedly. A read is one answer,
// arriving once, so its bound is a plain deadline.

/** Thrown when a phase runs out of clock. Carries the phase so a caller can tell "the
 *  bytes are unreadable" from "nobody answered" — the viewer's decode does exactly that. */
export class PhaseTimeoutError extends Error {
  constructor(
    readonly phase: string,
    readonly ms: number,
  ) {
    super(`${phase} did not settle within ${ms}ms`);
    this.name = 'PhaseTimeoutError';
  }
}

/** Runs `work` under a deadline, rejecting with `PhaseTimeoutError` if it outlasts it.
 *  The signal is aborted at the same moment, so an abortable `work` stops rather than
 *  merely being ignored. */
export function withDeadline<T>(
  phase: string,
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PhaseTimeoutError(phase, ms));
    }, ms);
  });
  // `race` subscribes to both, so the loser rejecting later (an `AbortError` from the
  // fetch we just cancelled) is already handled and never surfaces as an unhandled
  // rejection.
  return Promise.race([work(controller.signal), expiry]).finally(() => clearTimeout(timer));
}
