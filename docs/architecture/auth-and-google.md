# Auth & Google Integration

**Status:** PROPOSED (for review). Google-only sign-in (ADR-0013); each member connects their own Google account (ADR-0002).

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

- **Session:** a short-lived **access JWT** (e.g. 15 min) + a longer refresh token. `POST /auth/refresh` rotates it. `Authorization: Bearer <JWT>` on all protected routes.
- **JWT claims:** `sub` (userId), `email`, `iat`, `exp`. Trip authorization is **not** in the token — it's checked per request against `Membership` (so revoking membership takes effect immediately).

## Scopes

| Scope | When requested | Why |
|---|---|---|
| `openid email profile` | sign-in (v1) | identity |
| `.../auth/calendar.events` | when a member enables calendar sync (v1) | one-way push of trip events (ADR-0003) |
| `.../auth/gmail.readonly` | v1.1, on demand | booking import |

Request the minimum at sign-in; **incrementally** request Calendar/Gmail scopes only when the member turns those features on. Don't front-load consent.

## Token storage

- Google **refresh tokens** are sensitive → stored **encrypted at rest** (same posture as documents, ADR-0015), keyed to the `Membership`/`User`.
- Access tokens are short-lived and kept in memory / refreshed as needed.
- Never sent to the client. All Google API calls happen server-side.

## Calendar sync (one-way, v1)

- Trigger: event create/update/delete for a member with `calendarSyncEnabled`.
- Action: upsert a corresponding event in that member's Google Calendar via their token. One-way only — we never read the calendar back (ADR-0003).
- Idempotency: store the Google `eventId` mapping so updates/deletes target the right calendar event.

## Invite / join

- `POST /trips/:tripId/invite` → a **signed, expiring token** encoding `tripId`.
- `POST /trips/join/:token` → verifies the token, adds the caller as a `peer` `Membership`. The joiner must be signed in (Google) first.

## Security notes

- CSRF/state param on the OAuth flow.
- Rotate refresh tokens; handle Google token revocation gracefully (mark `googleConnected = false`, prompt re-connect).
- `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, and the encryption key come from env (see `.env.example`), never the repo.
- Setup steps for the Google Cloud project are in [../engineering/prerequisites-checklist.md](../engineering/prerequisites-checklist.md).
