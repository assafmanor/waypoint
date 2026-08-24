# 2026-08-24 — Where the app asks to be installed

**Owner ask:** _"I want to encourage visitors and users of the app to install and switch to the
PWA app. I want it to: 1. Not be too invasive and annoying. 2. On the other hand to really
encourage switching."_

**Produced:** [ADR-0204](../decisions/0204-the-install-ask-is-three-doors-and-a-permanent-home.md)
(Proposed) + [`mockups/install-is-three-doors-v1.html`](../../mockups/install-is-three-doors-v1.html).
Nothing built — this is a design session.

## What reading the code changed

The brief reads like a volume dial. It is not: the two halves are traded by choosing **moments**,
and every moment worth using is a fact the app already computes. Four things found by reading
before drawing, in ascending order of how much they changed the design.

1. **The mechanism exists.** `ui/PushAskBanner.tsx` is "ask once, at an earned moment, remember
   either answer, never re-ask", and its header says in as many words: _"Not a new component."_
   So the install ask draws no surface of its own — it is `StatusBanner` on the `.app-update`
   mount, and the only new CSS in the change is the inside of one `Sheet`.

2. **`isInstalled()` and `isWebKit()` already exist**, private to `lib/push.ts`, including the
   half everyone gets wrong (`display-mode: standalone` **and** WebKit's `navigator.standalone`).
   Rule 8's case exactly: extract to `lib/install.ts`, don't copy.

3. **The instruction is already written.** `t.shell.account.notifyNeedsInstall` already teaches
   the share-sheet gesture in Hebrew. One install surface means that sentence points at it
   instead of repeating it — the change **deletes** a duplicate rather than adding one.

4. **The highest-intent install moment in the product is a wall today.** `PushAskBanner` returns
   `null` on `NEEDS_INSTALL` — an iPhone user who has just set a deadline on a task, having just
   asked to be reminded, is told nothing. Its stated reason (_"a task form is not the place to
   teach somebody to add a web app to their home screen"_) is right about the teaching and wrong
   about the silence. This is the single change that does most for "really encourage switching"
   while being the least invasive thing in the file, because it only reaches someone who asked.

## Forks, and how they were called

Called here rather than handed back, per root `CLAUDE.md` ("a correction is not a fork"); the
one genuinely open number is at the foot.

- **Where the unprompted asks live.** Chosen: first arrival after joining a trip, and departure
  within three days. Rejected: `/join` before the join — a visitor who has not joined has nothing
  to install _for_, and ADR-0143 built a deliberate three-beat there (stamp · tear · hand off)
  that a third question does not belong inside.
- **Banner or interstitial.** Measured, not argued: 55.7px against 640px at 360×640, **11.5×**.
  The interstitial also covers the one screen the visit was for.
- **Is a refusal final?** ADR-0197 §7 says yes for push, and is right — that refusal is not
  recoverable in-app on any platform. Here it is recoverable, and installing gets _more_ worth
  doing as departure nears, so the first "no" is a snooze and door B earns the second ask. This
  is a deliberate divergence from the pattern it otherwise copies wholesale, and the ADR says so.
- **The in-app browser.** Treated as a first-class branch, not an edge: joins are link-only
  (ADR-0030), invite links travel in chat apps, and a chat webview cannot install at all. It is
  the common first open, and it is the one path nobody designs.
- **Apple's share glyph.** Not redrawn. Our `upload` (an arrow out of a tray) locates it, and the
  **words** identify it — `״הוספה למסך הבית״` — which is what the existing copy already does. A
  platform trademark redrawn inside a file whose whole promise is "this is the real CSS" is the
  one lie it cannot afford.

## Open, and it is a guess

**§5's budget: two asks, ever.** Shipped as 2, with a 1–3 control in the mockup so it can be
looked at rather than argued in prose. 1 is genuinely quiet and probably too weak; 3 starts to
read as pursuit. This is the one number that wants real usage rather than a mockup, and it is
flagged in the backlog as such.

Second, smaller: whether door C really sits **outside** the budget. The argument is that it
answers a request rather than making an approach. If that reads as a stretch, it is counted, and
the change is one number.

## Method note

The render found two things reading could not. The proposal duplicated its own title (a
`.modal-title` saying "Travelive" directly above an `.inst-head` saying "Travelive" — fixed with
`Sheet`'s `ariaLabel`, which `RosterSheet` already uses for this). And the page silently refused
to paint below the first viewport, which is the `overflow: clip` trap `pitfalls.md` already
records **twice** — walked into because that file was read after the symptom instead of before
the first render. Worth stating plainly: the pitfalls list is cheap to read up front and was not.
