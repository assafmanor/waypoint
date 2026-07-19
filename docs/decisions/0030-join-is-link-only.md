# 0030 — Joining a trip is link-only (no short invite codes)

**Status:** Superseded by [0067](0067-revocable-code-invites-and-removal-blocks.md)
**Date:** 2026-07-14
**Builds on:** [0024](0024-app-shell-and-trip-lifecycle.md) (app shell, invite/join flow), [0020](0020-auth-session-architecture.md) (HMAC-signed tokens)

## Context

ADR-0024 and the API contract define one join mechanism: the invite is a **link** (`/join/:token`, stateless HMAC token; `GET /invites/:token` preview + `POST /trips/join/:token`). The `screens-v1.html` mockup, however, drifted ahead of any decision and drew a second mechanism — a 6-character short code with a code-entry screen and a "join with code" lobby button. The zero-state work (PR #49) surfaced the contradiction: is joining link-only, or link + code?

## Decision

**Link-only.** No short invite codes, in v1 or as a target.

- **The distribution channel is the group chat.** In the ~5-friend model the invite travels through WhatsApp, where a link is one tap. A code is strictly worse in that channel: open app → find join screen → type.
- **The "same room" case doesn't need a code.** Sharing verbally is rarer than sharing in the chat that already exists; if it ever matters, a QR render of the same link serves it without new backend surface.
- **A code is real new surface, not a UI variant:** short-code issuance and storage, expiry, and brute-force protection over a tiny keyspace (6 chars), plus a second join path to test — for no journey the link doesn't already cover. The HMAC link token has none of these problems (long, stateless, already built).
- **One join path keeps the shell honest** to its own principle (ADR-0024): minimize screens and taps from "app open" to "inside a trip".

The "I opened the app first" journey (the reason a code feels tempting) is served by **paste-a-link**: the zero-state/lobby "join" action opens a small paste field for the same invite URL — no new backend, same `/join/:token` flow.

## Consequences

- `mockups/screens-v1.html` reworked: the join-by-code screen became a paste-a-link screen (mono URL field, same trip-preview + permissions flow); the lobby button reads "הצטרף עם לינק"; trip-settings' invite box shares the **link**, not a code.
- Confirmation codes on bookings (`#4471`, flight PNRs) are unrelated and unaffected — those are commitment artifacts (amber family), not invites.
- If a future need for verbal sharing appears, the answer is a QR code of the invite link — not a typed short code.
