// The dead-letter surface (U-04, ADR-0080). Replaces the old timed/dismissable
// "N שינויים לא נשמרו" header badge: a persistent summary in the header opens
// THIS review sheet, which lists every rejected write with its reason and a
// per-item RETRY (re-enqueue via the outbox) or DISCARD. It never clears on a
// timer — a rejected write stays here until the user acts, so it can't silently
// vanish at the next resync. Built on the Sheet/Modal primitive (ADR-0079).
import {
  clearSyncFailures,
  dismissSyncFailure,
  retrySyncFailure,
  useSyncFailures,
} from '../lib/outbox';
import { Sheet } from './Sheet';
import { t } from '../i18n/he';
import './SyncReviewSheet.css';

export function SyncReviewSheet({ onClose }: { onClose: () => void }) {
  const failures = useSyncFailures();

  return (
    <Sheet title={t.sync.review.title} onClose={onClose}>
      <div className="sync-review">
        {failures.length === 0 ? (
          <p className="sync-review-empty">{t.sync.review.empty}</p>
        ) : (
          <>
            <p className="sync-review-intro">{t.sync.review.intro}</p>
            <ul className="sync-review-list">
              {failures.map((f) => (
                <li className="sync-review-item" key={f.id}>
                  <div className="sync-review-main">
                    <span className="sync-review-what">{t.sync.verb[f.verb]}</span>
                    <span className="sync-review-reason">
                      {t.sync.review.reason}
                      {f.code && (
                        <code className="sync-review-code" dir="ltr">
                          {f.code}
                        </code>
                      )}
                    </span>
                  </div>
                  <div className="sync-review-actions">
                    <button
                      type="button"
                      className="sync-review-retry"
                      onClick={() => void retrySyncFailure(f.id)}
                    >
                      {t.sync.review.retry}
                    </button>
                    <button
                      type="button"
                      className="sync-review-discard"
                      onClick={() => dismissSyncFailure(f.id)}
                    >
                      {t.sync.review.discard}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {failures.length > 1 && (
              <button
                type="button"
                className="sync-review-discard-all"
                onClick={() => clearSyncFailures()}
              >
                {t.sync.review.discardAll}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
