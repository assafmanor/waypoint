// The install offer's permanent home (ADR-0204 §6).
//
// It never nags and it never disappears, and its existence is what lets everything else give
// up after two asks: an offer you can always come back to does not have to be pressed.
//
// **No new component family.** This is the settings screen's own grammar —
// `.set-sec-title` › `.set-card` › `.id-row` › `.set-hint-block` — exactly as the theme,
// currency and map-storage sections use it. The install surface it opens is the same
// `InstallSheet` all three doors open.
//
// **And it deletes a duplicate.** `NotificationSettings` used to teach the share-sheet
// gesture itself, in a full sentence, because it was the only place that could. With one
// install surface in the app that sentence points here instead of repeating it (ADR-0096).
import { useEffect, useState } from 'react';
import { InstallSheet } from './InstallSheet';
import {
  INSTALL_PATH,
  canOfferInstall,
  installPath,
  isInstalled,
  watchInstallPath,
} from '../lib/install';
import { t } from '../i18n/he';

export function InstallSettings() {
  // Re-read when the path changes under us: a `beforeinstallprompt` can arrive after this
  // screen is already open, and an install completed in another tab must retire the button.
  const [path, setPath] = useState(installPath);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => watchInstallPath(() => setPath(installPath())), []);

  const installed = path === INSTALL_PATH.INSTALLED || isInstalled();
  const offerable = canOfferInstall(path);

  return (
    <>
      <div className="set-sec-title">{t.install.settings.section}</div>
      <div className="set-card">
        <div className="id-row">
          <span className="lab">{t.install.settings.label}</span>
          <span className={installed ? 'val' : 'val dim'}>
            {installed ? t.install.settings.installed : t.install.settings.notInstalled}
          </span>
          {offerable && (
            <button type="button" className="set-edit" onClick={() => setSheetOpen(true)}>
              {t.install.settings.action}
            </button>
          )}
        </div>
      </div>
      {/* The hint says what installing BUYS, not how to do it — the how belongs in the sheet,
          at the size a gesture can be drawn. Where no path exists at all the row would
          otherwise be a dead label, so it says so rather than silently vanishing. */}
      <div className="set-hint-block">
        {installed || offerable ? t.install.settings.hint : t.install.settings.unavailable}
      </div>
      {sheetOpen && <InstallSheet path={path} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
