# 0204 — The install ask is three doors and a permanent home

**Status:** Proposed
**Date:** 2026-08-24
**Mockup:** [`mockups/install-is-three-doors-v1.html`](../../mockups/install-is-three-doors-v1.html)
**Touches:** [ADR-0007](0007-platform-pwa.md) (the PWA is installable — this is the first
decision about _asking_), [ADR-0197](0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md)
§7 (the doors pattern, and the blocker this reopens), [ADR-0078](0078-feedback-state-family.md)
(`StatusBanner`), [ADR-0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget).

## Context

Owner: _"I want to encourage visitors and users of the app to install and switch to the PWA
app. I want it to: 1. Not be too invasive and annoying. 2. On the other hand to really
encourage switching."_

ADR-0007 made the app installable in 2026-07 and said nothing about how it would ever be
offered. Nothing has offered it since: the only sentence in the product that mentions the home
screen is `t.shell.account.notifyNeedsInstall`, buried in the notification settings, and it is
there to explain a _push_ blocker rather than to invite anyone.

The two halves of the brief are normally traded against each other by picking a volume. They
are not a volume problem. **Every moment worth asking at is a fact this app already computes**,
and choosing moments instead of volume is what lets both halves be satisfied at once.

## Decision

### 1 · No new mechanism. The ask is `StatusBanner`, and it has been built once already

`ui/PushAskBanner.tsx` is exactly "ask once, at an earned moment, remember either answer, never
re-ask", and its own header says _"Not a new component"_ — it is `StatusBanner` with an action
and a dismiss, on the `.app-update` mount ADR-0181 established. The install ask is that shape
with a different verb, so it adds **no** component, no overlay, and no second policy.

Consequently the only new CSS in the whole change is the _inside_ of one `Sheet` (§4). That is
the honest size of what is being asked for.

### 2 · Two doors may speak unprompted, and each says a different fact

- **Door A — the first arrival after joining a trip.** The highest-intent moment the app has:
  someone has just committed to travelling with four other people. _"הצטרפת ליפן · אביב 2027.
  אפשר לקחת אותו איתך למסך הבית."_
- **Door B — departure within three days.** The moment installing is actually worth something,
  because offline, notifications and full screen all become true at the trip. _"הטיול מתחיל
  בעוד 3 ימים · על מסך הבית הוא עובד גם בלי רשת."_

Both are facts the app already holds. A generic _"install our app"_ is precisely the sentence
that turns this into a nag, and is rejected on those grounds rather than on taste.

### 3 · Door C — the blocked want — is the one that does the most, and it is not a prompt at all

**`PushAskBanner` returns `null` when the blocker is `NEEDS_INSTALL`.** Its reason is stated:
_"a task form is not the place to teach somebody to add a web app to their home screen."_ That
is right about the _teaching_ and wrong about the _silence_. The person has just put a deadline
on a task — they have just asked to be reminded — and on iOS the true answer is "you cannot be,
unless this is on your home screen". Today they are told nothing, which makes the single
highest-intent install moment in the product a wall.

So the same banner answers instead of declining, with a different verb. **It is not counted
against §5's budget**, because it only ever appears to someone who has just asked for the thing
it enables. It is an answer, not an approach.

### 4 · The sheet is `Sheet`, and only its inside varies by platform

Tapping the verb opens `Modal`'s `sheet` variant — `ariaLabel`, not `title`, so the app's name
is said once (the first render said it twice).

- **Chrome / Android** — the `beforeinstallprompt` event is captured and stashed, and this
  button is the entire reason to capture it: one tap, real install.
- **iOS Safari** — there is no API. The sheet **teaches**, in two numbered steps, and its button
  cannot pretend to install: it reads `הבנתי` and closes. The share glyph shown is our own
  `upload` (an arrow out of a tray, the nearest shape we own); **the words are what identify
  the menu item** — `״הוספה למסך הבית״` — exactly as the existing `notifyNeedsInstall` copy
  already does. We do not draw Apple's mark.
- **In-app browser (WhatsApp, Instagram)** — installing is impossible from here at all, so
  there is a step 0: open it in the phone's browser, with a copy-link fallback. **For an
  invite-only app this is not an edge case.** Invites travel in a chat (ADR-0030: join is
  link-only), and a chat opens links in its own webview, so this is the _common_ first open.

### 5 · The pressure budget is a number, not an intention

One `waypoint:install:asked` key holding `{ count, at }`, in the same shape as the existing
`waypoint:push:asked`. Never when installed · never on a first open · never more than once per
session · never while an overlay is open or a field is being typed in (the same
`hasOverlay()` + `isEditingField()` question `useAppUpdate` already asks before it swaps a
build) · and at least seven days between asks.

**Two asks, ever.** After that: §6 only.

**And a refusal is a snooze, not a verdict — which is where this deliberately parts from
ADR-0197 §7.** There, "no" is final because a refused notification permission is not
recoverable in-app on any platform. An install refusal is recoverable, and installing gets
_more_ worth doing as departure nears — so the first "no" is a deferral, and door B is what
earns the second ask.

### 6 · A permanent home in settings, which deletes a duplicate

A row in the existing settings family (`.set-sec-title` › `.set-card` › `.id-row`). It never
nags and never disappears; its existence is what lets everything else give up after two asks.

It also removes something: `NotificationSettings` currently explains the share-sheet gesture
itself, in a full sentence. With one install surface in the app, that sentence points at it
instead of repeating it — one fewer place teaching the same gesture (ADR-0096).

### 7 · `isInstalled()` and `isWebKit()` move to `lib/install.ts`

Both already exist, private to `lib/push.ts`, because push needed them first — including the
part everyone gets wrong (`display-mode: standalone` **and** WebKit's older
`navigator.standalone`). They are extracted, and `push.ts` imports them back. A small
extraction, not a refactor: root rule 8 is that the second consumer generalises the one-off
rather than copying it.

### 8 · Neutral, entirely

Installing is not a time fact, not a place fact and not plan mode, so it spends none of the
semantic budget (ADR-0028): `--cta` and `--muted` only. That is also what keeps it visually
quiet, which is half the brief.

## Consequences

- Measured off the mockup at 360×640: the ask is **55.7px**, 9% of the screen — against a
  full-screen interstitial's **640px**, an **11.5×** difference. The interstitial is rejected
  on that number, and because it would block the one screen the person came for.
- An iOS user who wants notifications finally gets an answer instead of silence.
- Two asks is a guess with a control, not a finding. §5's number is the one thing here that
  wants a real-usage pass rather than a mockup.
- `beforeinstallprompt` must be captured at app root from first load, or the Chrome branch has
  nothing to fire.

## Alternatives considered

- **A full-screen interstitial** — rejected: 11.5× the banner, and it covers the screen the
  visit was for.
- **Asking on `/join` before the join** — rejected: a visitor who has not joined has nothing to
  install _for_, and ADR-0143 built a deliberate three-beat there (stamp · tear · hand off)
  that a third question does not belong inside.
- **A sheet at door C instead of a banner** — rejected for the reason `PushAskBanner` already
  rejected it: a layer on top of the layer you are already in, plus a level in the back stack
  (ADR-0090).
- **One refusal is final**, as in ADR-0197 §7 — rejected: correct there because that refusal is
  irreversible, and here it would rule out the only moment (door B) when installing is clearly
  worth it.
- **Drawing Apple's share mark exactly** — rejected: a platform trademark redrawn inside a file
  whose whole promise is "this is the real CSS" is the one lie it cannot afford. The words
  carry the identification.
