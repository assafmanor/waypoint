import { describe, expect, it } from 'vitest';
import { meSchema } from './entities';

/* ── A CAPABILITY OBJECT MUST STILL PARSE IN ITS OLDER SHAPE ──────────────────────────────────
   `GET /me` is not only fetched: it is CACHED in `localStorage` and re-parsed on a cold load
   (`readCachedMe`), and it is stubbed by every e2e fixture. So the payload a *previous* build
   wrote is a live input, and a field added inside `push`/`notify`/`map` has to tolerate its
   absence — otherwise `meSchema.parse` throws on the cached copy and the app drops to /login
   while offline.

   This is not hypothetical. `map.archiveVintage` shipped required, and the whole app stopped
   booting against a `/me` holding only `map.liveBuild`: 231 e2e tests timed out waiting for a
   screen that was never going to render. Nothing else in the suite could see it, because every
   other fixture in the repo was written against the NEW shape. */
const USER = {
  id: 'u1',
  email: 'a@example.com',
  displayName: 'A',
  avatarHue: 'moss',
  avatarChoice: 'initials',
  googleAvatarUrl: null,
  uploadedAvatarUrl: null,
  preferredCurrency: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('meSchema — payloads written by earlier builds', () => {
  it('parses a `/me` with no capability objects at all', () => {
    const me = meSchema.parse({ user: USER, memberships: [] });
    expect(me.map).toBeUndefined();
    expect(me.push).toBeUndefined();
  });

  it('parses a `map` that predates `archiveVintage`, which is the cached copy on every device', () => {
    const me = meSchema.parse({
      user: USER,
      memberships: [],
      map: { liveBuild: '20260821' },
    });
    expect(me.map).toEqual({ liveBuild: '20260821' });
    // The reader's own fallback: absent reads as "no vintage stated", never as a parse failure.
    expect(me.map?.archiveVintage ?? null).toBeNull();
  });

  it('parses the current shape, both fields present and nullable', () => {
    expect(
      meSchema.parse({
        user: USER,
        memberships: [],
        map: { liveBuild: null, archiveVintage: null },
      }).map,
    ).toEqual({ liveBuild: null, archiveVintage: null });
  });
});
