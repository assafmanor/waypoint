// Trip settings — /trip/:id/settings (ADR-0039). Admin-governed: only admins
// edit trip details, promote members, remove members, and delete the trip;
// peers get a read-only view. Every mutation is data-plane (optimistic +
// broadcast + offline outbox) via the trip-state settings verbs. Mode-neutral
// paper chrome (reached from both modes, outside the mode Shell). Design
// reference: mockups/trip-settings-v1.html.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  currencyForCountry,
  DESTINATIONS,
  TRIP_ICON_CLUSTERS,
  type Membership,
  type RemovedMember,
  type UpdateTripInput,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useAuth } from '../state/auth-state';
import { useAppBack } from '../state/nav-state';
import { ConfirmDialog, type ConfirmTone } from '../ui/primitives/ConfirmDialog';
import { ZonePicker, zoneLabel } from '../ui/primitives/ZonePicker';
import { CurrencyPicker, currencyLabel } from '../ui/primitives/CurrencyPicker';
import { currencyAfterDestinationEdit, currencyForDeviceRegion } from '../lib/currency';
import { FormError } from '../ui/primitives/FormError';
import { DateField } from '../ui/primitives/DateField';
import { tokenClass } from '../ui/primitives/ValueToken';
import { useFormErrors, type FieldProblem } from '../ui/primitives/useFormErrors';
import { DestinationPicker, type PickedDestination } from '../ui/DestinationPicker';
import { Icon } from '../ui/Icon';
import { IconPicker } from '../ui/IconPicker';
import { TripLinkRow } from '../ui/TripLinkRow';
import { useToast } from '../ui/Toast';
import { useIsOffline, useOutboxCount } from '../lib/outbox';
import { formatTripDates } from '../lib/time';
import { allowMemberBack, createInvite, fetchRemovedMembers, rotateInvite } from '../lib/api';
import { inviteLink } from '../lib/invite-link';
import { DEFAULT_TRIP_ICON, DEVICE_TIMEZONE, DOT_SEPARATOR, CONTROL_ICON } from '../constants';
import { NavArrow } from '../ui/NavArrow';
import { t } from '../i18n/he';
import { Avatar } from '../ui/primitives/Avatar';
import { MemberRow } from '../ui/domain/MemberRow';
import { MemberSheet } from '../ui/domain/MemberSheet';

type ConfirmState = {
  tone: ConfirmTone;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function TripSettings() {
  const navigate = useNavigate();
  const goBack = useAppBack();
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
            toast(CONTROL_ICON.done, t.settings.toast.left);
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
          () => toast(CONTROL_ICON.done, t.settings.toast.deleted),
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
            toast(CONTROL_ICON.done, t.settings.toast.removed);
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
      () => toast(CONTROL_ICON.done, t.settings.allowedBack(name)),
      () => {
        toast(CONTROL_ICON.warn, t.toast.writeFailed);
        reloadRemoved(); // roll the optimistic drop back
      },
    );
  };

  const generateInvite = () => {
    setInvite('loading');
    createInvite(trip.id).then(
      (res) => setInvite({ url: inviteLink(res.inviteUrl) }),
      () => {
        setInvite(null);
        toast(CONTROL_ICON.warn, t.toast.writeFailed);
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
            setInvite({ url: inviteLink(res.inviteUrl) });
            toast(CONTROL_ICON.done, t.settings.inviteReset_done);
          },
          () => {
            setInvite(null);
            toast(CONTROL_ICON.warn, t.toast.writeFailed);
          },
        );
      },
    });

  const copyInvite = () => {
    if (invite === 'loading' || !invite) return;
    void navigator.clipboard?.writeText(invite.url);
    toast(CONTROL_ICON.clipboard, t.settings.inviteCopied);
  };

  return (
    <div className="app">
      <header className="new-head">
        <div className="new-head-row">
          <button className="back" onClick={goBack} aria-label={t.settings.back}>
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
            <Icon name="offline" /> {t.header.offlineNow}
          </div>
        )}
        {pendingCount > 0 && (
          <div className="offline-badge">
            <Icon name="sync" /> {t.header.pendingSync(pendingCount)}
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
            <ReadRow icon={<Icon name="edit" />} label={t.settings.nameLabel} value={trip.name} />
            <ReadRow
              icon={<Icon name="pin" />}
              label={t.settings.destinationLabel}
              value={trip.destination}
            />
            <ReadRow
              icon={<Icon name="calendar" />}
              label={t.settings.datesLabel}
              value={formatTripDates(trip.startDate, trip.endDate, {
                style: 'prose',
                withYear: true,
              })}
            />
            <ReadRow
              icon={<Icon name="clock" />}
              label={t.settings.timezoneLabel}
              value={trip.timezone}
              mono
            />
            <ReadRow
              icon={<Icon name="currency" />}
              label={t.settings.currencyLabel}
              value={trip.currency ?? '-'}
              mono
            />
            {!isAdmin && (
              <div className="set-note">
                <Icon name="lock" /> {t.settings.peerManaged}
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
            if (!u) return null;
            return (
              <MemberRow key={m.id} person={u} role={m.role} isMe={isMe} reserveAction={isAdmin}>
                {isAdmin && !isMe && (
                  <button
                    className="kebab"
                    onClick={() => setSheetFor(m)}
                    aria-label={t.settings.memberActions(u.displayName)}
                  >
                    <Icon name="more" />
                  </button>
                )}
              </MemberRow>
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
                  <Avatar person={r} size="inherit" className="av" />
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
        {/* The same row the share sheet shows (ADR-0213's 2026-08-30 amendment) — one
            component, not a second copy of "the trip's link", and neutral rather than the
            plan violet `.invite-box` painted here outside Plan mode. */}
        {invite && invite !== 'loading' ? (
          <TripLinkRow url={invite.url} onCopy={copyInvite} />
        ) : (
          <button
            className="set-invite-btn"
            onClick={generateInvite}
            disabled={invite === 'loading'}
          >
            <Icon name="share" /> {t.settings.inviteGenerate}
          </button>
        )}
        <div className="set-hint-block">{t.settings.inviteHint}</div>

        {/* ===== Danger zone ===== */}
        <div className="set-sec-title set-danger-title">{t.settings.dangerZone}</div>
        <div className="set-card set-danger">
          <div className="set-danger-row">
            <span className="fi">
              <Icon name={CONTROL_ICON.leave} />
            </span>
            <div className="fv">{t.settings.leave}</div>
            <button className="set-danger-btn" onClick={leaveTrip}>
              {t.settings.leaveAction}
            </button>
          </div>
          {isAdmin && (
            <div className="set-danger-row">
              <span className="fi">
                <Icon name="trash" />
              </span>
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
          person={userFor(sheetFor.userId) ?? { displayName: '', avatarHue: 'denim' }}
          isMe={sheetFor.userId === myId}
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
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="set-row">
      <span className="fi">{icon}</span>
      <div className="main">
        <div className="fl">{label}</div>
        {/* The twin of `BookingDetail`'s fact row, and it carried the same mistake: a
            ternary `dir="ltr"` the ADR-0118 lint guard read past, over values that are
            stored content in whatever script the trip has — a name someone typed, a
            destination Google named. `dir="auto"` resolves the zone and the budget LTR
            exactly as before and stops reversing the two that are not Latin. */}
        <div className={`fv${mono ? ' mono' : ''}`} dir="auto">
          {value}
        </div>
      </div>
    </div>
  );
}

/** What the details form can refuse, one name per BOX on screen (ADR-0150) — the two
 *  date inputs are one box, because "the trip needs dates" is one statement. */
type SettingsField = 'name' | 'destination' | 'dates';

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
  // The destination's structured fields, seeded from the stored trip (ADR-0113).
  // A name-only edit re-sends these unchanged; a resolved pick replaces them; a
  // "use as typed" pick empties them so the save clears the stale coordinates.
  const [destPlace, setDestPlace] = useState<Omit<PickedDestination, 'name'>>({
    googlePlaceId: trip.destinationGooglePlaceId,
    lat: trip.destinationLat,
    lng: trip.destinationLng,
    countryCode: trip.destinationCountryCode,
  });
  const [candidateZones, setCandidateZones] = useState<string[] | undefined>(undefined);
  const [icon, setIcon] = useState(trip.icon ?? DEFAULT_TRIP_ICON);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [timezone, setTimezone] = useState(trip.timezone);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);

  // A picked destination sets the display name + structured fields and, when the
  // pick resolves a real place, the derived primary timezone (ADR-0113). Unlike
  // creation, a "use as typed" pick keeps the existing trip zone rather than
  // resetting it to the device default — an established trip already has a
  // meaningful zone the editor shouldn't silently discard.
  const handleDestination = ({ name: destName, ...place }: PickedDestination) => {
    setDestination(destName);
    setDestPlace(place);
    if (place.timezone) setTimezone(place.timezone);
    setCandidateZones(place.candidateZones);
    // The currency follows the same rule as the zone above, one line down and
    // for the same reason (ADR-0180 §1): a resolved pick sets it, and anything
    // that does NOT resolve — "use as typed", or a country the table doesn't
    // carry — leaves the trip's existing currency alone rather than clearing it.
    //
    // The overwrite is safe here in a way it would not have been before: this
    // sets FORM state, so it is visible above the save button and one tap from
    // being changed back. And the deliberate non-default it used to trample
    // ("I keep this trip in shekels") now has a field of its own — the member's
    // preferred currency (ADR-0180 §2) — so the trip's is the destination's again.
    setCurrency((prev) => currencyAfterDestinationEdit(place.countryCode, prev) ?? '');
  };
  const [currency, setCurrency] = useState(trip.currency ?? '');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Every refusal this form can make, marked at the field it is about (ADR-0150).
  const errors = useFormErrors<SettingsField>();

  // Surface the device zone + the trip's own place zones first in the picker
  // (ADR-0113 §6) — the zones most likely to be wanted, before the full IANA list.
  const { places } = useTrip();
  const suggestedZones = [
    DEVICE_TIMEZONE,
    ...(candidateZones ?? []),
    ...places.map((p) => p.timezone).filter((z): z is string => !!z),
  ];

  // The same idea one field down: the currencies most likely to be wanted, ahead
  // of the full ISO-4217 list. The destination's own is first (it is what the
  // derivation would have chosen), then the device region's — which is the same
  // COUNTRY_CURRENCY table read against the phone rather than the trip.
  const suggestedCurrencies = [
    currencyForCountry(destPlace.countryCode),
    currencyForDeviceRegion(),
  ].filter((c): c is string => !!c);

  // No floor-to-today here (unlike creation, PR #92): an existing trip may be
  // under way or already past, so editing its dates must stay unbounded below.
  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);

  const save = async () => {
    // THE SAVE SAYS WHY (ADR-0150). It used to be `disabled` on a `canSave` covering four
    // fields with no note beside it — the one dead primary in the app that named nothing,
    // so a trip missing its destination offered a button that did not respond and no
    // reason. Now it is pressable and refuses at whichever field is missing.
    const problems: FieldProblem<SettingsField>[] = [];
    if (!name) problems.push({ field: 'name', message: t.settings.nameRequired });
    if (!destination) problems.push({ field: 'destination', message: t.settings.destRequired });
    if (!startDate || !endDate)
      problems.push({ field: 'dates', message: t.settings.datesRequired });
    else if (datesInvalid) problems.push({ field: 'dates', message: t.shell.newTrip.dateError });
    if (errors.report(problems)) return;

    const input: UpdateTripInput = {
      name,
      destination,
      destinationGooglePlaceId: destPlace.googlePlaceId ?? null,
      destinationLat: destPlace.lat ?? null,
      destinationLng: destPlace.lng ?? null,
      destinationCountryCode: destPlace.countryCode ?? null,
      icon: icon || undefined,
      startDate,
      endDate,
      timezone,
      currency: currency || undefined,
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

  const nameMark = errors.field('name');
  const destMark = errors.field('destination');
  const datesMark = errors.field('dates');

  return (
    <form
      className="set-card set-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      // The app does the refusing, not the browser (ADR-0150 §5).
      noValidate
      {...errors.formProps}
    >
      <div className="set-fld" ref={nameMark.ref} data-invalid={nameMark.error ? '' : undefined}>
        <label htmlFor="s-name">{t.settings.nameLabel}</label>
        <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
        <FormError>{nameMark.error}</FormError>
      </div>
      <div className="set-fld" ref={destMark.ref} data-invalid={destMark.error ? '' : undefined}>
        <label htmlFor="dest">{t.settings.destinationLabel}</label>
        <DestinationPicker value={destination} onPick={handleDestination} />
        {candidateZones && <p className="dest-tz-note">{t.shell.newTrip.tzMultiNote}</p>}
        <FormError>{destMark.error}</FormError>
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
      <div className="set-fld" ref={datesMark.ref}>
        <label>{t.settings.datesLabel}</label>
        {/* THE RANGE IS A SENTENCE (ADR-0177 §1). `מ־` and `עד` used to sit BESIDE the
            boxes, and that is what the owner saw overflow: `.set-fld .df` was
            `width: 100%`, so caption + gap + box came out 21px wider than its grid
            track and `.subfld` ran off the card, clipping `עד` to `ד`. As words inside
            a wrapping line they cannot be clipped by an edge — the fix is structural,
            not a width someone has to keep tuning. */}
        <div className="wf-line">
          <span className="wf-word">{t.whenField.rangeFrom}</span>
          <DateField
            className={tokenClass('date', { empty: !startDate })}
            value={startDate}
            data-invalid={!startDate && datesMark.error ? '' : undefined}
            onChange={setStartDate}
          />
          <span className="wf-word">{t.whenField.rangeTo}</span>
          <DateField
            className={tokenClass('date', { empty: !endDate })}
            min={startDate}
            // Live while the range contradicts itself, and on the save's refusal —
            // two reasons, one mark (ADR-0150 §7).
            data-invalid={datesInvalid || (!endDate && datesMark.error) ? '' : undefined}
            value={endDate}
            onChange={setEndDate}
          />
        </div>
        <FormError>{datesInvalid ? t.shell.newTrip.dateError : datesMark.error}</FormError>
      </div>
      <div className="set-fld">
        <label htmlFor="s-tz">{t.settings.timezoneLabel}</label>
        <button
          type="button"
          id="s-tz"
          className="set-pick-trigger"
          onClick={() => setTzPickerOpen(true)}
        >
          <span>{zoneLabel(timezone)}</span>
          <Icon name="caret" dir="down" />
        </button>
      </div>
      {tzPickerOpen && (
        <ZonePicker
          value={timezone}
          suggested={suggestedZones}
          onChange={(zone) => {
            setTimezone(zone);
            setTzPickerOpen(false);
          }}
          onClose={() => setTzPickerOpen(false)}
        />
      )}
      <div className="set-fld">
        <label htmlFor="s-currency">{t.settings.currencyLabel}</label>
        <button
          type="button"
          id="s-currency"
          className="set-pick-trigger"
          onClick={() => setCurrencyPickerOpen(true)}
        >
          <span>{currency ? currencyLabel(currency) : t.settings.currencyUnset}</span>
          <Icon name="caret" dir="down" />
        </button>
      </div>
      {currencyPickerOpen && (
        <CurrencyPicker
          value={currency || undefined}
          suggested={suggestedCurrencies}
          onChange={(picked) => {
            setCurrency(picked);
            setCurrencyPickerOpen(false);
          }}
          onClose={() => setCurrencyPickerOpen(false)}
        />
      )}
      <div className="set-hint-block">{t.settings.derivedHint}</div>
      <div className="set-form-actions">
        {/* Disabled only while a write is in flight — never as a stand-in for a
            refusal it cannot explain (ADR-0150 §8). */}
        <button type="submit" className="set-save" disabled={saving}>
          {t.settings.save}
        </button>
        <button type="button" className="set-cancel" onClick={onCancel}>
          {t.settings.cancel}
        </button>
      </div>
    </form>
  );
}
