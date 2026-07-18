# Session 34 — App-scope reframe: many trips, small groups per trip (2026-07-18)

**Outcome:** Corrected a framing defect Assaf flagged: the docs described Waypoint as "a private tool for ~5 friends" / "not built for scale," which reads as a permanent cap on the whole app's user count. The intent was always different — **"~5" is the size of one trip's group**, while the **app** is meant to serve many trips and many users. Recorded the correction in a new ADR (0065) and swept the living docs so future agents inherit a **grow-later** mindset, not a small-by-design one. No product code changed (one code-comment framing fix in `packages/shared/src/destinations.ts`).

## What Assaf said

> The app is said in multiple places to be a private app for 5 friends only. That's not what I meant. Each **trip** is planned to have ~5 members, but the whole **app** is intended for much more. It isn't production-ready or scaled for that yet, but I want the mindset set for future scale — not for it to stay limited to a very low user count. Fix all references so future agents don't get the wrong idea.

## The distinction the fix rests on

- **Keep — per-trip sizing.** "~5 members per trip" is a legitimate, load-bearing design assumption behind LWW-without-CRDTs (ADR-0012), the monotonic change log (ADR-0019), in-process per-trip fan-out (tech-stack / collaboration-model), and last-writer-wins-on-refresh (ADR-0022). Those ADRs and their "~5 users" phrasing stand — the number is correct there because it sizes a single trip.
- **Reform — app-level framing.** "a private tool for ~5 friends," "not built for scale," "we optimize for a handful of trips and ~5 users each" all conflate the per-trip number with an app-wide ceiling. Reframed to: multi-trip, multi-user app; per-trip group is small; **not yet scaled** held with a **grow-later** posture; invite-only is a privacy choice, not a user cap.

## Changes

**New:** [ADR-0065](../decisions/0065-app-scope-many-trips-small-groups.md) (Accepted) — the durable "why."

**Living docs swept (framing only):**

| File                                  | What changed                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                           | "What this is" — per-trip ~5 vs. many-trip app; invite-only ≠ capped; grow-later mindset            |
| `README.md`                           | Tagline — each trip a small group, app serves many                                                  |
| `docs/product/vision.md`              | "What we're building" — many trips/users; started private but not capped                            |
| `docs/product/prd-v1.md`              | v1 goal is one-trip _proof_ not a ceiling; "5-person tool" → "invite-only tool"; scale-out reframed |
| `docs/product/personas.md`            | "The group" clarified as one trip's group of many                                                   |
| `docs/architecture/overview.md`       | Guiding constraint + "what 'not yet scaled' means" (was "not for scale"), bright line restated      |
| `docs/architecture/tech-stack.md`     | Status line + Realtime rationale ("per trip (~5)", "when we scale out")                             |
| `packages/shared/src/destinations.ts` | Curated-list comment no longer justified by "small-group app"                                       |

**Registries:** added ADR-0065 to `docs/decisions/README.md` (index) and the **Product scope & modes** row of the `docs/INDEX.md` router.

## Deliberately left alone

- **Historical ADRs' "~5 users" phrasing** (0005/0012/0022/0041/etc.) — per-trip and correct; the repo's discipline is supersede-don't-edit (decisions/README.md §Process).
- **collaboration-model.md / sync-and-offline.md** — already say "~5 members **per trip**," which is exactly right.
- **ADR-0034 (document trust model)** — its "private tool run by one of the ~5" reasoning is genuinely trip-scoped and still valid for a single self-hosted group; ADR-0065's Consequences flags that it must be revisited if Waypoint ever hosts trips for people who don't trust the operator, rather than editing the historical record.

## Verification

Prettier (pinned 3.3.3, run via `pnpm dlx` — workspace `node_modules` isn't installed in this session) reports all changed files clean. No `pnpm typecheck` run this session, but the only non-Markdown touch is a **comment-only** change in `destinations.ts` (no code semantics), so there's nothing for the type-checker to catch — CI will confirm.
