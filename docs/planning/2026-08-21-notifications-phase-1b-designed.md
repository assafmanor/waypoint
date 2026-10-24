# 2026-08-21 — Notifications phase 1b: the surface drawn, and what the render changed

**Designed, not built.** Phase 1b is the notifications epic's one design phase, and the deliverable is [`mockups/notifications-in-settings-v1.html`](../../mockups/notifications-in-settings-v1.html) plus the two ADR amendments it promotes: [ADR-0197 §7.1](../decisions/0197-a-notification-is-a-derived-obligation-and-the-sweep-is-its-clock.md) (the surface) and [ADR-0198 §6](../decisions/0198-we-notify-what-you-can-still-miss.md) (two switches, arriving with the kind they gate).

Six sections, all seven states, both themes, two widths, every number in the file read off its own DOM.

## What the code decided before any drawing started

Five reads, and two of them reversed what this file was going to draw.

**The app has no boolean control.** `grep -r 'role="switch"' frontend/src` returns nothing; every `aria-checked` in the tree is `ChoiceGrid`'s radiogroup. So the four booleans this surface needs — the master plus three categories — have no primitive to reuse, which makes §3 a rule-8 question before it is a taste question. It also makes this the moment a `Switch` is _earned_: four call sites arrive at once, which is the difference between infrastructure and speculation.

**`ListRow` is the wrong primitive for the device list, and the right one is on the same screen.** `ListRow` requires `onOpen` — "opens the row's primary target (a detail view / viewer)" — and a registered device has no detail view. The map-storage rows six lines up `UserSettings.tsx` are `.id-row` + `.lab`/`.val` + `.set-edit`: a list of device-scoped things with a remove verb. Same job.

**The second door needs no new infrastructure.** `StatusBanner` already takes an `action` and an `onDismiss`, and its own header records why (ADR-0181: _"a status the user can act on needs the verb inside the banner — a second component beside it would be the seventh one-off ADR-0078 collected"_).

**Every category switch is inert today.** Phase 3 shipped with `NOTIFICATION_KINDS` empty on purpose. `notifyTasks` gates phase A (phase 4), `notifyObligations` phase B (phase 5), `notifyGroup` a phase ADR-0198 "leans against building at all". This screen has already ruled on that once: ADR-0133 §7 rejected a theme toggle for exactly this reason and let it back in only when the remap made it real.

**The iOS instruction gets no glyph.** `Icon`'s `share` is three connected nodes; iOS draws a square with an up arrow. Pointing at ours next to the words "the Share menu" would be a lie in the one place a file that inlines real CSS promises truth.

## What only the render found

### `.set-note` already exists, and is already the right component

The first draft wrote its own `.set-note` for the blocked states' sentence. The shipped rule is `display: flex; align-items: center`, so the `<b>` inside the iOS instruction became a **second flex item** and the paragraph rendered as two ragged columns with the bold run floating between them.

The collision is the finding. `screens.css` has carried `.set-note` — icon + one line, tinted ground, top border, inside a `.set-card` — with exactly **one** call site: `TripSettings`'s _"you don't have permission to change this"_, `lock` glyph included. Which is precisely "a statement inside the card saying why there is no control". So §2 generalises that one-off from a line to a paragraph — `align-items: flex-start`, `line-height: 1.6`, identical for the existing single-line site — instead of adding a second note beside it.

This is rule 8 failing at the drawing stage, in the exact shape `pitfalls.md` describes ("the obvious word is usually taken"), caught by looking at a page.

### The device row cannot be one line

Drawn as one `.id-row`: name · `המכשיר הזה` · last-sent · הסרה. At 360px it ellipsised **the name** — `iPhone 15…` — on the one row a person is there to recognise.

| shape     | label width | row height |
| --------- | ----------- | ---------- |
| one line  | **116px**   | 52px       |
| two lines | **296px**   | 61px       |

180px of label for 9px of height. Same "where does a wide value go" trade the app already answers two opposite ways — `.transition-row` puts the value at the trailing edge, `.wp-event-face` puts it under the title — which ADR-0171 measured at 8px and `an-edge-can-be-a-window-v1` at 45px. Here it is the whole label. And it only appears once the names are the ones a real `userAgent` produces: a list drawn with `Mac · Chrome` fits by luck.

## The measured arguments

**§3 — the boolean.** Same four booleans, same section, three candidates plus one:

| candidate                          | section height | vs. the switch                     |
| ---------------------------------- | -------------- | ---------------------------------- |
| ב · `Switch`                       | **293px**      | —                                  |
| א · `ChoiceGrid` ×4                | 373px          | +80px                              |
| ג · `.set-edit` verb, as shipped   | 284px          | −9px, **and 25px of touch target** |
| ג · with ADR-0017's floor honoured | 341px          | **+48px**                          |

The fourth row is the one that settles it: **ג was only cheaper by being illegal.** A frame had to be drawn for it, because "the verb is smaller" was true and misleading.

**§5 — the second door.** The sheet-after-the-sheet measures 169px against the banner's 55.7px — ×3 — and adds a back-stack layer. A banner on "the screen after" is unreachable from `HostTasks` and `TripHomeTaskBand`, which also set deadlines. Inside `TaskSheet`, under the deadline field, is one host, zero new layers, and the moment the want was expressed.

**§1 — the section's cost.** 235px at 360px, heading and both hints included.

## The decisions worth carrying forward

- **Where a blocker cannot be cleared, there is no control** — not a disabled one. A disabled toggle invites a tap and answers nothing, and on iOS it is worst of all, because there the user genuinely can fix it. Same rule as `ErrorState`'s _"the retry button only renders when the caller can actually recover"_, reaching a settings row.
- **No server keypair means no section**, not a row apologising. It is a property of the deployment.
- **The switch's on state is `--cta`/`--cta-text`.** The colour budget (ADR-0028) has no member for "this setting is on", and the neutral primary is exactly the thing that means "yes". It inverts between themes because `--cta` is `--ink` and re-maps — the same inversion every primary button on this screen already does.
- **A hairline, not the iOS knob-shadow.** `box-shadow: 0 1px 3px rgba(0,0,0,.28)` is invisible on a dark track; a `--line` hairline reads in both themes by construction.
- **`userAgent` is a hint, not an identity.** 120 Latin characters, and it lies — Chrome on iOS reports Safari. Derived to a short label; the recognition is carried by the `המכשיר הזה` mark, so the label only has to distinguish the _others_.
- **The device list renders only when a device other than this one exists.** A one-row list under the switch you just flipped is the same fact twice, and its heading promises a list.
- **Hebrew quotes are `״…״`** (U+05F4), which is what `he.ts` already uses (`נתב״ג`, `ק״מ`, `מ״${name}״`) — the straight `"` the first draft used is not this app's convention.

## The build order, which is §6 and is the fork for the owner

Phase 1b as scoped would ship three switches that control nothing. The recommendation splits it:

- **The device card ships when built** — permission, subscription, the device list. Subscribing is a real action with an effect provable by `POST /notifications/test`.
- **The preferences card ships with the kind it gates** — `notifyTasks` with phase 4, `notifyObligations` with phase 5.
- **`notifyGroup` is not drawn at all** until phase D is decided, and ADR-0198 leans against building D. A preference for a feature that may never arrive is a promise, not a control.

Which in practice means **1b and phase 4 land together**, and `PushDebugPanel` stays the instrument until they do — which is exactly what it was built for ("it sits where phase 1b's designed row will land, so that becomes a swap rather than a move").

## Found on the way, and it belongs to another change

`.set-edit` renders at **25px** at its existing call sites — the map-storage delete buttons on this very screen — under ADR-0017's 44px floor. Same class as the `.set-tz-trigger` 40px defect `currency-becomes-a-feature-v1` found and `.set-pick-trigger` fixed, and the same argument applies: the device list gives it more call sites, so a second consumer is the moment to fix it rather than file it. Not fixed here, because this change draws and does not build.

## What is still open

- **The switch's off-state contrast in dark mode** rests on `--line` alone. It reads, and it owes the device pass ADR-0198 §7 already requires for the lock screen.
- **`GET /notifications/subscriptions`** does not exist. The device list needs it, and it lands with the build.
- **The `userAgent` → label derivation** is drawn, not written. It belongs in `packages/shared` next to nothing else like it, so it is a small new module rather than an extension.
