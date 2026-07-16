# 0046 — Retire the task board; ADRs + session notes are the record

**Status:** Accepted
**Date:** 2026-07-16

## Context

Work was tracked on a task board kept in the local, gitignored private area (ADR-0010): one brief per task with a `Status` field, a generated board file, an epics list, a critical-path diagram, and a generator script.

Most work now happens in remote cloud sessions, which only ever see the committed tree. The board is gitignored, so those sessions cannot read it, cannot update a `Status`, and cannot regenerate it. Every task the board describes gets built somewhere the board is invisible.

The result, measured on 2026-07-16: the board was last generated 2026-07-14. Since then roughly thirty PRs (#85–#115) and ten ADRs (0036–0045) landed. Nine of sixteen open tasks were wrong — six shipped without ever being marked (trip settings → ADR-0039; past days → ADR-0043/0044; Home quick-access → ADR-0045; trip-ended state → ADR-0040; Plan-mode Home + day builder → `PlanHome.tsx`/`PlanDay.tsx`), one was decided against (live weather/FX glance data, deleted by ADR-0045), and two sat in the open folder marked Done. A register of explicitly _deferred_ items listed drag-reorder and gap-fill, both already shipped.

Nothing was lost by this: the ADRs and the dated planning notes recorded every one of those changes correctly, on time, because they live in the repo next to the code that changed. The board was a second, worse copy of a record that already existed — and the only copy that could rot, because it was the only one not written as a by-product of the work.

The briefs themselves also stopped paying rent. Their value was the "required reading" list and the scope fence, which mattered when the ADR set was small and a task had to point at the docs. With forty-five ADRs and a domain router in `INDEX.md`, an agent finds its required reading from the router faster than from a brief written weeks earlier against a stale doc set.

## Decision

**Retire the task board.** Delete it — briefs, the generated board, the epics list, the generator script, the template, and the status protocol — along with the local skill that authored briefs. It leaves no trace in the committed tree, because per ADR-0010 it never had one.

The record of work is, and already was:

- **ADRs** (`docs/decisions/`) — the _why_, for anything consequential. Unchanged by this ADR.
- **Dated session notes** (`docs/planning/`) — the _what happened_, per working session. Unchanged.
- **PRs + commit history** — the _what shipped_.

The one thing the board provided that none of those do is a list of work **decided on but not yet started**. That becomes a single committed file, [`docs/backlog.md`](../backlog.md): a flat list, one line per item, no status field, no epics, no priorities, no generator, no per-item brief. It is readable and editable from a remote cloud session because it is in the repo. It has no protocol to fall out of sync with — an item is either on the list or it isn't.

This **partially revises ADR-0010**, which sorted the task board into the private area. Both of 0010's rules still stand — no committed file references the private area, and agent guidance about it stays in gitignored local config — and everything else that lives there (scratch notes, PM notes, raw handoffs) stays there. What changes is one classification: a list of features to build, in a repo that already describes every one of them in an ADR, was never private material. Nothing about "build the bookings index UI" needs hiding. Per 0010's own promotion rule, it moves into `docs/`.

## Consequences

- Remote cloud sessions can read and change the backlog, which is where the work happens. That alone fixes the failure mode this ADR is written about.
- No status protocol, no board regeneration, no `Status` field to forget. The maintenance cost of tracking drops to editing one line.
- The backlog is allowed to be wrong in the cheap direction only: a shipped item lingers until someone deletes the line. It cannot mislead about _why_ anything is the way it is, because it makes no such claims — that is the ADRs' job.
- Losing per-task briefs loses the pre-written scope fence and reading list. The router in `INDEX.md` plus the ADR for the domain replaces it. If a specific piece of work genuinely needs a written scope before it starts, that is a design discussion — which is a planning note and an ADR, not a brief.
- Losing the archive loses a record of _when_ each task was worked. Git history and the session notes carry that, keyed to the change rather than to a ticket.
- No ID scheme: nothing to reference `T-NNN` by. In-flight references in existing docs and code comments become dangling. They are historical either way and are left alone rather than rewritten.

## Alternatives considered

**Move the board into the repo as-is.** Makes it reachable from remote cloud, which is the actual defect. Rejected: it also commits the parts that caused the rot — a hand-maintained `Status` on every file, a generated board, a critical-path diagram wrong since Phase 2. Reachable and stale beats unreachable and stale, but only barely, and it keeps the duplicate record whose existence is the problem.

**GitHub issues.** The strongest alternative: remote cloud reads them via `gh`, PRs close them automatically, so staleness largely self-corrects — the exact property the board lacked. Rejected for now on cost, not merit: it is a second surface to check, and the point of this change is to stop maintaining a tracking surface. Reconsider if the flat list starts being ignored rather than edited.

**Keep nothing at all.** Rejected narrowly: a handful of items really are decided-but-unbuilt (the Index/Map tabs, e2e smoke, invite tokens, calendar consent) and are recoverable from nothing but memory. One flat file is a small price to not lose them.
