# 0020 — Auth & session architecture

**Status:** Accepted
**Date:** 2026-07-10
**Builds on:** ADR-0013 (Google-only v1), ADR-0002 (own Google account), ADR-0015 (encryption at rest).

## Context

`auth-and-google.md` (from planning) wanted a short-lived access JWT **and** working logout + Google-revocation handling — but a pure stateless JWT can't be revoked, and the schema had nowhere to store our sessions, the encrypted Google refresh tokens, or the calendar-event id mapping ADR-0003 needs. Reviewed in T-025 CP3. Assaf also asked to keep **future non-Google login methods** cheap to add.

## Decision

1. **Two-token session.**
   - **Access token** — 15-min stateless JWT (`sub`, `email`, `exp`; **no authz claims**), held **in memory** on the client (never localStorage).
   - **Refresh token** — opaque random string, stored **hashed** server-side in a `Session` table, **rotated on every use**, revocable. Logout = delete the row. This is what makes revocation and "sign out everywhere" real.

2. **Single-origin in production.** The backend host serves the static PWA on the **same origin** as the API. The refresh token lives in an **httpOnly, Secure, SameSite=Lax cookie** (XSS can't read it; SameSite kills most CSRF; only `/auth/refresh` + `/auth/logout` use it). The access token is minted from that cookie and sent as `Authorization: Bearer` on API routes (Bearer isn't ambient → no CSRF on the API). The WS upgrade authenticates via the same cookie (browsers can't set headers on `WebSocket`; cookies avoid tokens-in-URLs). **Not Vercel for the frontend** — its serverless layer can't proxy long-lived WebSockets. (Hosting ratified in T-021.)

3. **Generalized identity seam (`AuthIdentity`).** `User` holds only the person (`id`, `email @unique`, `displayName`, `avatarColor`). A separate `AuthIdentity { id, userId, provider AuthProvider, providerAccountId, refreshTokenEnc?, scopes String[], @@unique([provider, providerAccountId]) }` holds each provider identity **plus that provider's OAuth token/scopes**. `enum AuthProvider { google }` — adding email/password (a `passwordHash` + new provider value) or another OAuth later is non-breaking, no user migration; `User.email @unique` is the account-linking key. This **replaces** a Google-specific token table (same table count, more flexible).

4. **`CalendarEventLink { id, eventId, userId, googleCalendarEventId, @@unique([eventId, userId]) }`** — per-user (each member mirrors to their own calendar, ADR-0002/0003); gives one-way sync its idempotent upsert/delete target.

5. **`Membership.googleConnected` dropped** (always true once a user has authenticated at all). "Can this member sync calendar" derives from their Google `AuthIdentity.scopes`. `Membership.calendarSyncEnabled` stays — the per-trip _intent_ toggle.

6. **OAuth hardening:** `state` param + PKCE + `access_type=offline` (and `prompt=consent` when a refresh token is missing — Google only returns it on first consent). Store the refresh token on first grant. Scopes stay incremental (identity at sign-in; calendar on enable; Gmail v1.1).

7. **Encryption:** one shared AES-256-GCM util for documents (ADR-0015) and Google tokens, with a **separate `TOKEN_ENCRYPTION_KEY`** from `DOC_ENCRYPTION_KEY` (separate blast radius).

## Consequences

- New tables: `Session`, `AuthIdentity`, `CalendarEventLink` (applied in T-026). `User` loses `googleSub`; `Membership` loses `googleConnected`.
- Authz stays per-request against `Membership` (no trip claims in the JWT → instant revocation).
- Single-origin steers T-021 hosting and the `api-contract.md` auth section (refresh/logout use the cookie, not Bearer).
- Deferred (noted): refresh-token **reuse-detection** chain (rotate + logout-deletes only for v1).

## Alternatives considered

- **Pure stateless JWT:** rejected — can't revoke; logout/Google-revocation impossible.
- **`googleSub` on `User` + a Google-only token table:** rejected — same cost as `AuthIdentity` but closes the multi-provider door.
- **Split hosting (PWA on Vercel, API elsewhere):** rejected for v1 — cross-origin cookies (`SameSite=None` + CSRF) and no clean WS proxy; single-origin is simpler and cheaper.
