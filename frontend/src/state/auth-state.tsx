// ADR-0020/0024. The access JWT itself lives in lib/api.ts, not here.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { meSchema, type Me, type UpdateMeInput } from '@waypoint/shared';
import {
  API_BASE_URL,
  deleteAvatar,
  fetchMe,
  refreshAccessToken,
  requestLogout,
  setAccessToken,
  setOnSessionExpired,
  updateMe,
  uploadAvatar,
} from '../lib/api';
import { isNetworkError, isOffline } from '../lib/outbox';
import { wipeLocalData } from '../lib/cache';
import { reconcileThisDevice, unsubscribeThisDevice } from '../lib/push';
import { withDeadline } from '../lib/deadline';
import { API_PHASE, API_TIMEOUT_MS, ME_STORAGE_KEY } from '../constants';

export type AuthStatus = 'loading' | 'anon' | 'authed';

// Identity is cached so a cold reload offline renders signed-in from the last
// known `me` rather than bouncing to /login (the boot refresh + GET /me both
// fail with no network). It is *not* a credential — the access token stays
// in-memory only (ADR-0020) — so caching it doesn't weaken the auth model.
function cacheMe(me: Me): void {
  try {
    localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(me));
  } catch {
    // ignore quota/serialisation failures — the cache is best-effort.
  }
}
function readCachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(ME_STORAGE_KEY);
    return raw ? meSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function clearCachedMe(): void {
  try {
    localStorage.removeItem(ME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  login: () => void;
  logout: () => void;
  /** Edit your own identity. Throws on failure so the caller can surface it. */
  patchMe: (input: UpdateMeInput) => Promise<void>;
  /** Upload an already-normalized avatar (see `lib/avatar-image.ts`). Throws. */
  setAvatar: (blob: Blob) => Promise<void>;
  /** Delete the uploaded avatar; the server picks the fallback source. Throws. */
  removeAvatar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);

  // A bearer token that expires mid-session (a 401 lib/api.ts's apiFetch
  // couldn't fix with a silent refresh) drops the app back to signed-out.
  useEffect(() => {
    setOnSessionExpired(() => {
      setAccessToken(null);
      setMe(null);
      setStatus('anon');
      clearCachedMe();
      void wipeLocalData();
      // The same revoke as `logout`, and here the SERVER half will fail — the session is
      // already gone, which is why we are in this callback at all. The local
      // `unsubscribe()` is the part that matters: this device stops receiving immediately,
      // and the server prunes its now-unreachable row when a push service reports it gone
      // (ADR-0197 §10). Deliberately not skipped just because half of it cannot succeed.
      void unsubscribeThisDevice().catch(() => {});
    });
    return () => setOnSessionExpired(null);
  }, []);

  // Must refresh *before* GET /me, not rely on apiFetch's reactive 401 retry:
  // with DEV_AUTH=1 an unauthenticated /me answers 200 via the dev stub, so a
  // real session would never get the 401 that triggers a refresh — and lose
  // the race to the stub every time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // **The boot waits for the refresh, but not forever** (field-report #22). This is the
      // FIRST await of the whole app, and with the radios on but no upstream it never
      // settled — so the boot screen stayed up before the trip snapshot was even asked for.
      //
      // What is bounded here is only this WAIT. `refreshAccessToken` itself, its in-flight
      // coalescing and its cross-tab lock are untouched, deliberately: bounding the refresh
      // would turn a slow-but-alive one into a forced sign-out, which is a product call and
      // not this fix's to make. Giving up on the wait costs nothing — it is what a *failed*
      // refresh already does here, and a late one still installs its token for the next call.
      await withDeadline(API_PHASE.BOOT_REFRESH, API_TIMEOUT_MS.FETCH, () =>
        refreshAccessToken(),
      ).catch(() => false);
      try {
        const who = await fetchMe();
        if (cancelled) return;
        setMe(who);
        setStatus('authed');
        cacheMe(who);
        // **The mirror of the sign-out above** (ADR-0197 §2.3 leaves; this arrives). A live
        // session is the moment the server can be told this device is still reachable — and
        // it has to be told, because the row it holds dies without the phone hearing about
        // it: pruned when a push service reports the endpoint gone (§10), revoked from
        // another device's list, rotated. The switch keeps reading on either way, so nothing
        // else would ever notice. Fire-and-forget: it never throws and never prompts, and a
        // boot must not wait on it (see `reconcileThisDevice`).
        void reconcileThisDevice(who.push?.vapidPublicKey);
      } catch (err) {
        if (cancelled) return;
        // Offline cold-load (sync-and-offline.md "Read"): the refresh + /me both
        // fail with no network, but that's not a real sign-out — fall back to the
        // last-known identity so the app renders from cache instead of bouncing
        // to /login. A genuine auth rejection (a 401 while online) still drops to
        // anon and clears the stale identity.
        const cached = readCachedMe();
        if (cached && (isOffline() || isNetworkError(err))) {
          setMe(cached);
          setStatus('authed');
        } else {
          setStatus('anon');
          clearCachedMe();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Full navigation, not a client route — this is server-driven OAuth (ADR-0020).
  const login = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const logout = async () => {
    // **Before `requestLogout`, deliberately** (ADR-0197 §2.3). A push subscription is not
    // client-local data — it lives on the server and keeps working after the tab closes,
    // which is the whole point — so `wipeLocalData` cannot reach it, and a phone handed to
    // somebody else would keep waking with this person's deadlines on the lock screen.
    // The server half of the revoke needs a session, so it has to happen while there still
    // is one; the local `unsubscribe()` inside is what makes it true even if that call fails.
    await unsubscribeThisDevice().catch(() => {});
    await requestLogout();
    await wipeLocalData();
    setMe(null);
    setStatus('anon');
    clearCachedMe();
  };

  /** Apply an identity patch (ADR-0133). The response is authoritative — a `User`
   *  is not a syncable entity (§8), so there is nothing to reconcile — and it lands
   *  in the cached copy too, so the offline cold-load path renders the new name
   *  rather than the pre-edit one. */
  const patchMe = async (input: UpdateMeInput) => {
    const next = await updateMe(input);
    setMe(next);
    cacheMe(next);
  };

  /** Same contract as `patchMe`, for the two writes that carry bytes rather than
   *  fields (ADR-0133 §12) — the response is the new `Me`, so a removal that lands on
   *  the Google photo and one that lands on initials need no client-side guess. */
  const setAvatar = async (blob: Blob) => {
    const next = await uploadAvatar(blob);
    setMe(next);
    cacheMe(next);
  };
  const removeAvatar = async () => {
    const next = await deleteAvatar();
    setMe(next);
    cacheMe(next);
  };

  return (
    <AuthContext.Provider value={{ status, me, login, logout, patchMe, setAvatar, removeAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/**
 * The session if there is one, `null` if this subtree has no `AuthProvider` above it.
 *
 * **`useAuth` keeps throwing, and that is not softened here.** For nearly everything a missing
 * provider is a wiring bug and failing loudly is the right answer. This exists for the one
 * shape where absence is a real state to render for rather than a fault: a component that must
 * be **inert** outside a session — the push ask (ADR-0197 §7's second door) is one, because no
 * session means no device to subscribe and nothing to offer.
 */
export function useMaybeAuth() {
  return useContext(AuthContext) ?? null;
}
