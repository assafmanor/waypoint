// Create/join action row (ADR-0024 §3: equal weight, no primary/secondary
// hierarchy). Shared between the zero-state home (T-040) and the switcher
// overlay's populated form (T-027) — implemented once here.
import { useNavigate } from 'react-router-dom';
import { useToast } from './Toast';
import { t } from '../i18n/he';

export function CreateJoinActions({ offline }: { offline: boolean }) {
  const navigate = useNavigate();
  const showToast = useToast();

  return (
    <>
      <div className="zero-actions">
        <button className="zero-act" onClick={() => showToast('🔗', t.shell.zeroState.joinToast)}>
          <span className="ic">🔗</span>
          {t.shell.zeroState.join}
          <span className="sub">{t.shell.zeroState.joinSub}</span>
        </button>
        <button className="zero-act" disabled={offline} onClick={() => navigate('/new')}>
          <span className="ic">＋</span>
          {t.shell.zeroState.create}
          <span className="sub">{t.shell.zeroState.createSub}</span>
        </button>
      </div>
      {offline && <p className="zero-offline-note">{t.shell.zeroState.offline}</p>}
    </>
  );
}
