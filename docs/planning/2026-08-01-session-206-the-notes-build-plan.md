# Session 206 — the notes build plan, and what the ADRs do not answer

**Date:** 2026-08-01
**Scope:** Pre-development planning for [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) + [ADR-0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md). **No feature code was written.** The deliverable is the phased plan below, its test list, and the gap list — which is the part worth reading first.
**Read:** both ADRs (with 0152's four in-place amendments), [`mockups/notes-screen-v1.html`](../../mockups/notes-screen-v1.html) and [`mockups/notes-on-a-host-v1.html`](../../mockups/notes-on-a-host-v1.html), both driven in Chromium.

Nothing here re-opens a decided item except the two marked **proposed amendment**, which are stated with their cost rather than planned around.

---

## Part 1 — verification: what the ADRs claim, and what the tree says

Every code citation in both ADRs was checked. Four hold exactly, two are wrong, and one count is wrong in a way that makes its own argument stronger.

### Holds

- **Host ids are client-generated.** `trip-state.tsx:930` — `const id = input.id ?? crypto.randomUUID()`. Three of the five hosts go further and mint the id in the _form_: `EventForm.tsx:410`, `DocumentUploadSheet.tsx:74`, `BookingSheet.tsx:355`. So the host id exists before the save on every host, and `createBooking` returns the optimistic row carrying it. §6b rests on solid ground.
- **The outbox is FIFO**, stated verbatim at `trip-state.tsx:403` above `createPlace`, and enforced in `doFlushOutbox` (`outbox.ts`) which drains `sortBy('seq')` and halts on transient failure rather than skipping ahead.
- **`EventCard` has no `meta` prop.** `EventCard.tsx:148` builds `[placeName, code && …].join(' · ')` internally. The mark needs its own prop, as §6c says.
- **`.wp-event-m` wraps, deliberately.** `event-card.css:171-181`, and its own comment says the `align-items: flex-start` exists _"so the sync marker stays on the first line and the meta text wraps beneath it"_. §6c's `nowrap` retires a documented behaviour — correctly flagged as an ADR line, not a styling detail.

### Wrong, and worth fixing in place

**1. The fixture count in ADR-0153 is off, and the truth is worse for the rejected option.** §Context, §2 and §Alternatives all say _"40 notes fall on **22 distinct hosts** — 1.4 rows per header"_. Driven in Chromium, the panel reports **29 group headers over 32 attached rows** at 40 notes: **28 distinct hosts plus the general group, 1.1 rows per header** (and 1.0 at six notes, 1.2 at eighteen). Counting the `NOTES` array by hand agrees: 28 unique host names, 8 general. The flat decision is _more_ justified than the ADR argues, not less — but the number a future reader would quote is wrong in three places and should be amended.

**2. ADR-0153 §7's collision note is wrong on both counts.** It says the top-inline-**start** corner _"is where a `✕` would go if the tile ever gained the shelf's remove variant. It has not."_ The tile **has** it, shipped, in Plan mode (`PlanDay.tsx:611` passes `onRemove`/`removeLabel`), and `maybe-card.css:204-207` puts that `✕` at `top: 6px; inset-inline-**end**: 6px` — the opposite corner. So there is no collision and the contingency as written can never fire. The real adjacency to check is the mark against the **glyph**: `.compact` is a row axis with `.wp-maybecard-ic` first at the inline-start (`maybe-card.css:100-119`), and the mockup rendered the corner variant without a `✕` and without the glyph beside it.

**3. The pixel numbers are webfont-dependent and did not reproduce in a sandbox** — the mockups load Assistant/Secular One from `fonts.googleapis.com`, which is unreachable here (zero font requests fired), so every text-width measurement falls back. What reproduced exactly: the meta line's **151px available** (layout-driven), the mark's **0px** cost on the crowded row, the maybe tile at **corner 0px / meta 0px / both +6px**. What did not: _"174px needed"_, _"+19px on the first draft"_, _"113px vs 152px"_ (I read 139 / +0 / 131 vs 152). Directions all hold; magnitudes do not. Two consequences: the `+19px` and `174px` rows in the host mockup's panel are now **historical** — with §6c's place-name-drop rule in force there is no place name left to wrap, so the panel demonstrates 0px both ways — and none of those three numbers should be used as an acceptance criterion. Re-measure on a device with the real font.

Minor: the host mockup cites `list-row.css:39` for the chip's ink wash; line 39 is a `padding`, and the 4% wash it means is `.wp-listrow-open:hover` two lines down. `db.ts:8`'s comment still lists `notes` among `snapshotMeta`'s contents — a leftover from the retired `TripNote`, and the file this build edits anyway.

### The two questions the brief asked me to answer

**Does an inline note follow ADR-0093, or is it just a second queued op?** **A second queued op**, and ADR-0093 is the wrong pattern here. That pattern exists because the _server_ materialises an entity the client never sent an op for — offline there is no echo and no op, so the synthetic `Change` is the only record the linked event ever gets. A note written in a host form **is** its own op with its own client id: it goes through `restOrQueue` → `applyOutboxOpToCache` → `outboxOpToCacheChanges` → the same `applyChangeToCache`, exactly like every other write. Adding a synthetic change beside it would double-apply. What it _should_ borrow is the other half of that neighbourhood: **`withChangeGroup`** (`outbox.ts:249`, today's only consumer is `BookingSheet.tsx:331`), so a host plus its notes count as **one** change in the sync header instead of four.

**What does a new syncable entity actually cost?** ADR-0152's reuse audit lists five registration points and reads as three. The real count is **eighteen**, across three packages. No new _mechanism_ — the audit is right about that — but the registration work is roughly 5× what the ADR implies:

| Where                   | Points                                                                                                                               | Compile-forced?                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `shared/entities.ts`    | `noteSchema` + `Note`; `entityTypeSchema` gains `'note'`; `tripSnapshotSchema.notes`                                                 | —                                        |
| `shared/schemas.ts`     | `createNoteSchema`, `updateNoteSchema`                                                                                               | —                                        |
| `shared/constants.ts`   | `ENTITY_TYPE.NOTE`, `NOTE_SOURCE`, `NOTE_HOST_FIELD`                                                                                 | no — `satisfies` is not exhaustive here  |
| `schema.prisma`         | the `Note` model **plus back-relations on six existing models** (Trip, Event, Booking, Place, MaybeItem, Document, User) + migration | yes (prisma)                             |
| backend                 | `trips.mapper.toNoteDto`; `getSnapshot`'s query + field; a `notes` module (controller/service/module) + `app.module`                 | partly                                   |
| `lib/cache.ts`          | `CACHE_CHANNELS[NOTE]`; `SnapshotMeta.notes`; `cacheSnapshot`; `readCachedSnapshot`; three `outboxOpToCacheChanges` cases            | **yes** — `Record<EntityType, …>` (:109) |
| `lib/outbox.ts`         | three `OUTBOX_VERB`s; three `OutboxOp` members; `outboxOpEntityId` (:131); `runOp` (:567)                                            | **yes** — exhaustive switches            |
| `lib/api.ts`            | three fetchers                                                                                                                       | —                                        |
| `state/trip-state.tsx`  | `notes` state; the memory channel (:681); `resyncSnapshot`; the context type + value; the note verbs                                 | **no — silently optional**               |
| `state/change-feed.tsx` | `subjectOf` (:45) + a `nouns.note` copy line                                                                                         | **no — silent `default` case**           |
| fixtures                | `frontend/src/fixtures.ts`, `e2e/boot.ts`'s `SNAPSHOT`                                                                               | **yes** — `tripSnapshotSchema.parse`     |

The two **silent** ones are the ones to pin with tests: a missing memory channel means a peer's note never appears until reload, and a missing `subjectOf` case narrates _"דנה added an item"_.

---

## Part 2 — the gaps: what the ADRs and mockups do not answer

Ordered by how much they change the build.

### G1 · A `Place` has no row menu, no detail surface, and a bespoke meta line — so it has no entrance at all

This is the largest gap and it is invisible from the mockup, which drew the place host as a `ListRow`. It is not one. `screens/Map.tsx:2841`'s `PlaceRow` is a bespoke ~60-prop component with its own `.map-m` meta line and its own `.map-tag` vocabulary (`map.css:986`) — a **third** meta grammar beside `.wp-event-m` and `.wp-listrow-meta`, and the mark's cost there was never measured. Worse, that row has **no kebab and no `RowManageSheet`**, and a place's "detail surface" is the _same row again_ rendered inside `.map-placecard` (`Map.tsx:2368`) — there is no facts panel with room for a `.note-sec`. Of ADR-0153 §8's four entrances, a Place has **none**. Authoring is worse still: the only place form is `MapPlaceForm`, hosted on the canvas inside a bounded card — and `frontend/CLAUDE.md` records twice that _a bounded card that clips cannot host_ what wants to grow (the `IconPicker` panel cut to 50px, ADR-0148's third amendment). A growing composer textarea is exactly that shape.

**Proposed amendment (ADR-0152 §2/§6, ADR-0153 §8), with its cost.** Keep `placeId` in the schema — an unused nullable FK costs nothing and adding it later is a migration nobody wants. Ship **no Place authoring or reading surface in v1**. The cost is real and should be stated rather than discovered: a note about a place must be attached to the event, booking or idea at that place, and a place with none of those cannot carry one. The alternative is a genuine sub-project — a row menu on the Map (ADR-0138 territory), a place detail surface that does not exist, and a form that cannot grow — for the host whose knowledge is almost always already attached to something else. **Owner's call**, see Q1.

### G2 · The change feed narrates notes on day one, whether or not §C is deferred

`describeChange` has no per-entity gate: the moment a `Change` row exists for a note, a peer's note create **and every edit** becomes a line in the bounded 20-entry feed. The brief's §C2 asked exactly this question (_"do note edits narrate, or only creations?"_) and §C was handed off to Hero 2.0 — but the behaviour ships with the entity regardless. A group editing one note in an hour can flush the buffer.

### G3 · The category is resolved, not copied — which means every note render needs its host

§5's amendment (`note.category ?? host.category`) is right and cheap to describe, and the mockup's fixture hid its cost by pre-baking a category on every row. In the real screen a hosted note carries `category: null`, so the **badge glyph, the chip label, the chip counts and the category filter itself** all need the host resolved first — across five entity types, for every note, on every render. That is a real derivation (`noteHostIndex`: id → `{ kind, name, icon, category }`) and it is net-new infrastructure the reuse audit's _"Net-new: the `Note` model/schema and its module. Nothing else"_ does not account for. It is also the thing that makes the host chip's **name** possible at all.

### G4 · The crowded-row measurement omitted the sync badge

`.wp-event-m` hosts `{sync}{meta}` — and the mockup's `eventCard` renders no sync node at all. So the row that decided §6c was measured **without** the one element the ADR itself calls _"the one node already living there"_. The true worst case — a queued write, a confirmation code and a mark on one 390px line — was never on screen. It is also the case §6c's drop rule does not cover: the rule drops the place name when `code && notes`, and says nothing about `code && notes && pending`.

### G5 · A cascaded delete is silent, and undo makes it lossy

The applier rule handles the sync half correctly. What nothing handles: **undo**. `verbs.ts:725` restores a deleted event by re-creating it **with the same id** (`toCreateEventInput` keeps `id`) — so an undone delete brings the host back and its notes are gone from the database forever, with the client's own cascade rule having already dropped them from view. Nothing in either ADR mentions it, and no surface warns the user before the delete either: the mockup's note-delete confirm politely says _"ההזמנה עצמה לא תיפגע"_, and the reverse — deleting a host destroys its notes — is stated nowhere.

### G6 · `MaybeItem`'s "the sheet the tile already opens" is a schedule flow, not a manage sheet

ADR-0153 §8 closes the idea gap by giving _"the sheet the tile already opens"_ the note section. There is no such sheet. `MaybeCard`'s only tap is `onSchedule` (`DayView.tsx:435`, `PlanDay.tsx:611`), which opens the **schedule** sheet — pick a day, pick a time — and a note section above a scheduling flow is the wrong room. Plan mode adds a `✕`, not a menu. Closing this honestly means either giving `MaybeCard` a manage sheet it has never had, or accepting that an idea's notes are reachable only from the notes screen.

### G7 · Ordering, timestamps and authorship are unspecified

"Ordered by recency" and "the newest note with its author" do not say **which** field. `createdAt` and `updatedAt` diverge the first time someone fixes a typo, and if the list sorts on `updatedAt` an edit teleports a row to the top of a list someone else is reading. Nor is it stated whether the row's author is `createdBy` (which the entity has) or `updatedBy` (which it also has).

### G8 · Smaller, but each would be found late

- **An orphaned host in view.** A hosted note whose host row is missing from memory (a stale offline cache, a mid-flight delete) has a `hostId` and no name. Must not render an empty chip and must not crash.
- **The `fresh` mark state has no state to key off.** `.note-mark.fresh` is designed and the host mockup admits it: _"since you last opened"_ needs per-user, per-host state that does not exist anywhere in this app.
- **`Note.source` is a one-value enum in v1** (`member`) — still a named constant per ADR-0095, not a bare string.
- **`Note.createdBy → User`**: `MaybeItem`'s precedent is `onDelete: Cascade`. Follow it, and note that it means deleting a user deletes their notes.
- **Both empty states use `EmptyState`**, but the bookings screen next door still uses a bespoke `.empty-card` (`IndexBookingsView.tsx`). Do not copy the neighbour.
- **The mockup's prose contradicts its own code** on the no-category glyph: the notes says `📝`, the fixture and ADR-0153 §4 say `DEFAULT_EVENT_ICON` (`📌`, `constants.ts:200`). The code is right.
- **The card tier** is drawn in CSS but nothing emits cards. "Drawn" in ADR-0153 §10 is ambiguous between _shipped-but-empty_ and _mocked_. See Q3.

---

## Part 3 — decisions I am making, so the build does not stop to ask

1. **Cache channel = `metaList: 'notes'`** on `snapshotMeta`, beside `maybeItems`/`places`. A dedicated Dexie table would need a version-5 migration plus edits to `wipeLocalData` and three transaction lists, for a list of a few hundred small rows. One-line union extension in `cache.ts`.
2. **An inline note is an ordinary queued op**, not an ADR-0093 synthetic change (reasoning above), and the host form wraps its save in **`withChangeGroup`** so host + notes are one change.
3. **Sort and display on `createdAt` desc; the author is `createdBy`.** An edit does not reorder the list; the tile's "newest" is the newest written. Group memory should not shuffle under a reader.
4. **One `lib/notes.ts` owns host resolution** — `noteHostIndex` derived once in trip-state (memoized like `zoneCrossings`), giving `{ kind, name, icon, category }`. Every consumer (badge, chip, counts, filter, search) reads it. An unresolvable host renders as a **general** note — no chip — never a placeholder.
5. **Chip counts and the category filter use the resolved category**, so a hosted note cannot vanish from the chip row it visually belongs to.
6. **The cascade rule is one lookup and two registrations**: `NOTE_HOST_FIELD` in `shared/constants.ts` (`event → eventId`, …), consulted by `applyEntityChange` (`trip-state.tsx`) and `applyChangeToCache` (`cache.ts`) **before** the channel dispatch, on `action === DELETE` only.
7. **Every host's delete confirm gains the note count** — _"3 פתקים יימחקו איתה"_ — because it is the only moment the user can learn about the cascade, and G5 makes it unrecoverable.
8. **`notes` is required in `tripSnapshotSchema`** (matching `places`/`documents`); fixtures and `e2e/boot.ts` are updated in the same commit.
9. **`Note.createdBy` mirrors `MaybeItem`** — a `User` relation with `onDelete: Cascade`.
10. **`packages/shared` gets no Hebrew.** `NOTE_SOURCE` and `NOTE_HOST_FIELD` are keys; every string lands in `i18n/he.ts`. No em dashes; `·` between peer facts, `-` for a missing value.

## Questions that are the owner's

**Q1 — Place hosting.** Ship it with a bespoke mark, no entrance and a composer in a clipping canvas card; build the Map a row menu and a place detail surface (a sub-project); or keep the FK and ship no Place surface in v1? **My recommendation: the third**, with the limitation written into the ADR rather than discovered.

**Q2 — the change feed (G2).** Notes narrate automatically. Narrate creates only, creates + deletes, or everything? **My recommendation: creates and deletes, suppress note updates** — one rule in `describeChange`. I will build to this unless told otherwise, and it is reversible in a line.

**Q3 — the card tier.** Ship its CSS and markup empty now so the layout has a place, or keep the mockup as its spec and let the first strategy bring it? **My recommendation: the mockup is the spec.** Dead CSS with no consumer is not what "retrofitting is expensive" was warning about — the expensive half is the two-tier _decision_, which is already made and recorded.

**Q4 — the ADR corrections.** The 1.4/22 figure, ADR-0153 §7's collision note, and the "measured" pixel numbers should be amended in place (Part 1). Confirm and I will fold them into Phase 1's commit.

---

## Part 4 — the phased plan

One branch and one PR per phase. Each phase is independently shippable: nothing after Phase 1 is required for what shipped before it to be correct.

### Phase 1 — the entity, and nothing you can see

`feat(notes): the Note entity and its sync channels`

The eighteen registration points, the Prisma model + migration, the Nest module, and the client plumbing. **No UI.** Ends green with a note creatable only from a test.

- shared: schemas, `Note`, `ENTITY_TYPE.NOTE`, `NOTE_SOURCE`, `NOTE_HOST_FIELD`, snapshot field.
- backend: model + six back-relations + migration; `notes` module through `ChangeService.mutate` (never a direct `Change` insert); `assertBookingInTrip`-style scope checks extended in `trip-scope.util.ts`, not re-implemented; snapshot query + mapper.
- frontend: cache channel + `SnapshotMeta`, outbox verbs, api fetchers, trip-state list + memory channel + resync, the cascade rule, `change-feed` subject, fixtures.
- docs: `data-model.md`, `api-contract.md`, `sync-and-offline.md` in the same commit; the ADR corrections from Q4.

**Tests.** Backend service specs: create is idempotent on a duplicate client id (the P2002 path `maybe-items.service.ts` models); at-most-one-host is refused; a host id from another trip is refused; delete writes its `Change`. Shared: zod refuses a note with neither body nor url, and refuses two hosts. Frontend units: `outboxOpToCacheChanges` for all three verbs; the memory channel applies a WS note change (**the silent registration — this test is the point**); the cascade rule drops the right notes and only those, in both the memory and the cache half; `describeChange` names a note. **e2e-only:** none. **Device-only:** none.

### Phase 2 — the screen and the tile

`feat(notes): the notes screen, the third Index tile, and the editor`

General notes end-to-end. `IndexNotesView` modelled on `IndexBookingsView` (`ChoiceGrid` pills, `SearchOverlay`, `RevealList`, `useBackLayer` peeling the chip filter first), `ListRow` rows, a `Modal` editor with `useFormErrors`, `RowManageSheet` + `ConfirmDialog`, both `EmptyState`s, the third `IndexTile`, `lib/notes.ts`, the Hebrew copy, and the five new CSS rules.

**Tests.** Component: the nine row states, and specifically that a title+body note prints the body **once**; a url-only row is an `ltrIsolate` island and never `dir="ltr"`; a no-category note falls back to `📌` and still counts under `other`; the refusal marks **both** curable fields in one call and the primary is not `disabled`; search matches on `body` and on `url`, not only `title`; filtering hides rows in place (`countVisible`, never `rows.length`); an orphaned host renders as general. **e2e-only:** the back layer peels chip → screen → landing (extend `back-index.spec.ts`); the refused field is painted `--miss` while focused (the `form-refusal.spec.ts` pattern — jsdom answers nothing about computed style); the reveal's per-row `transition-delay` actually applies. **Device-only:** whether the editor's textarea should autofocus.

### Phase 3 — `EventCard`'s three changes

`fix(day): the meta line is one nowrap row, and a coded row with notes drops its place name`

Deliberately its own PR **because two of the three changes alter rows with no notes at all**. `notes?: number` + the elementised meta + `nowrap` + the drop rule, wired from `DayView` (the only call site) through the Phase-2 host index.

**Tests.** Unit on the composition rule, which is the whole reason §6c made it a rule and not a CSS accident: code + mark → no place name; code alone → place kept; mark alone → place kept; neither → unchanged. **e2e-only:** the row's height is identical with and without the mark at 390px; the confirmation code is never the thing that ellipsises (`scrollWidth` vs `clientWidth` — jsdom reports every rect as zero, `frontend/CLAUDE.md`'s standing warning); the sync-badge + code + mark case from G4, which no mockup measured. **Device-only:** the same line with the real Assistant webfont, since every width in Part 1 that depended on it failed to reproduce.

### Phase 4 — the booking, end to end, and the migration

`feat(notes): notes on a booking, and Booking.details.notes becomes rows`

The vertical slice that proves the shape: the mark on the `IndexBookingsView` row, the `.note-sec` in `BookingDetail`, the composer in `BookingSheet` (replacing today's `הערות` field, `he.ts:485/494` renamed), the row-menu entry, and the one-time migration. `booking-draft.ts:168`'s `notes` leaves the draft; `BookingDetail.tsx:66`'s read goes; **`details.wifi` is untouched**, so `home-quick.ts` does not change and `BOOKING_FIELD_COVERAGE` keeps `details: 'form'` for room + wifi.

**Tests.** Backend: the migration is idempotent, moves every `details.notes` string, leaves `details.wifi` and `details.room` intact, and attributes the row to the booking's `updatedBy`. Frontend: the composer commits on `＋` and on Enter; a chip reopens into the composer with anything half-typed committed first; **the box's remainder is saved with the host and costs no extra press** (the rule the whole design turns on); a blank box writes nothing; the host and its notes flush as one change group and in FIFO order. **e2e-only:** the whole save offline — host queued, notes queued behind it, the row and its mark appearing immediately, the queue draining in order on reconnect. **Device-only:** none.

### Phase 5 — documents and ideas

`feat(notes): notes on a document and on an idea`

Cheap by comparison: `DocumentsSection`'s `ListRow` takes the mark, `DocumentViewer`/`DocumentManageSheet` take the section and the entrance, `DocumentUploadSheet` takes the composer. The idea is G6's open question — resolve it before this branch starts. The `MaybeCard` corner mark ships here, verified against the shipped `✕` and the compact row's glyph.

**Tests.** Component: the mark's count appears only past 1; the tile's height is unchanged with the mark (**e2e**, and check it with the Plan-mode `✕` present, which no mockup did). **Device-only:** whether the mark wants a tap target — the one question ADR-0153 §8 explicitly left to a finger.

### Phase 6 — places, or the recorded decision not to

Depends entirely on Q1. If the answer is "not in v1", this phase is an ADR amendment and a backlog line, not a branch.

---

## Notes for whoever picks this up

- Run `pnpm install` **before** `pnpm format` — with no `node_modules` the format script falls through to an unpinned prettier that rewrites files CI then rejects.
- The mockups are the build spec, and both record corrections against themselves worth reading before you copy their markup: `.idx-screen` needs its `.index` ancestor or every scoped rule silently drops, a Sheet is `.modal-overlay[data-variant='sheet'] > .modal-card > .modal-title` (there is no `.modal-head`/`.modal-body`), a `Field` carries `data-invalid=""` with its error **after** the control, and `FormActions` puts the primary first.
- The accessible name for the mark follows `SyncBadge.tsx:30` — `role="img"` + `aria-label` + `title`, icon `aria-hidden`. The helper class is `.visually-hidden` (`App.css:666`); there is no `.sr-only`, and inventing one rendered visible text in the mockup's first draft.
