// Zero-state home (ADR-0024 §2) — first landing for an authenticated user
// with zero trip memberships. Design: mockups/zero-state-v1.html — the
// departure board renders from the first moment but stays unpowered (no
// amber/teal/pulse, ADR-0028) until a trip exists to turn it on.
import { useAuth } from '../state/auth-state';
import { useIsOffline } from '../lib/outbox';
import { CreateJoinActions } from '../ui/CreateJoinActions';
import { AVATAR_INITIAL_LENGTH, ICONS } from '../constants';
import { t } from '../i18n/he';

const FLAP_ROWS = [
  ['w3', 'grow', 'w1'],
  ['w2', 'grow', 'w2'],
  ['grow', 'w3', 'w1'],
  ['w1', 'grow', 'w2'],
] as const;

export function ZeroState({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { me } = useAuth();
  const offline = useIsOffline();

  return (
    <div className="app">
      <header className="zero-head">
        <div className="zero-head-row">
          {me && (
            <div>
              <div className="zero-hello">{t.shell.zeroState.hello(me.user.displayName)}</div>
              <div className="zero-hello-sub">
                <span className="g-dot" />
                {t.shell.zeroState.connected(me.user.email)}
              </div>
            </div>
          )}
          {me && (
            <button
              className="av account-btn"
              style={{ background: me.user.avatarColor }}
              onClick={onOpenAccount}
              title={me.user.displayName}
            >
              {me.user.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
            </button>
          )}
        </div>
        {offline && (
          <div className="offline-badge">
            {ICONS.offline} {t.header.offlineNow}
          </div>
        )}
      </header>

      <main className="zero-body">
        <section className="board-off" aria-label={t.shell.zeroState.boardOffTitle}>
          <div className="board-off-top">
            <span className="off-label">
              <span className="off-dot" />
              {t.shell.zeroState.offSignal}
            </span>
            <span className="board-off-clock" dir="ltr">
              --:--
            </span>
          </div>
          <div className="flaps" aria-hidden="true">
            {FLAP_ROWS.map((row, i) => (
              <div className="flap-row" key={i}>
                <span className="flap-time" dir="ltr">
                  --:--
                </span>
                {row.map((w, j) => (
                  <span key={j} className={`cell ${w}${i === 0 && j === 0 ? ' flutter' : ''}`} />
                ))}
              </div>
            ))}
          </div>
        </section>

        <div className="zero-copy">
          <h1>{t.shell.zeroState.boardOffTitle}</h1>
          <p>{t.shell.zeroState.boardOffBody}</p>
        </div>

        <CreateJoinActions offline={offline} />

        <p className="zero-teach">{t.shell.zeroState.teach}</p>
      </main>
    </div>
  );
}
