# Session 206 — the notes build plan, and what the ADRs do not answer

**Date:** 2026-08-01
**Scope:** Pre-development planning for [ADR-0152](../decisions/0152-a-note-is-one-entity-with-an-optional-host.md) + [ADR-0153](../decisions/0153-the-notes-surface-the-mark-and-no-mode-gate.md). **No feature code was written.** The deliverable is the phased plan below, its test list, and the gap list — which is the part worth reading first.
**Read:** both ADRs (with 0152's four in-place amendments), [`mockups/notes-screen-v1.html`](../../mockups/notes-screen-v1.html) and [`mockups/notes-on-a-host-v1.html`](../../mockups/notes-on-a-host-v1.html), both driven in Chromium.

**Owner's answers are folded in (session 206).** A place carries notes in v1 — G1 below is now a resolution, not a proposal. The change feed narrates note creates and deletes only; the card tier is not built; the ADR corrections in Part 1 land in Phase 1's commit. One question is left open (Q5) and one new prerequisite is added (a small mockup before Phase 6).

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

### G1 · A `Place` has no row menu and no detail surface — RESOLVED (owner, session 206: a place must carry notes in v1)

The gap is real and it is invisible from the mockup, which drew the place host as a `ListRow`. It is not one. `Map.tsx:2841`'s `PlaceRow` is a bespoke ~60-prop component with its own `.map-m` meta line and its own `.map-tag` vocabulary (`map.css:986`) — a **third** meta grammar beside `.wp-event-m` and `.wp-listrow-meta`. That row has **no kebab and no `RowManageSheet`**, and a place's "detail surface" is the _same row again_ rendered inside `.map-placecard` (`Map.tsx:2368`), which exists only at the `map` sheet stop. Of ADR-0153 §8's four entrances, a Place appeared to have none.

The owner's answer is that a place carries notes in v1, so the question is how — and reading the Map's own files turned this from a sub-project into three modest changes, one of which I had flagged as a trap it is not.

**The mark is the cheapest of the five, not the hardest.** I had it backwards. `.wp-event-m` needed `nowrap`, elementisation and a drop rule because it is a **joined string** in a line that must never grow. `.map-m` is already `display: flex; flex-wrap: wrap` with every fact already its own element (`map.css:986`) — up to six `.map-tag`s that appear and disappear per row. The mark is **one more item in a line built to take them**: no surgery, no drop rule, no new grammar. Render it **last**, after the rating, so it is first to wrap and can never displace a semantic tag.

**The body rides `renderRow`, gated on `selected` — so it lands in both places a row renders, from one implementation.** `renderRow` (`Map.tsx:1968`) is a single curried renderer shared by the sheet list (:2084), the ghost row (:2346) and the place card (:2370). Putting `.note-sec` inside it, gated on the row's existing `selected` state, gives a place its notes **inside the card at the `map` stop and inline in the list at `full`** — with no gating question, no sixth surface, and no kebab on `.map-right`, whose height cost that file already measured and recorded (_"a verb ADDED beside `נווט` would cost height and the row would grow"_). This is the same principle the file states three times for the card itself — _the row surfaces wherever the sheet cannot show it_ — applied one level in. The entrance is the tap that already selects.

**The composer drops into `MapPlaceForm` unchanged, and my trap-flag was wrong.** I cited `frontend/CLAUDE.md`'s _"a bounded card that clips cannot host an anchored panel"_. That warning is about a panel **leaving** its host's box (`IconPicker`, cut to 50px). A textarea is inline content, and ADR-0148 §1 already rebuilt this card for exactly this: `.map-draft` is `grid-template-rows: auto minmax(0, 1fr) auto` — pinned head, **scrolling middle**, pinned foot — explicitly modelled on `EventForm`/`BookingSheet`, bounded by arithmetic so a shortfall becomes a scroll rather than a clip, and it deliberately **does not** set `overflow: hidden`. `.map-draft-scroll` currently holds one child (the category pills). The composer is the second.

**The one real new cost.** `map.css:514`'s height bound is scoped `:has(> .map-draft)`, with the comment _"the selection card is a 73px row and wants none of this"_. Once the selection card can hold a note section it is no longer a 73px row, so the same arithmetic extends to it — a selector change over a bound already written and already reasoned about, not new maths.

So a Place ends up with three of §8's four entrances (the card, the section's `＋ פתק`, the notes screen) and not the row menu, which it has never had. Recorded in ADR-0153 §8 rather than left as a silent omission.

### G2 · The change feed narrates notes on day one, whether or not §C is deferred

`describeChange` has no per-entity gate: the moment a `Change` row exists for a note, a peer's note create **and every edit** becomes a line in the bounded 20-entry feed. The brief's §C2 asked exactly this question (_"do note edits narrate, or only creations?"_) and §C was handed off to Hero 2.0 — but the behaviour ships with the entity regardless. A group editing one note in an hour can flush the buffer.

### G3 · The category is resolved, not copied — which means every note render needs its host

§5's amendment (`note.category ?? host.category`) is right and cheap to describe, and the mockup's fixture hid its cost by pre-baking a category on every row. In the real screen a hosted note carries `category: null`, so the **badge glyph, the chip label, the chip counts and the category filter itself** all need the host resolved first — across five entity types, for every note, on every render. That is a real derivation (`noteHostIndex`: id → `{ kind, name, icon, category }`) and it is net-new infrastructure the reuse audit's _"Net-new: the `Note` model/schema and its module. Nothing else"_ does not account for. It is also the thing that makes the host chip's **name** possible at all.

### G4 · The crowded-row measurement omitted the sync badge

`.wp-event-m` hosts `{sync}{meta}` — and the mockup's `eventCard` renders no sync node at all. So the row that decided §6c was measured **without** the one element the ADR itself calls _"the one node already living there"_. The true worst case — a queued write, a confirmation code and a mark on one 390px line — was never on screen. It is also the case §6c's drop rule does not cover: the rule drops the place name when `code && notes`, and says nothing about `code && notes && pending`.

### G5 · A cascaded delete is silent, and undo makes it lossy

The applier rule handles the sync half correctly. What nothing handles: **undo**. `verbs.ts:725` restores a deleted event by re-creating it **with the same id** (`toCreateEventInput` keeps `id`) — so an undone delete brings the host back and its notes are gone from the database forever, with the client's own cascade rule having already dropped them from view. Nothing in either ADR mentions it, and no surface warns the user before the delete either: the mockup's note-delete confirm politely says _"ההזמנה עצמה לא תיפגע"_, and the reverse — deleting a host destroys its notes — is stated nowhere.

### G6 · `MaybeItem`'s "the sheet the tile already opens" is a schedule flow, not a manage sheet

ADR-0153 §8 closes the idea gap by giving _"the sheet the tile already opens"_ the note section. There is no such sheet. `MaybeCard`'s only tap is `onSchedule` (`DayView.tsx:435`, `PlanDay.tsx:611`), which opens the **schedule** sheet — pick a day, pick a time — and a note section above a scheduling flow is the wrong room. Plan mode adds a `✕`, not a menu.

G1's resolution does **not** transfer: a 140×76 tile cannot expand the way a map row can. Two honest closes remain, and one of them is now cheaper than it looks. **An idea with a place already renders as a `PlaceRow` on the Map** (`isPureIdea` → the `על המדף` tag), so it inherits G1's section for free — the gap is only ideas with **no** place. For those: either `MaybeCard` gains the `RowManageSheet` it has never had (which would also give its scattered verbs — a tap to schedule, a Plan-only `✕` — the one surface ADR-0138 says a row's actions belong on), or an idea's notes are written and read from the notes screen alone. **See Q5** — this is the one question G1's answer opens rather than closes.

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

## Answered by the owner (session 206)

**Q1 — Place hosting: a place must carry notes in v1.** Resolved in G1 above: the mark is a seventh `.map-tag`, the body rides `renderRow` gated on `selected` so it reaches both sheet stops from one implementation, and the composer is `.map-draft-scroll`'s second child. Phase 6 builds it, behind a small mockup (below).

**Q2 — the change feed: as recommended.** Narrate note **creates and deletes**, suppress note updates — one rule in `describeChange`, reversible in a line, and it keeps a group editing one note from flushing the bounded 20-entry buffer.

**Q3 — the card tier: as recommended.** The mockup is its spec. No empty CSS ships; the first strategy brings it.

**Q4 — the ADR corrections: confirmed.** The `22 hosts / 1.4 rows` figure (three places in ADR-0153), §7's corner-collision note, and the webfont-dependent pixel numbers are amended in place, in Phase 1's commit.

## Still the owner's

**Q5 — an idea with no place (G6).** An idea _with_ a place inherits G1's section for free by rendering as a `PlaceRow`. For the rest: give `MaybeCard` the `RowManageSheet` it has never had — which would also collect its scattered verbs onto the one surface ADR-0138 says a row's actions belong on — or leave those notes to the notes screen. **My recommendation: the manage sheet**, because the alternative is the only host where the mark points at something you cannot open, and because ADR-0153 §8's own sentence assumed a sheet that turned out not to exist.

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

### Phase 2 — THE NOTES SCREEN itself: the flat list, the third tile, the editor

`feat(notes): the notes screen, the third Index tile, and the editor`

**This is the surface ADR-0153 §2–§5 describes** — the flat recency-ordered list, its chip row and search, the row across its nine states, the row menu and its delete confirm, both empty states, and the editor. It is a phase of its own and it is the first thing a user sees.

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

Cheap by comparison: `DocumentsSection`'s `ListRow` takes the mark, `DocumentViewer`/`DocumentManageSheet` take the section and the entrance, `DocumentUploadSheet` takes the composer. The `MaybeCard` corner mark ships here, verified against the shipped `✕` (opposite corner) and the compact row's glyph. Q5 decides whether a place-less idea also gets a manage sheet; if it does, it lands here.

**Tests.** Component: the mark's count appears only past 1; the tile's height is unchanged with the mark (**e2e**, and check it with the Plan-mode `✕` present, which no mockup did). **Device-only:** whether the mark wants a tap target — the one question ADR-0153 §8 explicitly left to a finger.

### Phase 6 — the place, on the Map

`feat(notes): notes on a place`

G1's three changes: the mark as a seventh `.map-tag` rendered last; `.note-sec` inside `renderRow` gated on `selected`, reaching the card at the `map` stop and the list at `full` from one implementation; the composer as `.map-draft-scroll`'s second child in `MapPlaceForm`; and `map.css:514`'s height bound extended from `:has(> .map-draft)` to a selection card that is no longer a 73px row.

**Prerequisite: one small mockup, `notes-on-a-place-v1.html`** (ADR-0097's catalogue). Not a Map mockup — everything unmeasured here is row-level, so it is a strip-and-card file like `notes-on-a-host-v1.html`, needing `.map-m`, the row CSS and `.map-placecard` through the existing `inline-app-css.mjs` manifest, and no canvas at all. Four questions: (1) the mark as the **7th tag** on a maximally crowded `.map-m` (time + now/next + outcome + meta + `על המדף` + rating) at 390 and 360 — does it wrap, and can wrapping ever displace a semantic tag if it renders last; (2) the selected row with its section at **0 / 1 / 3 notes**, in the card and inline in the list; (3) what the extended height bound leaves when the shortfall becomes a scroll; (4) the composer as the scroll region's second child, mostly to confirm the pinned foot survives.

It earns its keep on precedent: session 203 built the compact tile from a mockup saying 76px and got **84px** — _"every token identical, the eight pixels entirely from the meta line wrapping"_ — on a row less dense than this one. It blocks nothing before it; Phases 1–5 never touch the Map.

**Tests.** Unit: the mark renders last among the tags; a note section renders only for the selected row; an idea rendering as a `PlaceRow` gets the same section. **e2e-only:** the place card's height at the `map` stop with three notes, at 360×640, stays inside its bound and scrolls rather than clipping (the failure ADR-0148 §1 records is a card you could commit but not read); a selected row expanding in the `full` list does not throw the scroll position. **Device-only:** the composer with the keyboard up on iOS, where the viewport does not shrink and every layout number reads healthy while the card is invisible — the exact trap `map.css:460` documents.

---

## Notes for whoever picks this up

- Run `pnpm install` **before** `pnpm format` — with no `node_modules` the format script falls through to an unpinned prettier that rewrites files CI then rejects.
- The mockups are the build spec, and both record corrections against themselves worth reading before you copy their markup: `.idx-screen` needs its `.index` ancestor or every scoped rule silently drops, a Sheet is `.modal-overlay[data-variant='sheet'] > .modal-card > .modal-title` (there is no `.modal-head`/`.modal-body`), a `Field` carries `data-invalid=""` with its error **after** the control, and `FormActions` puts the primary first.
- The accessible name for the mark follows `SyncBadge.tsx:30` — `role="img"` + `aria-label` + `title`, icon `aria-hidden`. The helper class is `.visually-hidden` (`App.css:666`); there is no `.sr-only`, and inventing one rendered visible text in the mockup's first draft.
