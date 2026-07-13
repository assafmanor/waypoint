// Zero-state home — authenticated, no trips (ADR-0024). Real content (Create
// / Join, given equal weight) is T-040; this is the placeholder the gate
// renders in the meantime.
import { t } from '../i18n/he';

export function ZeroState() {
  return (
    <div className="boot-screen">
      <h1>{t.shell.zeroState.title}</h1>
      <p>{t.shell.zeroState.comingSoon}</p>
    </div>
  );
}
