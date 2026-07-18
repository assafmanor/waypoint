// ADR-0020/0024. The access JWT itself lives in lib/api.ts, not here.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { meSchema, type Me } from '@waypoint/shared';
import {
  API_BASE_URL,
  fetchMe,
  refreshAccessToken,
  requestLogout,
  setAccessToken,
  setOnSessionExpired,
} from '../lib/api';
import { isNetworkError, isOffline } from '../lib/outbox';
import { wipeLocalData } from '../lib/cache';
import { ME_STORAGE_KEY } from '../constants';

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
      await refreshAccessToken().catch(() => false);
      try {
        const who = await fetchMe();
        if (cancelled) return;
        setMe(who);
        setStatus('authed');
        cacheMe(who);
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
    await requestLogout();
    await wipeLocalData();
    setMe(null);
    setStatus('anon');
    clearCachedMe();
  };

  return (
    <AuthContext.Provider value={{ status, me, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
