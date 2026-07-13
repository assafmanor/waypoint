// Zero-state home (ADR-0024) — real content is T-040.
import { t } from '../i18n/he';

export function ZeroState() {
  return (
    <div className="boot-screen">
      <h1>{t.shell.zeroState.title}</h1>
      <p>{t.shell.zeroState.comingSoon}</p>
    </div>
  );
}
