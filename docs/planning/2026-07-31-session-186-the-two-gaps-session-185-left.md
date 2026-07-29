# Session 186 — the two gaps session 185 left (2026-07-31)

Both backlog lines session 185 opened, closed. Two commits: the server-side un-consume, and
the `*Touched` generalisation. No new ADR — ADR-0136's Consequences is amended in place, which
is where the second one was promised.

Both turned out to be **bigger than the lines describing them said**, in the same way: the
line was written from memory of the design, and reading the code changed the answer. Worth
recording as a pattern, because it is the second session in a row where that happened (session
185's §1 amendment was the same shape).

## Gap 1 — the fix is not the one the backlog line proposed

The line said: _"one nullable field on the maybe-item patch schema (+ the service) and one line
in each undo."_ Reading `MaybeItemsService.update` refuted the first half twice over:

- **It is ADR-0116 §1's day-aim** — _a pencil mark, not a schedule_ — and its own comment says
  `consumed` is untouched by it deliberately. Folding a lifecycle flag into it muddles two
  decisions that were kept apart on purpose.
- **Its `apply` is not actually partial.** It writes `data: { targetDate: input.targetDate ?? null }`
  unconditionally, so a PATCH carrying only `consumed` would have **silently cleared the idea's
  day**. Nothing hits that today because the single caller always sends `targetDate` — but it
  would have been a real bug the moment the schema widened, introduced by the fix.

So it is `POST /maybe-items/:id/restore`, beside `consume`, and **idempotent for the same
reason `consume` is**: an undo can be replayed by an outbox flush that already succeeded. It is
named `restore` because that is already this app's word for "put it back" — it is what
un-skipping an event is called.

_(Left alone and worth naming: `update`'s non-partial `apply`. It is latent, not live, and
fixing it would change what an empty patch does for no caller that exists. If a second field
ever joins that schema, fix it first.)_

**The frontend half is one helper, not two lines.** `restoreConsumed` is what both undo paths
call — a plain schedule's and a booked save's — because the whole reason this line existed is
that the two had already drifted once: session 185 found the gap in `applySchedule` and matched
it in `applyBookEvent` rather than fixing one. Two callers of one helper cannot drift again.

The `create` undo descriptor gained the `maybeId` it consumed. That is the part that makes the
undo possible at all: without it the undo knows an event to delete and has no idea which shelf
item to hand back.

Queued through the outbox like every other write, with a `CACHE_CHANNELS` mirror, so an undo
made on a plane still lands and the shelf shows the idea back immediately rather than on
reconnect.

### The bug found on the way, and why the compiler had been silent

`t.sync.verb` was typed `as Record<string, string>`. It is read as `t.sync.verb[f.verb]`, so a
verb missing from it renders a queued failure with **no name at all** — and the loose cast made
that silent. It is now `satisfies Record<OutboxVerb, string>`, verified by deleting the new
label and watching tsc reject it in two places.

This is the exact anti-pattern `frontend/CLAUDE.md` names ("a missing case should be a compile
error, not a silent omission"), sitting in the file that holds every string in the app. Adding
an outbox verb is now a compile error there.

### And the backend tests run now

Session 185 reported 120 backend failures as pre-existing and deferred them to CI, which was
true but not good enough — the whole point of that suite is the data plane, and this change is
in it. There is no Docker in this sandbox, but there is a **Postgres 16 binary**: `initdb` as
the `postgres` user, `pg_ctl` on a socket in `/tmp`, then the repo's own `prisma migrate
deploy` and `prisma/seed.mjs` (the seed matters — the specs FK against `DEV_USER`). **198 pass**,
which also confirms the earlier failures were purely the missing database.

## Gap 2 — there were seven, not three

ADR-0136 said a third guard was the moment to generalise. Counting properly found **seven**:

| where          | fields                                        |
| -------------- | --------------------------------------------- |
| `EventForm`    | `iconTouched`, `kindTouched`, `bookedTouched` |
| `BookingSheet` | `iconTouched`, `kindTouched`                  |
| `CreateTrip`   | `nameTouched`, `iconTouched`                  |

The last two are the finding. They auto-suggest a trip's name and flag from the destination
until the user overrides either — the same mechanism, in a screen nobody had looked at because
it is not one of the two authoring forms. Seven copies of a rule is seven chances to forget the
guard on the eighth field.

`lib/useDerivedField` is the mechanism: `value` / `set` / `redrive` / `reset` / `touched`.

**Three design calls worth the ink:**

- **A value plus a flag, not a nullable override slot** — which is the other obvious shape, and
  the one `EventForm`'s zone `override` uses, and the one the previous session's note pointed
  at. Rejected here because these fields are **rendered**: a picker shows a glyph, a toggle
  shows a side. With a nullable slot every read site becomes `value ?? derive()`, so the
  derivation must be reachable and cheap everywhere the value is merely _displayed_ — more
  call-site churn than it removes. A concrete value with the flag kept private reads exactly
  like a plain `useState` at every site that only shows it.
- **`initiallyTouched` is an input, not a reason not to generalise.** An existing value can
  already count as chosen: an event's glyph, and an existing event's `kind`. That second one is
  ADR-0136 §4 — re-deriving it would silently harden a soft event on a toggle — so a hook that
  tracked only "did the user click in this session" would have broken the exact rule the
  previous session spent a trap-check proving.
- **`redrive` returns the value now in force.** The hand-rolled version needed a local variable
  for this: `pickCategory` re-derives the booked row _and then_ derives the kind from it, and
  reading `booked` back would read state React has not flushed. Returning the answer removes the
  workaround instead of reproducing it.

**Dirtiness deliberately stayed at the call sites.** The two forms disagree on purpose —
`BookingSheet` excludes its two ("not state the user typed"), `EventForm` counts
`bookedTouched` — so the hook exposes `touched` and takes no view.

Seven value-plus-flag pairs became seven hook calls — **13 fewer `useState` calls** across three
files — **and no test changed.** That
is the claim worth checking rather than asserting, so it was checked: removing the guard from
`redrive` fails five tests including ADR-0136's "a soft event must not harden"; ignoring
`initiallyTouched` fails that one specifically.

### The one real hazard of this migration, and where tsc could not help

Turning `icon` from a `string` into an object makes every stale read a type error — **except a
truthiness test**. `EventForm` had `if (booked && showBooked)`, and an object is always truthy,
so tsc was perfectly happy with a branch that had silently become unconditional. Caught by
grepping for bare identifiers afterwards, not by the compiler and not by a test (the tests all
still passed, because the booked path is what they exercise).

Worth remembering as the general shape: **a value→object migration is compiler-checked at every
site that compares or assigns, and unchecked at every site that only asks "is it set".**

## Not done here

- **`MaybeItemsService.update`'s non-partial `apply`** (above) — latent, left, and flagged.
- **The device pass** both ADRs still describe. Unchanged from session 185: nothing here has
  been seen on a phone.
