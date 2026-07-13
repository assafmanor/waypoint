// ADR-0020/0024. The access JWT itself lives in lib/api.ts, not here.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@waypoint/shared';
import {
  API_BASE_URL,
  fetchMe,
  refreshAccessToken,
  requestLogout,
  setAccessToken,
  setOnSessionExpired,
} from '../lib/api';

export type AuthStatus = 'loading' | 'anon' | 'authed';

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
    });
    return () => setOnSessionExpired(null);
  }, []);

  // Must refresh *before* GET /me, not rely on apiFetch's reactive 401 retry:
  // with DEV_AUTH=1 an unauthenticated /me answers 200 via the dev stub, so a
  // real session would never get the 401 that triggers a refresh — and lose
  // the race to the stub every time.
  useEffect(() => {
    let cancelled = false;
    refreshAccessToken()
      .catch(() => false)
      .then(() => fetchMe())
      .then(
        (who) => {
          if (!cancelled) {
            setMe(who);
            setStatus('authed');
          }
        },
        () => {
          if (!cancelled) setStatus('anon');
        },
      );
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
    setMe(null);
    setStatus('anon');
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
