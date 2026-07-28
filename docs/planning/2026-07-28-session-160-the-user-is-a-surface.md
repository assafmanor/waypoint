# Session 160 — the user is a surface: the design session, and what rendering it changed

**Date:** 2026-07-28
**Branch:** `claude/user-settings-page-design-r3ndi4`
**Paper + a mockup** — no feature code. Delivers [ADR-0132](../decisions/0132-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) and `mockups/user-settings-v1.html`, which is Phase 0 of the epic scoped in [session 159](2026-07-28-session-159-user-settings-and-member-info-scope-and-phasing.md).

Session 159 cut three requests into a design session plus four build slices and listed what Phase 0
had to settle. This is that session. The ADR carries the decisions; this note carries **what the
session learned that the ADR could not have been written from**, because two of the three findings
came from rendering the mockup rather than from reading the code.

## The correction that shaped the whole session

The first pass at the mockup **hand-drew the trip chrome** — hand-copied token values, a rounded filled
square for the settings control, and a `⚙` emoji inside it. The owner caught it immediately ("some of the
elements that you showed are outdated, for example the settings button").

Every part of that was avoidable, and the repo already said so twice:

- `Icon.tsx:37` carries the comment "Cog outline + centre circle (**replaces the lone ⚙ emoji-as-control,
  U-11**)" — the emoji had been explicitly retired, and `design-language.md`'s "emoji are content, icons
  are UI" is the rule it was retired under.
- `mockups/tools/inline-app-css.mjs` exists **for this exact failure**, and its header says so: "a mockup
  that hand-copies the token values drifts from the app the day either one changes — which is how
  `map-embedded-v1.html`'s first pass ended up drawing a filled amber pill for a tag the app renders as
  amber-deep TEXT."

So the mockup was rebuilt on an `APP-CSS` manifest (`styles/tokens.css, App.css, screens.css`), and every
shipped element in it — `.header.mode-chrome`, `.trip-row`, `.avatars`/`.av`/`.account-btn`, the **ghost**
`.gear-btn`, `.new-head`, `.set-card`/`.set-member`/`.role`, `.sheet-*`, `.set-body` — is now the real
rule rather than an approximation of it. Only the genuinely new parts (the ramp tokens, the `Avatar` size
ramp, the picker rows, the roster row) live in the file's own `<style>` block, marked as such.

**The lesson generalises past this file:** the drift was not only in the colours the tool was written to
protect. Hand-drawing also invented a **filled** control where the app ships a borderless ghost, and
missed that `.avatars` already solves the RTL overlap with `flex-direction: row-reverse` — a stacking
problem the first pass "fixed" with a z-index scheme the app does not need. Reaching for the real CSS is
cheaper than re-deriving the shell, and it is the only version that stays true.

## What rendering it found that reading could not

The mockup was rendered headless (Chromium, four views) and looked at. Three findings, in ascending
order of how much they mattered:

1. **A sixth ramp hue had to go.** `--id-stone` `#A9A29A` was drawn as the ramp's near-zero-chroma
   neutral and, beside the other five, read as a **disabled control** rather than a chosen colour — a
   member assigned it would look deactivated. Cut. A palette in which one option looks broken is worse
   than a smaller palette, and five hues covers the five-person trip the product is built for. This is
   the ADR-0125 lesson repeating: the constraints were all satisfied and the value was still wrong.
2. **`+N` renders as `N+`.** `App.tsx:266` emits `+{overflowMembers.length}` as bare text in the RTL
   chrome, so the sign drifts to the far side of the digits. This is precisely the bug class ADR-0118
   exists for — the frontend `CLAUDE.md` documents it for `−3` — shipped, on the element Phase 3 turns
   into a control.
3. **`.role.owner` spends amber on a role.** `screens.css:2218` gives the admin badge
   `rgba(233,166,60,.16)` on `--amber-deep`. Amber is time and commitment only (ADR-0028 / root rule 4);
   a role is neither. Wrong since trip settings shipped, and it becomes **this** epic's problem only
   because §9 decided the roster shares that row — leaving it would spend amber on identity across a
   second surface.

Both defects are now ADR-0132 §10 and are Phase 3's to fix. Neither was invented scope: they are the
price of the "share the row rendering" decision, paid once.

## The finding that reframed the ADR, and it came from the code

Worth separating from the render, because it is the single strongest argument in the epic and it was
sitting in the schema the whole time: **`avatarColor String @default("#E9A63C")`, and
`auth.service.ts:78` never sets it on create.** So every real user has the same avatar colour — the field
that exists to tell members apart tells them apart not at all. Only `fixtures.ts` is varied, which is
exactly why no screenshot ever showed it and why nobody reported it.

And that default is `--amber`. `design-language.md:62`'s decorative-palette rule already said avatar
colours are "always pastel/muted, never amber or teal" — so the session's job on colour was never to
invent a rule. It was to notice the rule existed, that the code violated it, and that what the doc was
actually missing was the **ramp**: it named the five `--cat-*` pin hues and left identity's unnamed,
which is how eight call sites came to invent values, two of them byte-identical to `--cat-transit` and
`--cat-lodging`. The doc now names both ramps, plus the two rules that govern the identity one (chroma
rather than hue angle; one dark ink across all hues in both themes).

## What Phase 1 inherits, and one thing it must not re-litigate

Phase 1 is the identity foundation and nothing else: `ui/primitives/Avatar` over the ~8 existing copies,
the `User` fields + migration, `picture` captured at sign-in, `PATCH /me` (which does not exist — there
is only `@Get('me')`), and the death of the amber column default.

The thing not to re-open there: **a rename is deliberately not broadcast in v1** (§8). It looks like a
one-line addition to the change registry and it is not — a `Change` is per-trip while a user spans many,
so one rename fans out to one change per trip they belong to, plus a memory-channel and a `CACHE_CHANNELS`
entry (ADR-0094). It is recorded as a stated limitation with a backlog line rather than left to be
discovered as a bug.

## Still open, honestly

The ramp has been seen **headless, in light mode, on a desktop-rendered phone frame**. It has not been
seen on a device, at `xs` size in the chrome (where `plum` and `rose` sit closest), or in dark mode — the
remap values are unwritten and `tokens.css` needs the five tokens in **both** theme blocks. Backlogged as
its own line rather than folded into Phase 1, because it is a judgement call on a real screen, not a
build step.

## Owner revisions, same session (2026-07-28)

Three corrections after reviewing the mockup, all now in the ADR:

1. **The roster row drops the joined date** ("a little too much"). It is not deleted — it moves to where
   detail belongs.
2. **A row is tappable: you open a member to see their details.** Which forced the better structural
   answer — the member surface is **`MemberSheet` generalized** (`TripSettings.tsx:640`), not a second
   member sheet beside it. That also corrected a line in my own first draft: I had written that two
   surfaces "would mean two gates", and that was wrong — the gate is one and it is server-side
   (ADR-0039 enforces it in the service), so two entry points to one component are not two gates. The
   real constraint is one member **component**, with the admin verbs gated by role rather than by which
   surface you came from. Email stays off it: joining is by link, so co-members may never have exchanged
   addresses, and nothing in a trip needs one.
3. **The picture page becomes two states rather than three peers.** My draft listed Google-photo, upload
   and the ramp side by side and made the tap imply the source. That offered a colour choice with **no
   visible effect** while a photo was in use, and made one tap do two things. Now: a photo in use → the
   photo plus remove, **no ramp**; no photo → initials, the ramp, and the way back. The ramp is
   **revealed exactly when the colour is what gets drawn**, and "I don't want a photo" is its own act
   before the hue is a choice. `avatarChoice` is unchanged — the page stopped exposing the enum and
   started showing its effect.

**Rendering the revision caught three more things**, which is the pattern of this whole session:
the trip chrome behind the member sheet was **collapsed to 172px** (the app's `.app { margin-inline: auto }`
suppresses flex stretch, so the frame needed its width stated — a mockup-frame bug, not an app one); the
roster footer still claimed removal lived only in trip settings, **contradicting** the member sheet that
now carries it; and I had left design rationale sitting **on the screen** as a note inside the sheet,
which belongs in the notes panel.
