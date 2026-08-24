// The two unprompted install asks (ADR-0204 §2), and the policy that keeps them to two.
//
// ── NOT A NEW COMPONENT, AND THAT IS THE POINT ────────────────────────────────────────────
//
// `PushAskBanner` already established this shape for exactly this problem — "ask once, at an
// earned moment, remember either answer, never re-ask" — and its header says in as many
// words that it added no infrastructure. This adds none either: `StatusBanner` with an
// action and a dismiss, on the `.app-update` mount ADR-0181 established for a notice that is
// not a fact about the screen you happen to be on.
//
// ── WHY THE TWO DOORS SAY DIFFERENT THINGS ────────────────────────────────────────────────
//
// Door A is the first arrival after joining a trip: the highest-intent moment the app has,
// because somebody has just committed to travelling. Door B is departure inside
// `INSTALL_DEPARTURE_WINDOW_DAYS`: the moment installing is actually worth something,
// because offline, notifications and a full screen all become true at the trip.
//
// They are two strings, not one template, on purpose. A generic "install our app" is
// precisely the sentence that turns this into a nag, and a shared template invites one.
//
// ── AND WHY A REFUSAL IS A SNOOZE ─────────────────────────────────────────────────────────
//
// This is the one place it deliberately parts from ADR-0197 §7. There, "no" is final,
// because a refused notification permission is not recoverable in-app on any platform. An
// install refusal IS recoverable, and installing gets MORE worth doing as departure nears —
// so the first "no" is a deferral, door B is what earns the second ask, and
// `INSTALL_ASK_BUDGET` is what stops a deferral becoming a nag.
import { useEffect, useState } from 'react';
import type { Trip } from '@waypoint/shared';
import { StatusBanner } from './feedback';
import { InstallSheet } from './InstallSheet';
import { useHasOverlay } from '../state/nav-state';
import { isEditingField } from '../lib/guarded-reload';
import { daysUntilStart } from '../lib/mode';
import { getNow, useClock } from '../lib/useClock';
import {
  canOfferInstall,
  consumeJoinArm,
  installAskAllowed,
  markAskedThisSession,
  markInstallAsked,
} from '../lib/install';
import { INSTALL_DEPARTURE_WINDOW_DAYS } from '../constants';
import { t } from '../i18n/he';

/** Which door opened. Carries the fact it opened on, so the sentence can state it. */
type AskReason = { kind: 'joined' } | { kind: 'soon'; days: number };

export function InstallAskBanner({
  trip,
}: {
  trip: Pick<Trip, 'name' | 'startDate' | 'endDate' | 'timezone'>;
}) {
  // Decided once and then held: a banner that re-derived itself every tick could vanish
  // under the finger reaching for it.
  const [reason, setReason] = useState<AskReason | null>(null);
  const [answered, setAnswered] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasOverlay = useHasOverlay();
  const now = useClock();

  useEffect(() => {
    if (reason) return;
    // Capability first, and it is also what keeps the join arm from being spent on a device
    // that could never install anyway.
    if (!canOfferInstall()) return;
    // The same question `useAppUpdate` asks before it swaps a build: is this a moment where
    // interrupting costs nothing. A sheet open or a field being typed in is not, and the arm
    // is deliberately NOT spent here — the next quiet tick will find it still set.
    if (hasOverlay() || isEditingField()) return;

    // Spent as soon as the app reaches a quiet trip surface, whether or not the budget then
    // allows the ask. Door A means "the first arrival", and by the next session it is not
    // one — so a budget-blocked arrival still consumes it, which is also what stops the key
    // outliving its meaning.
    const armed = consumeJoinArm();
    const days = daysUntilStart(trip, now);
    const next: AskReason | null = armed
      ? { kind: 'joined' }
      : days !== null && days <= INSTALL_DEPARTURE_WINDOW_DAYS
        ? { kind: 'soon', days }
        : null;
    if (!next) return;
    if (!installAskAllowed(getNow())) return;

    // Spent by the SHOWING, not the answering: a banner scrolled past has still been asked.
    markAskedThisSession();
    setReason(next);
  }, [reason, hasOverlay, trip, now]);

  if (!reason || answered) return null;

  // Both buttons are answers, exactly as in `PushAskBanner`. Taking the offer records one
  // too: whatever the platform prompt then does is not something to re-ask about.
  const answer = () => {
    markInstallAsked(getNow());
    setAnswered(true);
  };

  return (
    <>
      <div className="app-update">
        {/* `neutral`: nothing is wrong and nothing failed — and installing is not a time,
            place or plan fact, so it spends none of ADR-0028's semantic budget either. */}
        <StatusBanner
          tone="neutral"
          action={{ label: t.install.ask.action, onClick: () => setSheetOpen(true) }}
          onDismiss={answer}
        >
          {reason.kind === 'joined'
            ? t.install.ask.joined(trip.name)
            : t.install.ask.soon(reason.days)}
        </StatusBanner>
      </div>
      {sheetOpen && (
        <InstallSheet
          onClose={() => {
            setSheetOpen(false);
            answer();
          }}
        />
      )}
    </>
  );
}
