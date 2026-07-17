# Session 27 — Index tab: post-build issue triage (documents + bookings)

**Date:** 2026-07-17
**Type:** investigation + design (no product code changed this session)
**Outcome:** every reported issue reproduced against the shipped code and root-caused; three Proposed ADRs (0052/0053/0054) for the consequential decisions; a fixes mockup (`mockups/index-fixes-v1.html`); backlog + INDEX + README updated.

## Why this session happened

The Index tab shipped across PRs #122–#127 (bookings CRUD, scheduling, place authoring, the booking form, and the documents section). Assaf then walked the live screen and filed a list of problems, split into **documents** and **bookings**, and asked for a full triage: findings, a call-to-action per item, mockups for what's needed, how each is fixed, and how we stop this class of gap recurring. He was AFK for the session, so this note (plus the ADRs and mockup) is the hand-back.

His report, verbatim (Hebrew), is preserved at the end of this note so nothing is paraphrased away.

## How each finding was verified

Every item below was reproduced by reading the shipped code, not inferred from the report. File:line anchors are given so the fix has a starting point. The relevant design record was re-read first (ADR-0047 linkage/notes, ADR-0048/0051 data model, ADR-0049 mode+lifecycle, ADR-0045 the glance, ADR-0011 hard/soft, ADR-0038 icons) — the router in `docs/INDEX.md`.

A note on **severity**: `P1` = broken or data-losing / a hard commitment mishandled; `P2` = capability missing that the screen implies; `P3` = polish / feedback.

---

## A. Documents

### A1 · Can't open a PDF — P1

**Reported:** "לא ניתן לפתוח PDF, נראה לי עדיף לפתוח אותו באמצעות האפליקציה המתאימה או משהו."

**What's happening:** `DocumentViewer.tsx:68-69` renders a PDF into an `<iframe>` pointed at a blob object-URL:

```tsx
) : isPdf ? (
  <iframe className="doc-viewer-frame" src={url} title={doc.title} />
```

We are **phone-primary** (ADR-0017). Mobile Safari (and in-app WebViews / the installed PWA) do **not** render a PDF inside an `<iframe src=blob:>` — they show a blank frame. The blob also isn't a real navigable file, so there's no "open in Files / a PDF app" path. So on the primary target the viewer looks broken for exactly the document type people upload most (boarding passes, insurance policies, visas are usually PDFs).

**Fix (see ADR-0052):** stop trying to embed PDFs on mobile. Treat a PDF like the "everything else" branch already does for unknown types — offer **open in a new tab** (`window.open(url)` / an `<a target="_blank" rel="noopener">`) and a **download/share** action that hands the blob to the OS ("open with the right app," as Assaf suggests). Keep the inline `<iframe>` only as a desktop-wide enhancement, gated behind a capability check, never as the sole path. Images stay inline (they work).

**CTA:** PDF must be openable on a phone. Default to open-in-new-tab + download; inline preview is a desktop nicety, not the contract.

### A2 · A document can't be edited in any way — rename / delete / replace — P1

**Reported:** "לא ניתן לערוך מסמך בשום צורה (שינוי שם, מחיקה, החלפת מסמך)."

**What's happening:** the document row is view-only. `DocumentsSection.tsx:73-86` renders each row as a button whose only action is `setViewing(d)` (open the viewer); the trailing slot is a static 🔒, not a menu:

```tsx
<button ... className="li doc" ... onClick={() => setViewing(d)}>
  ...
  <div className="right"><div className="time" aria-hidden="true">🔒</div></div>
</button>
```

The viewer itself (`DocumentViewer.tsx`) has only a close button. And it isn't only a frontend gap — the **backend has no endpoint** for it. `backend/src/documents/documents.controller.ts` exposes exactly three routes: `@Get()` (list), `@Post()` (upload), `@Get(':documentId/content')`. There is **no** `@Delete`, no `@Patch`. Compare bookings, which are complete: `bookings.controller.ts` has `@Get / @Post / @Patch / @Delete` (with `?deleteEvents`). So a wrongly-typed, misnamed, or duplicate document is permanent today.

**Fix (see ADR-0052):** add the operations at both layers.

- Backend: `@Delete(':documentId')` (removes the row **and** the encrypted blob — ADR-0015/0034), and `@Patch(':documentId')` for metadata (`title`, `type`). "Replace the file" = `@Patch` accepting a new multipart file that re-encrypts and swaps the blob, keeping the id/row (so links and the optimistic list entry survive).
- Frontend: a "⋯" menu on each document row → rename / change type / replace file / delete, plus the same actions in the viewer header. Delete of an encrypted document is irreversible → a confirm step, consistent with how a hard booking delete is guarded (ADR-0011 posture).

**CTA:** documents are a managed list (ADR-0049 §3 calls them "a section the user fills directly") — a managed list you can't rename or delete from is half a feature. Needs backend + frontend.

### A3 · No upload progress / animation — P3

**Reported:** "חסרה אנימציה בזמן שמעלה."

**What's happening:** `DocumentUploadSheet.tsx:37-49` sets a `saving` boolean that only **disables** the Save button (`:91`); the label text doesn't change and there's no spinner or bar. A document scan over a phone uplink is multi-second, so the sheet looks frozen. Note `uploadDocument` uses `fetch`+`FormData` (`api.ts:441-455`), and `fetch` can't report upload progress — a real percentage bar needs `XMLHttpRequest` (or a chunked approach).

**Fix (see ADR-0052):** at minimum a busy state — spinner in the Save button + "מעלה…" label + the sheet held open, dimmed. Better: a determinate progress bar via `XMLHttpRequest.upload.onprogress`. This pairs with A5.

**CTA:** never leave a multi-second action with no motion. Busy state is the floor; a real bar is the target.

### A4 · No error message when an upload fails — P2 (partially present)

**Reported:** "אין הודעת שגיאה אם נכשל."

**What's actually there (be precise):** an error path **does** exist — `DocumentUploadSheet.tsx:45-48` catches and fires a toast `t.docs.upload.failed` ("ההעלאה נכשלה"), and `uploadDocument` does throw on a non-OK response (`api.ts:453`). So it's not literally absent. But it is **weak** in three ways, which is likely what the report is reacting to:

1. **One generic message for every cause.** Too-large (there's a size cap — `packages/shared/src/constants.ts:100`), unsupported type, offline, and a 500 all read "ההעלאה נכשלה" with no guidance on what to do.
2. **No client-side pre-validation.** The size cap and the `image/*,application/pdf` accept filter (`DocumentUploadSheet.tsx:74`) aren't checked before the round-trip, so an oversized file fails only after a long upload — compounding A3.
3. **The list-load failure conflates error with offline.** `DocumentsSection.tsx:55` shows `t.docs.offline` ("המסמכים ייטענו כשנחזור לרשת") for **any** list fetch rejection, so a genuine server error is presented as "you're offline."

**Fix (see ADR-0052):** cause-aware messages (too large → the limit; wrong type → the accepted types; offline → the offline copy; else → a generic retry). Validate size/type on pick, before upload. Distinguish offline from error on the list. Keep the failed upload's sheet open with the values intact so the user can retry without re-entering.

**CTA:** the toast exists — the gap is that it can't tell the user _why_ or let them _pre-empt_ the failure.

### A5 · No document-loading animation in the viewer — P3

**Reported:** "חסרה גם אנימציה של טעינת מסמך."

**What's happening:** while the blob is fetched+decrypted, `DocumentViewer.tsx:64-65` shows the plain text `t.docs.viewer.loading` ("טוען…"); the list likewise shows text (`DocumentsSection.tsx:54`). No spinner/skeleton anywhere in the document flow — the app has no reusable spinner component at all (the only "progress" is Home's day rail, unrelated).

**Fix (see ADR-0052):** a small shared spinner/skeleton, used by the viewer, the list load, and the upload busy state (A3). One component, three call sites.

**CTA:** decrypt+fetch of a scan is visibly slow on a phone; it needs a motion cue, not a static word.

### A6 · Passport and Visa share an icon — P2 (design rule violation)

**Reported:** "דרכון וויזה אותו אייקון (אסור)."

**What's happening:** they're technically two different codepoints — `constants.ts:73-78` maps `passport: '🛂'`, `visa: '🛃'` — but 🛂 (passport-control) and 🛃 (customs) are the **same signage pictogram** (a standing figure) and are visually indistinguishable at the 17px badge size (`.li .badge2`), especially across platforms. So they read as "the same icon," which the design language forbids for two peer categories (distinct meaning must be distinctly encoded — ADR-0028's non-colour-redundant discipline, applied to glyphs). Also `DocumentsSection.tsx:59` **hardcodes** 🛂 for the empty-state illustration, decoupled from the map.

**Fix (see ADR-0052):** four glyphs distinct at badge size — **approved set (Assaf, 2026-07-17): passport 📕 · insurance 🛡️ · visa 🎫 · other 📄** (shown in the mockup, "נראה טוב"). The rule is "four visually distinct badges," and the empty-state illustration should read from the same constant, not a literal.

**CTA:** four document types → four unmistakable badges. Cheap fix, real confusion today.

### A7 · Uploading an _image_ document — P2

**Reported:** a bare bullet "בתמונה" ("in the image"), **clarified 2026-07-17**: "כשאמרתי בתמונה התכוונתי כשמעלים מסמך של תמונה" — the problem is when you **upload an image document** (not a PDF). The original screenshot did not reach this session, so the exact captured state is unconfirmed; the clarification pins the flow.

**What's happening (strongest hypothesis, from the code):** the image twin of A1. `DocumentUploadSheet.tsx:74` accepts `image/*`, so a phone lets you pick a camera photo — on iOS that's typically **HEIC**. `DocumentViewer.tsx:43` routes anything `mimeType.startsWith('image/')` to `<img src=blob:…>` (`:67`), and most browsers render an **HEIC blob blank** — exactly the "uploaded an image, it shows nothing" a screenshot would capture. Two lesser image-specific angles compound it: a large photo has **no upload progress** (A3), so it looks frozen mid-upload; and a portrait scan relies on EXIF orientation (browser default `image-orientation: from-image`, usually fine, worth confirming). A JPG/PNG scan itself displays correctly under `.doc-viewer-img` (`object-fit: contain`).

**Fix (see ADR-0052 §1):** the viewer's fallback is driven by _can the browser actually render this blob_ (detect `img.onerror`) rather than by MIME family — an undecodable image (HEIC) falls into the same **open-in-tab / download** path as a PDF, never a blank `<img>`. Pair with the upload progress (A3). Optional enhancement: client-side HEIC→JPEG on pick.

**CTA:** an uploaded phone photo must never render blank. Same "can the browser show it? else hand it off" rule as PDFs.

**Still worth a look:** if the screenshot showed something other than a blank/again-unsupported image (e.g. a layout/overflow or an orientation glitch on a valid JPG), re-share it and I'll pin that specific defect — but the HEIC-blank path is the most likely and is now covered.

---

## B. Bookings

### B1 · A booking has no locked detail view + "⋯" menu — tapping goes straight into edit — P2

**Reported:** 'מסמך "ננעל" אחרי יצירה ואז צריכה להיות תצוגה של הפרטים וכפתור עריכה 3 נקודות ... בצד ימין, כמו באירועים.'
(Read "מסמך" here as _the record/entry_ — the item sits under Bookings; it means the booking.)

**What's happening:** tapping a booking row in the Index opens the **editable** `BookingSheet` immediately — there is no read-only detail step and no "⋯" affordance. `Index.tsx:139` → `onOpen(booking)` → `setSheet(booking)` → `BookingSheet` (`Index.tsx:115-117`). Compare **events**, which do exactly what Assaf wants: a card expands to quick verbs, and structural edit/delete live behind a 3-dots "more" button that opens a sheet — `DayView.tsx:642-652` (the `more` button, `ICONS.more`), `:660-691` (the menu with Edit / Delete / Swap). So the two surfaces are asymmetric, and a booking backs a **hard** event, which ADR-0011 says should be _guarded on edit_ — tap-straight-to-edit is the opposite of guarded.

Worth noting: the current behavior actually matches what ADR-0049 / `trip-index-v1.html` drew ("tap a booking → the merged edit sheet"). Assaf is now asking to change that to a guarded detail-first pattern with parity to events. That's a deliberate revision, recorded in **ADR-0053** — not a deviation from spec that already existed.

**Fix (see ADR-0053):** tapping a booking opens a **read-only detail view** (all the facts: title, code, provider, place/route, hotel wifi/room, notes, and the linked event's timing) with a "⋯" menu → Edit / Delete, mirroring the event card. Edit opens the existing `BookingSheet`. Delete keeps the existing delete/unlink prompt (ADR-0047 §3).

**CTA:** bookings and events are peers; give the booking the same guarded detail-view + "⋯" pattern events already have.

### B2a · Editing a booking-linked event uses the event-only form (same-day), not the merged booking sheet — P1

**Reported:** "עריכת אירוע שמקושר להזמנה - צריך להיות אותו דבר כמו הזמנה מבחינת האפשרויות, למשל הזמנים לא מוגבלים ליום אחד … כי הזמנה יכולה להתפרס על הרבה ימים (למשל מלון)."

**What's happening — this is a real conformance bug against ADR-0047 §2.** ADR-0047 §2 mandates _one merged edit surface_ for a linked Booking+Event, reachable "from the Index or the day view." Today it's only half-built:

- From the **Index**, editing a booking uses the merged `BookingSheet` — correct.
- From the **day view / plan builder**, editing the _linked event_ opens `EventForm`, the event-only form — wrong. `DayView.tsx:40` imports only `EventForm`; `:102` `onEdit: (e) => setFormTarget(e)`; `:194-202` renders `<EventForm event=…>`. The card is even handed its booking (`:357`) but only to show the code — the booking is **not** forwarded to the edit path. `PlanDay.tsx` is identical (`:46` imports `EventForm`).
- `EventForm` is **same-day by construction**: one `date` field (`EventForm.tsx:45`) + a `TimePicker` whose scope is explicitly same-day (`TimePicker.tsx:14-16`, only the ADR-0037 overnight tail excepted). It never sets `endDate`. So editing a hotel's linked event through it **cannot** express the multi-day span — exactly Assaf's complaint. Only `BookingSheet`'s span path (`buildSpanSeed`, `booking-edit.ts:112-137`) sets `endDate`.

**Fix (see ADR-0053):** when the event being edited has a `bookingId`, route the edit to the merged `BookingSheet` (seeded from the booking + its event), not `EventForm`. `EventForm` stays for unlinked manual events. This finishes ADR-0047 §2 rather than inventing anything.

**CTA:** editing a hotel from the day view must offer the hotel's span, not a one-day form. Route linked-event edits to the merged sheet.

### B2b · A multi-day booking (hotel) is mishandled by the day-at-a-glance — P1

**Reported:** "…וזה לא צריך להיספר בלוז ב-glance לדוגמה."

**What's happening — two coupled defects:**

1. **On the check-in day it distorts the whole rail.** A hotel's linked event carries `startsAt` = check-in and `endsAt` = **check-out, days later** (`buildSpanSeed`, `booking-edit.ts:124-131` sets `endsAt` to the far instant and `endDate` to the later date). The glance window is `Math.max(day23, …endMsOf)` (`glance.ts:106`), and `endMsOf` reads `endsAt` (`glance.ts:54`). So on check-in day the window stretches _days_ into the future, the hotel block spans nearly the entire rail, and every real same-day event is crushed into a sliver. The hotel is also counted in `remaining` (`glance.ts:148-151`) — so "3 עוד" becomes "4" for a thing you don't _do_.

2. **On every other night of the stay it vanishes.** The day filters are a strict single-day match — `Home.tsx:47` `events.filter(e => e.date === activeDate)`, same in `DayView.tsx` / `PlanDay.tsx`. Nothing expands an event across its `endDate`. So a 4-night hotel appears only on the check-in day and is absent on nights 2–4 and the check-out day — the opposite failure.

The root cause under both is that a **lodging/ambient span is being modeled as an ordinary timed block**. It isn't one: you don't "do" a hotel at a point in the day; it's the backdrop the day happens inside. Assaf's instinct ("shouldn't be counted") is the correct data-model call.

**Fix (see ADR-0054):** treat an **ambient-span event** (an event with `endDate` set, i.e. lodging / a multi-day booking) as _context, not a scheduled block_:

- **Exclude it from `buildTimeTree` / the glance rail and from the `remaining` count** — so it neither distorts the window nor inflates "what's left today."
- **Render it as an ambient header/backdrop** on every day it covers (check-in … check-out), e.g. a thin "🏨 לינה · <hotel>" strip above the day, so nights 2–4 stop being blank.
- The window math then only ever sees genuine same-day blocks (+ the ADR-0037 overnight tail), so the rail is correct again.

**CTA:** a hotel is where you sleep, not an item on the day's plan. Take ambient spans out of the counted schedule and show them as backdrop across their nights.

---

## Cross-cutting: how we prevent this class of gap

The issues cluster into three recurring failure modes. Prevention is aimed at each:

1. **New list surfaces shipped without the full CRUD/affordance set.** Documents got upload+view but no delete/rename/replace; bookings got edit but no guarded detail view. _Prevention:_ a short **"managed-list parity" checklist** in `docs/engineering/conventions.md` — any new user-managed list must, before it's "done," answer: view? create? rename/edit? delete (with the right guard)? empty/loading/error states? mobile-openable content? The Index would have failed this checklist at review.

2. **A merged/shared surface built on only one of its entry points.** ADR-0047 §2 said "from the Index _or_ the day view"; only the Index path got the merged sheet. _Prevention:_ when an ADR names multiple entry points into one surface, the implementation note must enumerate each and the tests must cover each — and reviewers check the ADR's own "reachable from" list against the diff.

3. **Feedback/polish (loading, error, progress) treated as optional.** _Prevention:_ fold "busy/empty/error state present?" into the Definition of Done for any async UI, and ship the shared spinner (A5) so there's no friction to using one.

Also: the **doc drift** noticed this session — `docs/backlog.md` still described the Index tab and Documents UI as "still a `Placeholder`… only the frontend UI remains" _after_ #124–#127 shipped it (`App.tsx:314` mounts `<Index/>`). The founding principle is docs track code in the same change; the Index PRs didn't retire their backlog lines. Fixed here, and called out so the merge checklist includes "retire the backlog line your PR just built."

## Decisions that need Assaf's sign-off (Proposed ADRs)

These change or extend decided behavior, so they're **Proposed**, not Accepted — Assaf was AFK and these are his calls:

- **ADR-0052** — Document lifecycle: mobile-first viewing (open/download, no sole-path iframe), delete/rename/replace at both layers, upload+load feedback, cause-aware errors, four distinct type icons. _(A1–A6)_
- **ADR-0053** — Index bookings get a guarded detail view + "⋯" menu (parity with events), and the merged edit surface (ADR-0047 §2) becomes reachable from the linked event, not just the Index. _(B1, B2a)_
- **ADR-0054** — Ambient-span events (lodging / multi-day bookings) are backdrop, not counted schedule blocks: excluded from the glance count+rail, rendered across their whole span. _(B2b)_

## Deliverables in this session

- This note (the triage of record).
- ADR-0052 / 0053 / 0054 (Proposed) + their INDEX/README rows.
- `mockups/index-fixes-v1.html` — the corrected document + booking screens and the ambient-hotel glance, in the shipped design system.
- `docs/backlog.md` — stale Index/Documents "Placeholder" lines retired; the concrete fix items added.

## Not done (deliberately)

No product code changed. This is the design/triage pass Assaf asked for; the implementation is the next PR(s) once he signs off the three ADRs (or amends them).

---

## Appendix — the report, verbatim

> מספר בעיות לאחר הכנסת מסך האינדקס:
>
> **מסמכים:**
>
> - לא ניתן לפתוח pdf, נראה לי עדיף לפתוח אותו באמצעות האפליקציה המתאימה או משהו
> - לא ניתן לערוך מסמך בשום צורה (שינוי שם, מחיקה, החלפת מסמך)
> - חסרה אנימציה בזמן שמעלה
> - אין הודעת שגיאה אם נכשל
> - דרכון וויזה אותו אייקון (אסור)
> - חסרה גם אנימציה של טעינת מסמך
> - בתמונה
>
> **הזמנות:**
>
> - מסמך "ננעל" אחרי יצירה ואז צריכה להיות תצוגה של הפרטים וכפתור עריכה 3 נקודות ... בצד ימין, כמו באירועים.
> - עריכת אירוע שמקושר להזמנה - צריך להיות אותו דבר כמו הזמנה מבחינת האפשרויות, למשל הזמנים לא מוגבלים ליום אחד, באופן כללי התנהגות שונה כי הזמנה יכולה להתפרס על הרבה ימים (למשל מלון). וזה לא צריך להיספר בלוז ב glance לדוגמא
