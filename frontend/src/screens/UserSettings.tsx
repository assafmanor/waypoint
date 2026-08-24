// Your own settings — ADR-0133 §1/§7. A full shell route, replacing the account
// sheet: a surface hosting a name field and a picture picker is the shape ADR-0090
// warns about, and the sheet's three facts (email, the Google line, sign out) sit
// fine on a page. Reached by tapping your avatar from all three shells.
//
// It holds identity + account facts and nothing invented. Every other candidate was
// rejected with a reason in ADR-0133 §7 — a theme toggle, a language picker, units,
// a user home zone, a calendar-sync toggle, account deletion — because each is
// either fiction today or belongs to a surface that already owns it.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_DISPLAY_NAME_LENGTH } from '@waypoint/shared';
import { t } from '../i18n/he';
import { useAuth } from '../state/auth-state';
import { SETTINGS_PICTURE_PATH, useAppBack } from '../state/nav-state';
import { readThemePick, setThemePick, THEME_PICK, type ThemePick } from '../lib/theme';
import { currencyForDeviceRegion } from '../lib/currency';
import { Avatar } from '../ui/primitives/Avatar';
import { NotificationSettings } from '../ui/NotificationSettings';
import { InstallSettings } from '../ui/InstallSettings';
import { PushDebugPanel } from '../ui/PushDebugPanel';
import { ChoiceGrid } from '../ui/primitives/ChoiceGrid';
import { CurrencyPicker, currencyLabel } from '../ui/primitives/CurrencyPicker';
import { Icon } from '../ui/Icon';
import { NavArrow } from '../ui/NavArrow';
import { StatusBanner } from '../ui/feedback/StatusBanner';
import {
  clearAllMapArchives,
  listMapArchives,
  removeMapArchive,
  removeTripMapArchives,
} from '../lib/map-archive-cache';
import { formatBytes } from '../lib/bytes';
import { readCachedTripList } from '../lib/cache';

interface MapStorageRow {
  id: string;
  name: string;
  sizeBytes: number;
  keys: string[];
  tripId?: string;
}

/** The three rungs, in ramp order. `system` first because it is the default and
 *  the one that keeps tracking; no icons, because the words are the whole
 *  vocabulary and `ChoiceGrid` omits the slot on an empty glyph. */
const THEME_OPTIONS: { value: ThemePick; icon: string; label: string }[] = [
  { value: THEME_PICK.system, icon: '', label: t.shell.account.themeSystem },
  { value: THEME_PICK.light, icon: '', label: t.shell.account.themeLight },
  { value: THEME_PICK.dark, icon: '', label: t.shell.account.themeDark },
];

export default function UserSettings() {
  const { me, logout, patchMe } = useAuth();
  const goBack = useAppBack();
  const navigate = useNavigate();
  const [draftName, setDraftName] = useState(me?.user.displayName ?? '');
  const [failed, setFailed] = useState(false);
  // Seeded from storage rather than from a provider: the theme is device state,
  // not trip or account state, so nothing above this screen needs to hold it.
  const [themePick, setPick] = useState<ThemePick>(readThemePick);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [mapStorage, setMapStorage] = useState<MapStorageRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([listMapArchives(), readCachedTripList()]).then(
      ([entries, trips]) => {
        if (!live) return;
        const tripNames = new Map(trips.map((trip) => [trip.id, trip.name]));
        const rows = new Map<string, MapStorageRow>();
        for (const entry of entries) {
          const id = entry.tripId ?? 'world';
          const row = rows.get(id) ?? {
            id,
            name: entry.tripId
              ? (tripNames.get(entry.tripId) ?? t.shell.account.mapStorageUnknownTrip)
              : t.shell.account.mapStorageWorld,
            sizeBytes: 0,
            keys: [],
            tripId: entry.tripId,
          };
          row.sizeBytes += entry.sizeBytes;
          row.keys.push(entry.key);
          rows.set(id, row);
        }
        setMapStorage([...rows.values()]);
      },
      () => {
        if (live) setMapStorage([]);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const mapBytes = mapStorage?.reduce((sum, row) => sum + row.sizeBytes, 0) ?? 0;

  const removeMapStorageRow = (row: MapStorageRow) => {
    const removing = row.tripId
      ? removeTripMapArchives(row.tripId)
      : Promise.all(row.keys.map(removeMapArchive)).then(() => undefined);
    void removing.then(
      () => setMapStorage((current) => current?.filter((item) => item.id !== row.id) ?? []),
      () => {},
    );
  };

  if (!me) return null;

  /** The home currency (ADR-0180 §2), and note where the default comes from:
   *  `null` on the account means "never chosen", and the DEVICE's region answers
   *  it — through the same `COUNTRY_CURRENCY` table the trip's own currency is
   *  derived from. The server does not guess on the user's behalf, because the
   *  only thing it knows about them is an email. */
  const currency = me.user.preferredCurrency ?? currencyForDeviceRegion();

  /** Same LWW shape as the name above, minus the blur dance — a picker commits
   *  the moment it is tapped, so there is nothing to debounce. */
  const commitCurrency = async (picked: string) => {
    setCurrencyOpen(false);
    if (picked === me.user.preferredCurrency) return;
    setFailed(false);
    try {
      await patchMe({ preferredCurrency: picked });
    } catch {
      setFailed(true);
    }
  };

  const trimmed = draftName.trim();
  const dirty = trimmed.length > 0 && trimmed !== me.user.displayName;

  /** Saved on blur rather than behind a button: one field, and a name is an LWW
   *  patch (ADR-0012), so an explicit save step would be ceremony. An empty field
   *  is not a rename — it reverts rather than writing a nameless user. */
  const commitName = async () => {
    if (!dirty) {
      setDraftName(me.user.displayName);
      return;
    }
    setFailed(false);
    try {
      await patchMe({ displayName: trimmed });
    } catch {
      setFailed(true);
      setDraftName(me.user.displayName);
    }
  };

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={goBack} aria-label={t.shell.account.back}>
            <NavArrow variant="back" />
          </button>
          <div className="new-title">{t.shell.account.title}</div>
        </div>
      </header>

      <main className="set-body">
        {failed && <StatusBanner tone="warn">{t.shell.account.saveFailed}</StatusBanner>}

        <div className="set-sec-title">{t.shell.account.identity}</div>
        <div className="set-card">
          <div className="id-hero">
            {/* The avatar IS the way to change it (ADR-0133 §6) — the badge lives on
                the picture page's hero; here the whole circle is the affordance. */}
            <Avatar
              person={me.user}
              size="lg"
              onClick={() => navigate(SETTINGS_PICTURE_PATH)}
              label={t.shell.account.picture.change}
            />
            <button className="id-change" onClick={() => navigate(SETTINGS_PICTURE_PATH)}>
              {t.shell.account.picture.change}
            </button>
          </div>
          <div className="id-row">
            <span className="lab">{t.shell.account.nameLabel}</span>
            <input
              className="id-input"
              value={draftName}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
            />
          </div>
        </div>
        <div className="set-hint-block">{t.shell.account.sharedHint}</div>

        {/* ADR-0133 §7 rejected a theme toggle here in July, for one stated
            reason — "a switch that does nothing is worse than a thin page" —
            which was true while the remap was inert and expired the moment it
            was not (ADR-0158 §8). The rejection is amended by its own
            condition, not overturned. */}
        <div className="set-sec-title">{t.shell.account.display}</div>
        <div className="set-card">
          <div className="id-row">
            <span className="lab">{t.shell.account.themeLabel}</span>
          </div>
          <ChoiceGrid
            options={THEME_OPTIONS}
            value={themePick}
            onChange={(pick) => {
              setPick(pick);
              setThemePick(pick);
            }}
            ariaLabel={t.shell.account.themeLabel}
          />
        </div>
        <div className="set-hint-block">{t.shell.account.themeHint}</div>

        {/* Its OWN card inside the same section, not a second row in the theme's
            (ADR-0180 §2, mockup §7). One hint per card is the shipped pattern,
            and these two facts have OPPOSITE persistence — the theme's hint
            promises "saved on this device" and a currency is account state, so
            sharing a card would leave two hints beneath it with nothing to say
            which was which. */}
        <div className="set-card">
          <div className="id-row">
            <span className="lab">{t.shell.account.currencyLabel}</span>
            <button
              type="button"
              className="set-pick-trigger"
              onClick={() => setCurrencyOpen(true)}
            >
              <span>{currency ? currencyLabel(currency) : t.shell.account.currencyUnset}</span>
              <Icon name="caret" dir="down" />
            </button>
          </div>
        </div>
        <div className="set-hint-block">{t.shell.account.currencyHint}</div>
        {currencyOpen && (
          <CurrencyPicker
            value={currency}
            suggested={[currencyForDeviceRegion()].filter((c): c is string => !!c)}
            onChange={commitCurrency}
            onClose={() => setCurrencyOpen(false)}
          />
        )}

        {/* Between תצוגה and מפות אופליין (ADR-0197 §7.1): notifications are a preference a
            person chooses, map storage is housekeeping, and the account stays last because it
            is the only section nothing in it was chosen. */}
        <NotificationSettings
          vapidPublicKey={me.push?.vapidPublicKey ?? null}
          prefs={{
            // An absent `notify` is a cached `/me` from an older build; ON matches the column
            // default, and the safe direction here is "as the server has it".
            notifyTasks: me.notify?.tasks ?? true,
            notifyObligations: me.notify?.obligations ?? true,
          }}
          onPatchPrefs={patchMe}
        />

        {/* Immediately after notifications, because that section's iPhone sentence now points
            at this row instead of re-teaching the gesture (ADR-0204 §6) — the thing it points
            at should be the next thing you see. */}
        <InstallSettings />

        <div className="set-sec-title">{t.shell.account.mapStorage}</div>
        <div className="set-card">
          <div className="id-row">
            <span className="lab">{t.shell.account.mapStorageSize}</span>
            <span className="val mono" dir="auto">
              {formatBytes(mapBytes)}
            </span>
            <button
              type="button"
              className="set-edit"
              onClick={() => {
                void clearAllMapArchives().then(
                  () => setMapStorage([]),
                  () => {},
                );
              }}
            >
              {t.shell.account.mapStorageClear}
            </button>
          </div>
          {mapStorage?.map((row) => (
            <div className="id-row" key={row.id}>
              <span className="lab">{row.name}</span>
              <span className="val mono" dir="auto">
                {formatBytes(row.sizeBytes)}
              </span>
              <button
                type="button"
                className="set-edit"
                aria-label={t.shell.account.mapStorageDeleteTrip(row.name)}
                onClick={() => removeMapStorageRow(row)}
              >
                {t.shell.account.mapStorageDelete}
              </button>
            </div>
          ))}
        </div>
        <div className="set-hint-block">{t.shell.account.mapStorageHint}</div>

        <div className="set-sec-title">{t.shell.account.accountSection}</div>
        <div className="set-card">
          <div className="id-row">
            <span className="lab">{t.shell.account.emailLabel}</span>
            {/* `dir="auto"` — a Latin run inside RTL copy is an island (ADR-0118). */}
            <span className="val dim" dir="auto">
              {me.user.email}
            </span>
          </div>
          <div className="id-google">
            <span className="dot" />
            {t.shell.account.provider}
          </div>
        </div>
        <div className="set-hint-block">{t.shell.account.emailHint}</div>

        {/* The instrument stays, and its job has changed. The designed section above is now
            the product surface; this remains behind `VITE_PUSH_DEBUG` for the one thing the
            product surface deliberately does not do — read back the raw endpoint, which is
            how you confirm the row the backend stored is this device. */}
        <PushDebugPanel />

        {/* Signing out is routine, so it is NOT the danger grammar — that is reserved
            for the irreversible (leaving a trip, deleting it). */}
        <button className="acct-signout" onClick={logout}>
          {t.shell.account.signOut}
        </button>
      </main>
    </div>
  );
}
