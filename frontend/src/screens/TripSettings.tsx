// Trip settings — /trip/:id/settings (ADR-0039). Admin-governed: only admins
// edit trip details, promote members, remove members, and delete the trip;
// peers get a read-only view. Every mutation is data-plane (optimistic +
// broadcast + offline outbox) via the trip-state settings verbs. Mode-neutral
// paper chrome (reached from both modes, outside the mode Shell). Design
// reference: mockups/trip-settings-v1.html.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DESTINATIONS,
  TRIP_ICON_CLUSTERS,
  type Membership,
  type RemovedMember,
  type UpdateTripInput,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { ConfirmDialog, type ConfirmTone } from '../ui/primitives/ConfirmDialog';
import { IconPicker } from '../ui/IconPicker';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { useIsOffline, useOutboxCount } from '../lib/outbox';
import { allowMemberBack, createInvite, fetchRemovedMembers, rotateInvite } from '../lib/api';
import {
  AVATAR_INITIAL_LENGTH,
  DEFAULT_TRIP_ICON,
  DEVICE_LOCALE,
  DOT_SEPARATOR,
  ICONS,
} from '../constants';
import { NavArrow } from '../ui/NavArrow';
import { t } from '../i18n/he';

// Small, stable option lists for the manual timezone/currency selects (ADR-0039
// — auto-derivation from the destination is a future update). The trip's own
// current value is always included so nothing is silently dropped on save.
const TZ_OPTIONS = ['Asia/Tokyo', 'Asia/Jerusalem', 'Europe/London', 'America/New_York', 'UTC'];
const CURRENCY_OPTIONS = ['JPY', 'ILS', 'USD', 'EUR', 'GBP'];
const withCurrent = (options: string[], current?: string) =>
  current && !options.includes(current) ? [current, ...options] : options;

type ConfirmState = {
  tone: ConfirmTone;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function TripSettings() {
  const navigate = useNavigate();
  const { trip, members, users, settings, tripDeleted } = useTrip();
  const { me } = useAuth();
  const toast = useToast();
  const offline = useIsOffline();
  const pendingCount = useOutboxCount();

  const myId = me?.user.id;
  const isAdmin = members.some((m) => m.userId === myId && m.role === 'admin');

  const [editing, setEditing] = useState(false);
  const [sheetFor, setSheetFor] = useState<Membership | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [invite, setInvite] = useState<{ url: string } | 'loading' | null>(null);
  const [removed, setRemoved] = useState<RemovedMember[] | null>(null);

  // Leave for /trips once the trip is gone — whether we deleted it or a remote
  // admin did (tripDeleted flips from the WS change, ADR-0039).
  useEffect(() => {
    if (tripDeleted) navigate('/trips', { replace: true });
  }, [tripDeleted, navigate]);

  // The admin-only "Removed" list (ADR-0067) — kicked members, so they can be
  // allowed back. Reloaded after a kick or an allow-back.
  const reloadRemoved = useCallback(() => {
    if (!isAdmin) return;
    fetchRemovedMembers(trip.id).then(setRemoved, () => {});
  }, [isAdmin, trip.id]);
  useEffect(() => reloadRemoved(), [reloadRemoved]);

  const userFor = (userId: string) => users.find((u) => u.id === userId);

  const leaveTrip = () =>
    setConfirm({
      tone: 'danger',
      title: t.settings.leaveConfirmTitle,
      body: t.settings.leaveConfirmBody(trip.name),
      confirmLabel: t.settings.leaveAction,
      onConfirm: () => {
        void settings.removeMember(myId!).then(
          () => {
            toast(ICONS.done, t.settings.toast.left);
            navigate('/trips', { replace: true });
          },
          () => {}, // the verb toasts its own failure and rolls back
        );
      },
    });

  const deleteTrip = () =>
    setConfirm({
      tone: 'danger',
      title: t.settings.deleteConfirmTitle,
      body: t.settings.deleteConfirmBody(trip.name),
      confirmLabel: t.settings.deleteAction,
      onConfirm: () => {
        void settings.deleteTrip().then(
          () => toast(ICONS.done, t.settings.toast.deleted),
          () => {},
        );
      },
    });

  const removeMember = (m: Membership) => {
    const name = userFor(m.userId)?.displayName ?? '';
    setConfirm({
      tone: 'danger',
      title: t.settings.removeConfirmTitle,
      body: t.settings.removeConfirmBody(name),
      confirmLabel: t.settings.removeMember,
      onConfirm: () => {
        void settings.removeMember(m.userId).then(
          () => {
            toast(ICONS.done, t.settings.toast.removed);
            reloadRemoved(); // the kick just added a block — surface it in "Removed"
          },
          () => {},
        );
      },
    });
  };

  const promote = (m: Membership) => {
    void settings.setMemberRole(m.userId, 'admin').catch(() => {});
  };

  const allowBack = (userId: string, name: string) => {
    setRemoved((cur) => cur?.filter((r) => r.userId !== userId) ?? null); // optimistic
    allowMemberBack(trip.id, userId).then(
      () => toast(ICONS.done, t.settings.allowedBack(name)),
      () => {
        toast(ICONS.warn, t.toast.writeFailed);
        reloadRemoved(); // roll the optimistic drop back
      },
    );
  };

  const inviteUrlFrom = (path: string) => `${window.location.origin}${path}`;

  const generateInvite = () => {
    setInvite('loading');
    createInvite(trip.id).then(
      (res) => setInvite({ url: inviteUrlFrom(res.inviteUrl) }),
      () => {
        setInvite(null);
        toast(ICONS.warn, t.toast.writeFailed);
      },
    );
  };

  // Revoke + replace the link (admin-only, ADR-0067) — the old code dies at once.
  const resetInvite = () =>
    setConfirm({
      tone: 'neutral',
      title: t.settings.inviteReset,
      body: t.settings.inviteResetHint,
      confirmLabel: t.settings.inviteReset,
      onConfirm: () => {
        setInvite('loading');
        rotateInvite(trip.id).then(
          (res) => {
            setInvite({ url: inviteUrlFrom(res.inviteUrl) });
            toast(ICONS.done, t.settings.inviteReset_done);
          },
          () => {
            setInvite(null);
            toast(ICONS.warn, t.toast.writeFailed);
          },
        );
      },
    });

  const copyInvite = () => {
    if (invite === 'loading' || !invite) return;
    void navigator.clipboard?.writeText(invite.url);
    toast(ICONS.clipboard, t.settings.inviteCopied);
  };

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={() => navigate(-1)} aria-label={t.settings.back}>
            <NavArrow variant="back" />
          </button>
          <div className="new-title">{t.settings.title}</div>
        </div>
        <div className="set-sub">
          <b>{trip.icon ?? DEFAULT_TRIP_ICON}</b> {trip.name}
          <span className="dot">{DOT_SEPARATOR}</span>
          {trip.destination}
        </div>
        {offline && (
          <div className="offline-badge">
            {ICONS.offline} {t.header.offlineNow}
          </div>
        )}
        {pendingCount > 0 && (
          <div className="offline-badge">
            {ICONS.sync} {t.header.pendingSync(pendingCount)}
          </div>
        )}
      </header>

      <main className="set-body">
        {/* ===== Trip details ===== */}
        <div className="set-sec-title">
          {t.settings.details}
          {isAdmin && !editing && (
            <button className="set-edit" onClick={() => setEditing(true)}>
              {t.settings.edit}
            </button>
          )}
        </div>
        {editing ? (
          <DetailsEditor
            trip={trip}
            onCancel={() => setEditing(false)}
            onSave={async (input) => {
              await settings.updateTrip(input);
              setEditing(false);
            }}
          />
        ) : (
          <div className="set-card">
            <ReadRow icon={ICONS.edit} label={t.settings.nameLabel} value={trip.name} />
            <ReadRow icon="📍" label={t.settings.destinationLabel} value={trip.destination} />
            <ReadRow
              icon="🗓️"
              label={t.settings.datesLabel}
              value={`${trip.startDate} ${DOT_SEPARATOR} ${trip.endDate}`}
              mono
            />
            <ReadRow icon="🕓" label={t.settings.timezoneLabel} value={trip.timezone} mono />
            <ReadRow
              icon={ICONS.budget}
              label={t.settings.budgetLabel}
              value={
                trip.dailyBudgetMinor != null
                  ? `${trip.currency ?? ''} ${trip.dailyBudgetMinor}`.trim()
                  : '-'
              }
              mono
            />
            {!isAdmin && (
              <div className="set-note">
                {ICONS.lock} {t.settings.peerManaged}
              </div>
            )}
          </div>
        )}

        {/* ===== Party ===== */}
        <div className="set-sec-title">
          {t.settings.party}
          <span className="set-hint">{t.settings.memberCount(members.length)}</span>
        </div>
        <div className="set-card">
          {members.map((m) => {
            const u = userFor(m.userId);
            const isMe = m.userId === myId;
            return (
              <div className="set-member" key={m.id}>
                <div className="av" style={{ background: u?.avatarColor }}>
                  {u?.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
                </div>
                <div className="mn">
                  {u?.displayName}
                  {isMe && (
                    <span className="mr">
                      {' '}
                      {DOT_SEPARATOR} {t.settings.you}
                    </span>
                  )}
                </div>
                <span className={`role ${m.role === 'admin' ? 'owner' : 'mem'}`}>
                  {m.role === 'admin' ? t.settings.roleAdmin : t.settings.rolePeer}
                </span>
                {isAdmin && !isMe && (
                  <button
                    className="kebab"
                    onClick={() => setSheetFor(m)}
                    aria-label={t.settings.memberActions(u?.displayName ?? '')}
                  >
                    {ICONS.more}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== Removed (admin re-invite, ADR-0067) ===== */}
        {isAdmin && removed && removed.length > 0 && (
          <>
            <div className="set-sec-title">{t.settings.removedTitle}</div>
            <div className="set-card">
              {removed.map((r) => (
                <div className="set-member" key={r.userId}>
                  <div className="av" style={{ background: r.avatarColor }}>
                    {r.displayName.slice(0, AVATAR_INITIAL_LENGTH)}
                  </div>
                  <div className="mn">{r.displayName}</div>
                  <button className="set-edit" onClick={() => allowBack(r.userId, r.displayName)}>
                    {t.settings.allowBack}
                  </button>
                </div>
              ))}
            </div>
            <div className="set-hint-block">{t.settings.removedHint}</div>
          </>
        )}

        {/* ===== Invite ===== */}
        <div className="set-sec-title">
          {t.settings.invite}
          {isAdmin && invite && invite !== 'loading' && (
            <button className="set-edit" onClick={resetInvite}>
              {t.settings.inviteReset}
            </button>
          )}
        </div>
        {invite && invite !== 'loading' ? (
          <div className="invite-box" onClick={copyInvite}>
            <span className="code" dir="ltr">
              {invite.url}
            </span>
            <span className="cp">{ICONS.clipboard}</span>
          </div>
        ) : (
          <button
            className="set-invite-btn"
            onClick={generateInvite}
            disabled={invite === 'loading'}
          >
            {ICONS.share} {t.settings.inviteGenerate}
          </button>
        )}
        <div className="set-hint-block">{t.settings.inviteHint}</div>

        {/* ===== Danger zone ===== */}
        <div className="set-sec-title set-danger-title">{t.settings.dangerZone}</div>
        <div className="set-card set-danger">
          <div className="set-danger-row">
            <span className="fi">🚪</span>
            <div className="fv">{t.settings.leave}</div>
            <button className="set-danger-btn" onClick={leaveTrip}>
              {t.settings.leaveAction}
            </button>
          </div>
          {isAdmin && (
            <div className="set-danger-row">
              <span className="fi">{ICONS.trash}</span>
              <div className="fv">{t.settings.delete}</div>
              <button className="set-danger-btn" onClick={deleteTrip}>
                {t.settings.deleteAction}
              </button>
            </div>
          )}
        </div>
        <div className="set-hint-block">
          {isAdmin ? t.settings.deleteHint : t.settings.leaveHint}
        </div>
      </main>

      {sheetFor && (
        <MemberSheet
          member={sheetFor}
          name={userFor(sheetFor.userId)?.displayName ?? ''}
          color={userFor(sheetFor.userId)?.avatarColor}
          onClose={() => setSheetFor(null)}
          onPromote={() => {
            promote(sheetFor);
            setSheetFor(null);
          }}
          onRemove={() => {
            const m = sheetFor;
            setSheetFor(null);
            removeMember(m);
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          tone={confirm.tone}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={t.settings.cancel}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function ReadRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="set-row">
      <span className="fi">{icon}</span>
      <div className="main">
        <div className="fl">{label}</div>
        <div className={`fv${mono ? ' mono' : ''}`} dir={mono ? 'ltr' : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

function DetailsEditor({
  trip,
  onSave,
  onCancel,
}: {
  trip: ReturnType<typeof useTrip>['trip'];
  onSave: (input: UpdateTripInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination);
  const [icon, setIcon] = useState(trip.icon ?? DEFAULT_TRIP_ICON);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [timezone, setTimezone] = useState(trip.timezone);
  const [currency, setCurrency] = useState(trip.currency ?? '');
  const [budget, setBudget] = useState(trip.dailyBudgetMinor?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  // No floor-to-today here (unlike creation, PR #92): an existing trip may be
  // under way or already past, so editing its dates must stay unbounded below.
  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);
  const canSave = Boolean(name && destination && startDate && endDate && !datesInvalid && !saving);

  const save = async () => {
    if (!canSave) return;
    const input: UpdateTripInput = {
      name,
      destination,
      icon: icon || undefined,
      startDate,
      endDate,
      timezone,
      currency: currency || undefined,
      dailyBudgetMinor: budget ? Number(budget) : undefined,
    };
    setSaving(true);
    try {
      await onSave(input);
    } catch {
      // the settings verb already surfaced the failure + rolled back
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="set-card set-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="set-fld">
        <label htmlFor="s-name">{t.settings.nameLabel}</label>
        <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="set-fld">
        <label htmlFor="s-dest">{t.settings.destinationLabel}</label>
        <input id="s-dest" value={destination} onChange={(e) => setDestination(e.target.value)} />
      </div>
      <div className="set-fld">
        <label>{t.settings.iconLabel}</label>
        {/* Reuse the shared trip-mode IconPicker (flat archetype clusters + flag
            search); trips have no category, so the 2nd onChange arg is ignored. */}
        <IconPicker
          icon={icon}
          onChange={(next) => setIcon(next)}
          flatClusters={TRIP_ICON_CLUSTERS}
          destinations={DESTINATIONS}
        />
      </div>
      <div className="set-fld">
        <label>{t.settings.datesLabel}</label>
        <div className="date-row">
          <label className="subfld">
            <span>{t.settings.dateFrom}</span>
            <input
              type="date"
              lang={DEVICE_LOCALE}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="subfld">
            <span>{t.settings.dateTo}</span>
            <input
              type="date"
              lang={DEVICE_LOCALE}
              min={startDate}
              className={datesInvalid ? 'invalid' : ''}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        {datesInvalid && <div className="field-error">{t.shell.newTrip.dateError}</div>}
      </div>
      <div className="set-fld">
        <label htmlFor="s-tz">{t.settings.timezoneLabel}</label>
        <select id="s-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {withCurrent(TZ_OPTIONS, timezone).map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div className="set-fld">
        <label>{t.settings.budgetLabel}</label>
        <div className="budget-row">
          <select
            value={currency}
            aria-label={t.settings.budgetLabel}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">-</option>
            {withCurrent(CURRENCY_OPTIONS, currency || undefined).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>
      <div className="set-hint-block">{t.settings.derivedHint}</div>
      <div className="set-form-actions">
        <button type="submit" className="set-save" disabled={!canSave}>
          {t.settings.save}
        </button>
        <button type="button" className="set-cancel" onClick={onCancel}>
          {t.settings.cancel}
        </button>
      </div>
    </form>
  );
}

function MemberSheet({
  member,
  name,
  color,
  onClose,
  onPromote,
  onRemove,
}: {
  member: Membership;
  name: string;
  color?: string;
  onClose: () => void;
  onPromote: () => void;
  onRemove: () => void;
}) {
  return (
    <Sheet ariaLabel={t.settings.memberActions(name)} onClose={onClose}>
      <div className="ms-who">
        <div className="av" style={{ background: color }}>
          {name.slice(0, AVATAR_INITIAL_LENGTH)}
        </div>
        <div className="mn">{name}</div>
      </div>
      {member.role !== 'admin' && (
        <button className="ms-act" onClick={onPromote}>
          <span className="ic">👑</span> {t.settings.promote}
        </button>
      )}
      <button className="ms-act danger-item" onClick={onRemove}>
        <span className="ic">🚪</span> {t.settings.removeMember}
      </button>
      <button className="ms-cancel" onClick={onClose}>
        {t.settings.cancel}
      </button>
    </Sheet>
  );
}
