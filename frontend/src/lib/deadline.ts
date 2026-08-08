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
 *  merely being ignored.
 *
 *  `linked` is the CALLER's own signal, for work that was already cancellable before it was
 *  bounded — a superseded keystroke's place search. Its abort is relayed to the one `work`
 *  actually receives, because a `fetch` takes exactly one signal: composing them here is
 *  what keeps a bound from quietly taking a cancellation away. (Not `AbortSignal.any`,
 *  which jsdom does not implement, so the test env would diverge from the browser.) */
export function withDeadline<T>(
  phase: string,
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
  linked?: AbortSignal | null,
): Promise<T> {
  const controller = new AbortController();
  const relay = () => controller.abort(linked?.reason);
  if (linked?.aborted) controller.abort(linked.reason);
  else linked?.addEventListener('abort', relay);
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
  return Promise.race([work(controller.signal), expiry]).finally(() => {
    clearTimeout(timer);
    linked?.removeEventListener('abort', relay);
  });
}

/** **Best-effort in time, not only in errors.** A local cache read that *throws* was always
 *  survivable; one that never *answers* was not — and since these stores sit in FRONT of the
 *  network, a jammed handle wedges a read before it can even fail over (field-report #20's
 *  Cache API, #22's IndexedDB). There is nothing to abort: the promise stays pending exactly
 *  as it was going to, and the only thing that changes is that we stop waiting on it.
 *
 *  The fallback is what "this store had no answer" means for that caller, so a new entry
 *  point is one line rather than another `try` block. */
export function bestEffort<T>(
  phase: string,
  ms: number,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  return withDeadline(phase, ms, work).catch(() => fallback);
}
