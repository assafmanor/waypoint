// /login — the auth gate (ADR-0024). Google-only (ADR-0013): product mark,
// one "Continue with Google" button, nothing else.
import { useAuth } from '../state/auth-state';
import { useIsOffline } from '../lib/outbox';
import { t } from '../i18n/he';

export function Login() {
  const { login } = useAuth();
  const offline = useIsOffline();
  return (
    <div className="boot-screen">
      <h1>Waypoint</h1>
      <p>{t.shell.login.tagline}</p>
      {offline ? (
        <p>{t.shell.login.offline}</p>
      ) : (
        <button className="form-save" onClick={login}>
          {t.shell.login.continueWithGoogle}
        </button>
      )}
      <p>{t.shell.login.note}</p>
    </div>
  );
}
