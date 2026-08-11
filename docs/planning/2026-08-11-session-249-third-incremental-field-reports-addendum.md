# Session 249 — seven more field reports reconciled (`#35`–`#41`), five of them reopenings

**Date:** 2026-08-11
**Paper only** — no feature code, no tests, no ADRs, no mockups, no schema changes. This session's entire output is this note plus the corresponding edits in `backlog.md`.

## 0. What this is, and the one thing that shapes all of it

The owner sent a third incremental handoff (`travelive-field-issues-third-incremental-handoff-2026-08-11.md`, not checked into the repo) after the 2026-08-07 triage (session 216, `#1`–`#21`), the 2026-08-08 addendum (session 224, `#22`–`#26`) and the 2026-08-10 addendum (session 242, `#27`–`#34`). It carries seven reports, **five of which say a problem still happens after work that is marked done**. The handoff's governing rule — a live owner report outranks a "done" status — is accepted here without argument: every one of the five is reopened below, with its earlier implementation linked rather than erased.

**Baseline:** reconciled against `edc68e5` (`fix(enrichment): a name that says more has not disagreed (#571)`), which was `origin/main` throughout. Every file, line and constant cited below was read on that tree in this session, not carried over from an earlier note.

**And this is the thing to read first.** Six of the seven pull against workstreams that shipped **on this same calendar day**:

| shipped today                                             | PR         | workstream | reports  |
| --------------------------------------------------------- | ---------- | ---------- | -------- |
| derived title/icon follows its source                     | #565       | P          | #30, #31 |
| a peer's change repaints the open screen                  | #566       | Q          | #32      |
| a fresh upload becomes readable                           | #567       | R          | #33      |
| explanatory copy goes                                     | #568       | L          | #27      |
| recover from a blank base map                             | #569       | M          | #28      |
| fold the non-accent Latin letters / a name that says more | #570, #571 | N          | #29      |

Nobody in this session can establish which build the owner's phone was running when each observation was made, and ADR-0181 (`#553`) makes a swapped build **the user's reload**, so a device can legitimately be several builds behind. That does not soften any report — #35 in particular reads as a description of the **new** surface #569 shipped (§2) — but it does mean the first action in each reopened workstream is to pin the build under test and, for `N`, the state of the negative cache. Otherwise "still" is unfalsifiable.

**Stable IDs:** the seven are `#35`–`#41`. `#34` is confirmed the highest ID previously in use (`grep` over `backlog.md` and all three prior triage notes returns no `#35`–`#41`); the one `#35`-shaped hit in `backlog.md` is a Map-panel-epic internal number, which session 216 already flagged as a separate sequence.

## 1. Reconciliation table

| ID  | Field report                                                   | Current reconciliation                                                                                                                                                                                                      | Route                                                                         | Workstream       |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| #35 | Map still fails; an error is shown and Retry does not help     | Reopens **#28**. The error + retry the report describes is almost certainly `#569`'s own new surface — so detection fires and recovery does not. Two readings, one of them a **false positive** on an unmeasured 10s bound. | Measure the bound, then diagnose the failed layer; real device                | **M** (reopened) |
| #36 | Larger Android font clips the date field and shows `12.9.2026` | In-trip fields already ask for the named face — so a numeric read is the **native input showing through** (`:focus-within`), and the clip has its own `min-inline-size: 0` mechanism. One joint explanation, unconfirmed.   | Direct `DateField` fix + device pass at real text scales                      | **S** (new)      |
| #37 | An empty Event title should resolve from its Place             | Refines **#30**, shipped hours earlier as `#565`. `BookingSheet` **already implements the owner's precedence**; `EventForm` copies the derived name into the field and latches on delete.                                   | Refine the derived-title work; make Event match Booking's precedence          | **P** (reopened) |
| #38 | Android date-picker Clear crashes the app                      | New, and **the crash mechanism is code-confirmed end to end**: an empty date reaches `zonedIso` in a render path, throws `RangeError`, and there is no error boundary anywhere in the frontend.                             | Defensive fix at the `DateField` boundary + rollback semantics                | **S** (new)      |
| #39 | Day ↔ Map loses the selected date; Index should show no day    | New, and **exactly located**: `tabTarget()` drops `?day=` on a tab tap while `map-scope-state` appends it. Index already does not date-filter; only the shared header strip paints a selection.                             | Direct navigation-state fix, reusing `DayStrip`'s existing suppression        | **T** (new)      |
| #40 | Updates still do not appear; Map → Maybe shelf is the witness  | Reopens **#32**, but the witness is **probably not reactivity**: the optimistic dispatch is synchronous, the target screen remounts, and the shelf pool is **capped at five**.                                              | Rule out grouping/cap first; keep the remote arm's unclosed second cause      | **Q** (reopened) |
| #41 | Enrichment still misses `Brúarfoss` and `מפלי גולפוס`          | Reopens **#29**. Two materially different witnesses, neither addressed by today's two fixes — and the **30-day miss TTL** means the pipe may not have re-attempted at all.                                                  | Clear the cache, then route-level evidence per witness; multilingual fixtures | **N** (reopened) |

## 2. #35 — the Map shows an error and Retry does not recover it

> Still cannot load the map: an error is shown and the Reload/Retry button does not help. Sometimes there is a map and sometimes there is not.

**Reconciliation with #28, and the strongest single observation in this intake.** Before `#569` (session 247, this morning) the Map had **no error surface at all** — the report was a blank canvas with the app's pins still drawn and no way out but a restart. `#569` added exactly one: `MapPane.tsx:445-446` swaps the canvas for `ErrorState size="pane"` titled `t.map.loadError` (`לא הצלחנו לטעון את המפה`, `i18n/he.ts:126`) with a retry that bumps a `key` on `<APIProvider>` (`:402`, `:448`). **So the error and the retry button the owner is describing are, on the strongest reading, that fix's own surface.** #28's fix therefore did what it claimed — a failed map now says so and offers a way out — and #35 is the next question: why the way out does not work.

That reading is not proof, and it is cheap to falsify: the exact Hebrew string on screen distinguishes `t.map.loadError` from the trip-level `ErrorState`, from an offline list-only render, and from a browser page error. Get it before anything else.

**Two readings of "Retry does not help", and they need opposite fixes.**

- **A genuinely persistent failure.** Retry remounts the whole `APIProvider` subtree and constructs a _fresh_ `google.maps.Map`, so anything cured by new per-instance state is already cured. If it still fails, the cause outlives the instance: script/auth/referrer, a device GPU or WebGL state, a service-worker-cached bad asset, or a network that is down for tiles specifically.
- **A false positive on an unmeasured bound.** The second failure signal is a heuristic — `onTilesLoaded` not firing within `MAP_LOAD_TIMEOUT_MS.TILES` (`constants.ts:181-183`, 10s), and `constants.ts:177-180` says in as many words that the number is **unmeasured and owed a device pass**. On a slow phone or a slow network a first paint that merely takes longer than 10s is reported as a failure; retry restarts the same slow load and fails the same way 10s later. **"Sometimes there is a map and sometimes there is not" is the shape of a threshold, not the shape of a hard failure**, which is why this reading has to be excluded before anything is redesigned.

The second reading also has a cost the first does not: every tap of retry constructs another **billed** `google.maps.Map` (ADR-0121 §4). A misfiring bound is a spend defect as well as a UX one.

**What the routed session must do.** Use the instrument that already exists — `DevMapProbe`/`DevMapTuner`'s `diag` tab (ADR-0146, extended by `#569`), which publishes `apiStatus`/`apiError`/`tilesLoaded`/`webglContextLost`/`online` from the production handlers themselves. Capture, on an affected device: which of the two signals fired, how long the tiles phase actually takes when it _succeeds_ on that device and network, whether a retry changes any published signal, device/Android/WebView version, online state, and Map ID/style. Then: measure the bound before defending it; make retry restart the layer that actually failed; keep the place list as the fallback it already is; never auto-retry into a remount loop; and end every failed attempt in a stable, actionable state. A test that mocks a successful load closes nothing here — the failure path and a physical device are the evidence.

## 3. #36 — the date field clips and reads numeric at a larger system font

> On devices with a larger font, the date field is cut off. The date format also changes: `שבת, 12 בספטמבר` becomes `12.9.2026`.

**Owner-decided:** the closed in-app field always shows the Hebrew long form, at any system text scale, without clipping. The OS picker's own surface keeps its native presentation. Do **not** answer this by shrinking text, disabling scaling, ellipsis, or accepting the numeric fallback.

**Screenshot evidence, transcribed** (`1000225390.jpg`, Samsung Android, enlarged text; the binary is not committed): the date control is too narrow for its rendered value; the value is visibly clipped at the field edge; the value reads numeric (`12.09.2026`-style) rather than the Hebrew long form; and the adjacent time controls occupy the same horizontal band, so the answer has to reflow rather than hide overflow.

**What the tree says, and it points somewhere the report does not.** ADR-0176's `DateField` paints the value itself precisely because `<input type="date">` renders by the platform's convention: the face draws `formatDayDate`/`formatDayMonthYear` and the native input lies over the box, transparent at rest (`DateField.tsx:63-89`, `date-field.css:30-48`). In-trip forms already ask for the named face — `WhenField.tsx:123-131` and `:307-312` both pass `format="named"` — so **`12.9.2026` is not our named formatter mis-rendering; it is a different string entirely.** Only two code paths can put a numeric date in that box:

1. a `numeric`-face host — but those are trip creation and trip settings (`CreateTrip.tsx:292/306`, `TripSettings.tsx:602/609`), not the Event form in the screenshot; or
2. **the native input showing through.** `date-field.css:63-68`: `.df:focus-within` makes the input opaque and hides the face. After a picker interaction the input keeps focus, so what is on screen is the platform's own formatting of the same date — which is exactly the thing ADR-0176 exists to hide, leaking back in the one state where the face steps aside.

Reading (2) also explains the clip, and the two symptoms then have **one** cause rather than two. `.vt` (`value-token.css:24`) and `.df` (`date-field.css:14`) both declare `min-inline-size: 0`, so the token is a flex child of `.wf-line` (`when-field.css:34`, `flex-wrap: wrap`) that can be squeezed **below its content width instead of forcing a wrap**. The face would wrap when squeezed; a native input's single-line text clips. A larger type scale is what makes the line too tight in the first place, so the owner's "with a larger font" is real and is the trigger, not the mechanism.

**Unconfirmed, and cheap to confirm:** focus the field on a device and read what the box says. If it says `12.09.2026` while focused and `שבת, 12 בספטמבר` when focus leaves, this is settled in one look.

**Acceptance evidence** (owner's, kept intact): default and enlarged Android system fonts both render the whole Hebrew long date; the value does not change after opening, clearing, cancelling, selecting, saving or reopening; the RTL line reflows without overlapping the time controls or stranding a tap target; no timezone/day shift is introduced while formatting; New Event, edit Event and every shared host of the same primitive are checked; and a real Android pass at representative text scales is included. Prefer one shared app-controlled answer over per-screen width patches — there is one primitive here already, and it is the right place.

## 4. #37 — an empty explicit title resolves from the Place

> Completing an Event name from its location should be fully automatic and replace the textbox placeholder. Do not fill/copy the text just to create a title; choose the Place name whenever the explicit title is empty, so deleting a title does not leave the Event without a name. Bookings may already behave this way.

**Owner semantics, refining #30's latch wording into a precedence:** (1) a nonblank explicit title, (2) the selected Place name, (3) otherwise no meaningful title and the existing refusal stands. Changing the Place while explicit text is blank changes the effective title; typing overrides; **deleting hands control back**; whitespace counts as blank; route/transport titles keep their own endpoint-derived semantics.

**"Bookings may already behave this way" is correct, and it is the answer to the parity question.** `BookingSheet.tsx:479-490` computes `finalTitle` as `title.value.trim() || placeName || typeLabel` and `:1007` renders the derived name as the **placeholder** (`placeholder={placeTitle() || t.index.sheet.titlePlaceholder}`) while the input itself stays empty. That _is_ the owner's precedence, already shipped (field report #9). The extra type-label fallback is ADR-0163's and is not in scope to change.

**Where `EventForm` diverges after `#565`.** The shipped build is closer than the backlog line suggests — `:203-230` deliberately answers derived-vs-chosen as a **value test, not a stored flag** (`initialTitleTouched = initialTitle.trim() !== '' && initialTitle.trim() !== derivedTitle`), following `chosenIcon`'s precedent, and that reasoning stands and should be preserved. Three concrete gaps remain against the new semantics:

- **The derived name is copied into the field.** `:367` does `title.redrive(placeDerivedTitle(places, next) ?? '')`, so the Place name becomes the input's own value and `:522` persists it as `Event.title`. The owner asks for it as the **effective** title while explicit text is blank, not as text written into the box.
- **Deleting the title is a dead end, and this is the sharp one.** `useDerivedField.set` (`lib/useDerivedField.ts:64-67`) sets `touched` on _any_ keystroke, so clearing the box leaves `touched: true` with an empty value; `:495` then refuses the save with `titleRequired` and no Place fallback can return while the form is open. That is the owner's complaint verbatim. (A reopen recovers, because the value test re-derives — but only after a save that cannot happen.)
- **The placeholder is generic** (`:686`, `t.eventForm.titlePlaceholder`) where the owner wants the selected Place name, which Booking already does.

**Route.** Refine, don't rebuild: keep the value-test provenance, move Event onto Booking's precedence shape, and make it one shared rule rather than a third algorithm — the visible value, the placeholder and the saved value must not be able to disagree. Owner's acceptance list carried intact: blank title + Place saves as the Place name; changing the Place while blank changes the effective title; a manual title survives Place changes, Map errand round-trips, save and reopen; deleting it restores derivation with no missing-name failure; whitespace is blank; removing the Place while blank restores the refusal; no generated name is persisted as proof of an override; and every consumer (cards, timeline, Map/list, readiness) reads the same effective title.

## 5. #38 — Android's date-picker Clear crashes the app

> Pressing Clear in Android's date picker crashes the app.

**Owner-decided:** Clear is **cancellation** for this required field — it restores the date that was showing when the picker opened (for an edit, the value before that interaction; for a new form, the form's current/default date). It must not commit `null`, `''` or an invalid date. Do not merely hide the native Clear control; handle the empty signal defensively at the app boundary.

**The crash mechanism is confirmed in code, end to end, and it is a render-path throw:**

1. `DateField.tsx:87` forwards whatever the platform gives: `onChange(e.target.value)` — `''` when cleared.
2. `WhenField.tsx:130-132` passes it straight through: `onChange({ date: next, start, end })` → `EventForm.tsx:698` `setDate('')`.
3. On the next render, `EventForm.tsx:393` computes `const tz = override ?? derivedZone(date, start, …)` **unconditionally** → `authoringZone` (`lib/places.ts:484-499`) → `zonedIso('', '12:00', zone)` (`lib/time.ts:522-530`) → `new Date('T12:00:00Z')`, an Invalid Date.
4. Verified in this session's runtime: both `.toISOString()` and `Intl.DateTimeFormat.format()` on that value throw `RangeError: Invalid time value`.
5. `grep` finds **no error boundary anywhere in `frontend/src`**. A throw during render therefore unmounts the tree — the app goes blank. That is the reported crash.

**Two things that narrow the fix.** `BookingSheet.tsx:525` guards the same call (`day && time ? Date.parse(zonedIso(day, time, zone)) : null`), so the booking legs do not take this path — the exposure is the Event form's zone derivation, which runs on every render with no guard. And `TimeField` already has an `onClear` prop (`WhenField.tsx:319`), so "a clear is a signal the app handles, not a value it forwards" is a shape this codebase already has (rule 8).

**Route.** Direct defensive fix; no design session. Note the ordering: this is a **crash** first and a rollback-semantics question second — the shared date/zone helpers should never receive an unparseable value from this interaction regardless of what the rollback decides. Owner's acceptance evidence carried intact: Clear never throws, unmounts, or loses unrelated draft fields; the pre-picker date is restored visually and in form state; a save after Clear uses it; Clear after tentatively moving to another date still rolls back; select/confirm still commits; cancel/back and Clear do not double-fire; add and edit are both covered, automatically and on a physical Android device or installed PWA.

## 6. #39 — one remembered day across Day-by-day and Map, none on Index

> Switching from Day-by-day to Map and back does not preserve the selected date. On Index, the day row has no meaning, so no day should be selected.

**Owner-decided invariant:** a _remembered itinerary day_ (the last day chosen in Day-by-day or Map) is distinct from an _active day for the current view_ (present on Day/Map, absent on Index). Day ↔ Map preserves it in both directions; Index shows no selected day and is not date-filtered; the remembered day survives a visit to Index and is restored on return.

**Located exactly, in two halves.**

- **The loss is one function.** `nav-state.tsx:254-257`'s `tabTarget(next)` returns `/?tab=map` — **no `day` param** — and `useTripTab.goToTab` (`:847`) navigates to precisely that. `activeDate` derives from `?day=` alone (`trip-state.tsx:852-857`), so a tab tap resolves the day back to today. Meanwhile `map-scope-state.tsx:268/300/325` appends `&day=${day}` when _it_ navigates to the Map. So entering the Map by choosing a day keeps the day and entering it from the tab bar does not — an asymmetry, not a missing feature.
- **Index is already right semantically, and wrong visually.** `screens/Index.tsx` never reads `activeDate` and does not date-filter anything (it consumes the trip-wide collections from `useTrip()`); what paints a selected pill on Index is the shared header in `App.tsx:439-449`, which renders `DayStrip selected={activeDate}` on every tab. So the fix is display state, not a filtering change — worth knowing before anyone goes looking for a filter to remove.

**Two things the routed session must respect.** ADR-0035 §4's single-source day is load-bearing: `?day=` is the only copy, and `trip-state.tsx:785-790` records that a second copy in React state is exactly what used to fight itself. A "remembered day" must therefore stay the URL param — the question is which transitions carry it, not where to store it. And the "no selection" mechanism already exists: `DayStrip`'s `allScope` prop (`DayStrip.tsx:52-55`, `:86-89`, plus `useCenterSelected({ active: !allScope })`) was built for the Map's all-days scope and withholds the filled selection while keeping the today-anchor and the empty-day markers. Extend that rather than adding a second suppression flag (rule 8). Keep the pills **tappable** on Index — `daySelectTarget` routes a tap from a non-day-scoped tab to the Day view, which is useful and which the owner did not ask to remove.

**Tests, from the owner's list:** repeated Day ↔ Map; Day → Index → Day and Map → Index → Map; Day → Index → Map and Map → Index → Day; no selected styling or ARIA state on Index; Index counts/cards/readiness stay trip-wide; no reset to today, first trip day or a stale default on a view switch; Android/browser back and foreground/resume do not corrupt it; and a selected day with no items stays selected. Deep-link and first-entry defaulting follow existing documented behavior — no new first-day policy is being invented here.

## 7. #40 — a Map add does not show up in the Day-by-day Maybe shelf

> Updates still do not always appear on screen. For example, a Place added from Map to the Maybe shelf did not appear in the Maybe shelf in Day-by-day.

**Reconciliation with #32 and `#566`.** Session 244 found and fixed a real defect — a `Change` frame misclassified as a gap and **discarded** — and validated create/update/delete painting live on Home, Day-by-day and Plan Day against a real server. #40 does not contradict any of that; it says the symptom class is not closed. The report is reopened, and session 244's diagnosis is preserved as the record of the remote arm.

**But this witness is probably not a reactivity failure, and the evidence says so before any device is picked up:**

- `verbs.ts:729-731` dispatches `TRIP_ACTION.ADD_MAYBE` **synchronously, before** the network call, and the reducer (`trip-state.tsx:325-329`) appends to `maybeItems`. The idea is in canonical client state immediately, online or off.
- `AppShell` keys `<main>` by tab, so a Map → Day-by-day switch **mounts `DayView` fresh**. It cannot be reading a memo computed before the mutation. (This is also why it cannot share #32's mechanism: session 244 §2 step 6 established that a _tab_ round-trip refetches nothing at all.)
- What _can_ hide it: `DayView.tsx:330` groups via `shelfGroups(maybeItems, events, activeDate)`, which puts an idea with no `targetDate` into `pool` (`lib/shelf.ts:46-51`); `:339-347` then **ranks the pool and caps it at `SHELF_POOL_CAP = 5`** (`constants.ts:245`), with the remainder behind a `+ more` affordance. A Map add creates an **undated** idea (`Map.tsx:1663-1671` → `verbs.addMaybe`), so on a trip with five or more ideas the new one can be ranked out of the five that are visible. To the user that is indistinguishable from "it did not appear."
- The other honest possibility is that the write failed and rolled back: `verbs.ts:746-749` dispatches `UNDO` and raises an error toast.

**Route.** Establish whether the item is in `maybeItems` **before** looking at the render, and rule out grouping, the pool cap and `consumed` before touching the reactive boundary — a "refresh the shelf after a Map add" patch would be the wrong fix for any of the three. If it _is_ absent from state, the write path is the subject, not the render path. Two things stay live on the remote arm regardless: session 244 §6 names `SyncGateway`'s **per-process socket map** as a plausible second cause of the same user-visible symptom on a multi-instance deployment, explicitly not ruled out; and the two-device validation is still owed to the owner. Owner's standing requirement is unchanged: navigation is never the repair mechanism, local and remote changes share one invalidation model, and a test mounts the consumer _before_ the mutation.

## 8. #41 — enrichment still misses `Brúarfoss` and `מפלי גולפוס`

> Many Place-enrichment matches are still missing, for example `Brúarfoss` and `מפלי גולפוס`.

**Reconciliation with #29 and today's two fixes.** `#570` folded the non-decomposing Latin letters (`ð`, `þ`, `æ`, `ø`, `ł`, `ß`, …) into name scoring as **variants**, measured on Gießen. `#571` then found the real cause of the Kerið failure — a name that _says more_ than the candidate's was vetoing a coordinate match at 0.707 against a 0.8 floor — added `nameCanRefuse`, and verified end to end on replayed live payloads (`Q1435393` via `geosearch`, confidence 0.8). Session 248 is unusually careful about what it did and did not prove; that record stands and is not being rewritten.

**The first question is not a matching question.** ADR-0166's negative cache holds a miss for `ENRICHMENT_MISS_TTL_MS` per field (~30 days), and `enrichment.policy.ts:105-110` is what re-asks. A place that missed before today's deploy **will not be re-attempted for weeks on its own** — session 248 says so twice (§3, §5.5) and gives the remedy: `delete from "PlaceEnrichment"` is safe, it holds no trip data. Until the cache is cleared for these rows and the deploy time is compared against the observation time, "still missing" cannot be read as "the fix did not work." This costs minutes and could resolve the report outright.

**The two witnesses are materially different, and neither is what today's fixes were about.**

- **`Brúarfoss`** — `ú` is an ordinary combining accent that `NFD` + `\p{M}` already folded long before `#570`, so the letters fix is not about this name. Candidates worth carrying (none established): Google's own label may carry a feature-type descriptor (`Brúarfoss Waterfall`), which is session 248 §2's **known, deliberately unfixed** descriptor-suffix gap — `#571` only relaxes the name veto _below_ the floor on the **coordinate** routes, so a name-search route still refuses at 0.707; or the entity's `P625` may sit further from Google's pin than `GEO_TRUST_METERS` (150m, `match.ts:383`), which is entirely plausible for a waterfall whose article coordinate is not its visitor pin.
- **`מפלי גולפוס`** — a Hebrew _descriptive_ name for Gullfoss. Disjoint scripts mean `namesComparable` is false, which after `#571` is precisely when `nameCanRefuse` lets **distance decide alone** on the coordinate routes. So this witness exercises the exact arm `#571` built, and its failing is the strongest single piece of evidence in this report. The name-search route is separately pinned to `language=he` (ADR-0166 §15) and Gullfoss may carry no `he` label at all — the same shape as Kerið's `wbsearchentities` zero-hit.

**Also carry:** session 248 §5.3 established that `BROADER_INSTANCE_OF_QIDS` is **country-shaped** — four Japanese/city classes were added because Tokyo was measured, and nobody has looked at Iceland's district/parish classes. Iceland is where all three witnesses live.

**Constraints and acceptance evidence** (owner's, intact): record per witness the exact saved display name and any localized names, coordinates, Google Place ID/types, every provider route attempted, every candidate returned by each route, and the scoring/type/distance/granularity/refusal decision for each — so the failure is classified as retrieval, language selection, normalization, alias coverage, provider data or a safety guard, rather than guessed at. Permanent regression fixtures must include `Kerið`/`Kerid Crater`, `Brúarfoss` (plus a safe unaccented variant), and `מפלי גולפוס` resolving to the correct Gullfoss entity with its QID demonstrated. **No one-off production aliases for these three attractions as the primary fix.** Preserve the raw/local-script name — transliteration and translation are additional evidence, never destructive replacement. Keep the distance, place-type, granularity, airport-identity and confidence/refusal guards, and re-run the multi-country and ambiguous same-name fixtures to show false-match safety did not regress. Amend ADR-0166 only if retrieval/scoring/confidence **policy** moves; a bounded correction under existing policy needs only a build note.

## 9. Workstream grouping

Seven reports, six workstreams — four reopened under their existing letters, two new (`S`, `T`, continuing session 242's `L`–`R`).

| Workstream                                   | Reports          | Status                          | Session type before build                               | Mockup? | ADR obligation                                                      |
| -------------------------------------------- | ---------------- | ------------------------------- | ------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| **M — Map canvas reliability**               | #28, **#35**     | reopened (fix shipped `#569`)   | Measure the tiles bound, then diagnose on a real device | No      | ADR-0121 again only if the failure model changes                    |
| **N — Enrichment recall**                    | #29, **#41**     | reopened (fixes `#570`/`#571`)  | Clear the cache, then route-level trace per witness     | No      | ADR-0166 only if retrieval/scoring policy moves                     |
| **P — Derived effective titles**             | #30, **#37**     | reopened (build shipped `#565`) | Refinement build; Event adopts Booking's precedence     | No      | None — the value-test provenance is unchanged                       |
| **Q — Reactive screen correctness**          | #32, **#40**     | reopened (fix shipped `#566`)   | Diagnosis: rule out grouping/cap before the boundary    | No      | None unless the diagnosis forces an architecture change             |
| **S — The date control under a real device** | **#36**, **#38** | new                             | Direct fixes + a device pass at real text scales        | No      | None; if the closed-field format needs restating, ADR-0176 in place |
| **T — Trip view/day state ownership**        | **#39**          | new                             | Direct navigation-state fix                             | No      | None — ADR-0035 §4's single-source day is preserved, not revised    |

`S` is one workstream because both reports are the same primitive on the same device pass, and because #38's fix and #36's fix both live at the boundary between `DateField` and the platform — but note the asymmetry: **#38 is a crash and should not wait for the device pass #36 needs.** `S` also links to workstream `H` (field report #3, global typography): #36 is a concrete witness that at least one control does not survive the user's text scale, and it is not a reason to keep text small.

## 10. Settled vs. intentionally open

**Settled (owner decisions — build them, do not re-litigate):**

- A live "it still happens" reopens the item regardless of prior "done" status; earlier history is preserved and linked, never erased.
- Map Retry must provide a real recovery path; an inert button is not acceptable (#35).
- The closed date field reads `שבת, 12 בספטמבר` at any system text scale, without clipping (#36).
- Android's date-picker Clear rolls back to the pre-picker date and never commits empty (#38).
- An empty explicit Event title falls back to the selected Place name; deleting a manual title restores derivation (#37).
- Day-by-day and Map share one remembered day; Index shows none and is not date-filtered, while the remembered day survives for the return (#39).
- A successful mutation updates every relevant screen without reload or navigation as the repair (#40).
- `Brúarfoss` and Hebrew Gullfoss are required enrichment regression witnesses, not optional examples (#41).

**Open — technical questions for the routed sessions to answer with evidence:**

- Whether #35 is a persistent failure or a false positive on the unmeasured 10s tiles bound, and what the bound should actually be (#35).
- Whether the numeric read is the native input showing through at `:focus-within`, and whether the clip is the `min-inline-size: 0` flex squeeze (#36).
- The internal representation for explicit-vs-effective title, provided it preserves the value-test provenance and the settled precedence (#37).
- Which transitions should carry `?day=`, without introducing a second copy of the day (#39).
- Whether #40's witness is the shelf's pool cap, a failed write, or a genuine reactive gap — and whether the multi-instance socket map is a second remote cause (#40).
- Which route rejects each enrichment witness, and what general recall improvement preserves refusal safety (#41).

## 11. Not done here, deliberately

No source, test, schema, CSS, ADR or mockup was created or changed. Nothing marked done was deleted or rewritten: `M`, `N`, `P` and `Q` keep their shipped history and gain a reopening clause naming the residual. The confirmed one-line defects found while reading — #38's unguarded `derivedZone` on an empty date, #39's `tabTarget` dropping `?day=` — were **not** fixed while here; they are written down precisely enough that the routed session starts at the fix.
