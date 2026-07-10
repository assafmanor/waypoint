# Auth & Google Integration

**Status:** ACCEPTED (T-025; architecture in ADR-0020). Google-only sign-in for v1 (ADR-0013); each member connects their own Google account (ADR-0002). Built on a **generalized identity seam** so non-Google login can be added later without migration.

## Two distinct uses of Google

1. **Sign-in (identity):** Google OAuth to authenticate the user and create/lookup their `User`.
2. **API access (data):** additional Google scopes to act on the user's behalf — Calendar push (v1), Gmail read (v1.1). These need **refresh tokens** stored per user.

Keep them mentally separate even though they ride the same OAuth flow.

## Sign-in flow

```
Client → GET /auth/google
  → 302 to Google consent (scopes below)
Google → GET /auth/google/callback?code=...
  Backend: exchange code → Google tokens
           upsert User (by googleSub)
           store/refresh the user's Google refresh token (encrypted)
           issue Waypoint session JWT (+ refresh)
  → redirect back to the app with the session
```

- **Session model (ADR-0020):**
  - **Access token** — 15-min stateless JWT (`sub`, `email`, `iat`, `exp`; **no authz claims**), held **in memory** on the client (never localStorage), sent as `Authorization: Bearer` on API routes.
  - **Refresh token** — opaque random string stored **hashed** in the `Session` table, rotated on every use, revocable. Lives in an **httpOnly, Secure, SameSite=Lax cookie**; `POST /auth/refresh` and `/auth/logout` use it (logout deletes the row). A stateless JWT alone can't be revoked — hence the server-side `Session`.
- **Single-origin (ADR-0020):** in production the backend host serves the static PWA on the same origin as the API, so the refresh cookie is same-origin (no cross-origin/CSRF gymnastics) and the WS upgrade carries it automatically. **Not Vercel for the frontend** — its serverless layer can't proxy long-lived WebSockets. Ratified in T-021.
- **Trip authorization is not in the token** — checked per request against `Membership` (revoking membership takes effect immediately).

## Scopes

| Scope                      | When requested                           | Why                                    |
| -------------------------- | ---------------------------------------- | -------------------------------------- |
| `openid email profile`     | sign-in (v1)                             | identity                               |
| `.../auth/calendar.events` | when a member enables calendar sync (v1) | one-way push of trip events (ADR-0003) |
| `.../auth/gmail.readonly`  | v1.1, on demand                          | booking import                         |

Request the minimum at sign-in; **incrementally** request Calendar/Gmail scopes only when the member turns those features on. Don't front-load consent.

## Identity & token storage (ADR-0020)

- **`User`** holds only the person (`id`, `email @unique`, `displayName`, `avatarColor`). No provider fields.
- **`AuthIdentity`** (one per user×provider: `provider`, `providerAccountId`, `refreshTokenEnc?`, `scopes[]`, `@@unique([provider, providerAccountId])`) holds each provider identity **and that provider's OAuth token/scopes**. `enum AuthProvider { google }` — adding email/password (`+ passwordHash`) or another OAuth later is non-breaking, no user migration; `User.email @unique` is the account-linking key.
- Google **refresh tokens** are stored **encrypted at rest** on the `AuthIdentity` (AES-256-GCM; a **separate `TOKEN_ENCRYPTION_KEY`** from documents' `DOC_ENCRYPTION_KEY`).
- Google **access tokens** are short-lived, kept server-side in memory / refreshed as needed. Never sent to the client; all Google API calls happen server-side.
- **`Membership.googleConnected` is dropped** (always true once authenticated). "Can this member sync calendar" derives from their Google `AuthIdentity.scopes`; `Membership.calendarSyncEnabled` remains the per-trip intent toggle.

## Calendar sync (one-way, v1)

- Trigger: event create/update/delete for a member with `calendarSyncEnabled`.
- Action: upsert a corresponding event in that member's Google Calendar via their token. One-way only — we never read the calendar back (ADR-0003).
- Idempotency: the **`CalendarEventLink`** table (`eventId × userId → googleCalendarEventId`, `@@unique([eventId, userId])`) maps trip events to each member's Google calendar event so updates/deletes target the right one.

## Invite / join

- `POST /trips/:tripId/invite` → a **signed, expiring token** encoding `tripId`.
- `POST /trips/join/:token` → verifies the token, adds the caller as a `peer` `Membership`. The joiner must be signed in (Google) first.

## Security notes

- OAuth flow: **`state` param + PKCE**; request **`access_type=offline`** (and `prompt=consent` when a refresh token is missing — Google only returns it on first consent), and store the refresh token on first grant.
- Rotate our refresh tokens on use; handle Google token revocation gracefully (clear the `AuthIdentity` token, prompt re-connect).
- **Refresh-token reuse-detection** (a revoked token re-presented → revoke the chain) is a known hardening, **deferred** for v1 (rotate + logout-deletes only).
- `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `DOC_ENCRYPTION_KEY`, and `TOKEN_ENCRYPTION_KEY` come from env (see `.env.example`), never the repo.
- Setup steps for the Google Cloud project are in [../engineering/prerequisites-checklist.md](../engineering/prerequisites-checklist.md).
