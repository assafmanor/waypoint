// Notes (ADR-0152 / ADR-0153). Pure derivations over the note list — no React, no Dexie,
// no clock — so both halves of the sync path and every render surface read one answer.
import {
  CHANGE_ACTION,
  categoryForBookingType,
  eventCategorySchema,
  iconForCategory,
  matchesAnyTerm,
  NOTE_HOST_FIELD,
  type BookingType,
  type EntityType,
  type EventCategory,
  type Note,
  type NoteHostKey,
} from '@waypoint/shared';
import { DEFAULT_EVENT_ICON, NOTE_INLINE_MAX_LINES, NOTE_ROW_CHARS_PER_LINE } from '../constants';
import { inContext, type HostContext } from './host-context';
import { revealRows, type Revealed } from './filter-reveal';
import { formatDuration } from './duration';
import { prettyUrl } from './external-url';
import { flattenNoteMarkdown } from './note-markdown';
import { t } from '../i18n/he';

/** Every `EventCategory`, in the enum's own order — the chip row's order, so nothing here
 *  chooses one (`other` is last because the enum puts it last). */
const EVENT_CATEGORIES = eventCategorySchema.options;

/** The `Change` fields these derivations read — the same subset `EntityChange` names in
 *  `lib/cache.ts`, so a live WS echo and an offline optimistic write both fit. */
export type HostChange = { entityType: EntityType; entityId: string; action: string };

/** **A row carrying the five host FKs** — a `Note` or a `Task`, which hold the same five
 *  under the same "at most one" rule (`TASK_HOST_KEYS` is an ALIAS of `NOTE_HOST_KEYS`, not
 *  a copy). Typed structurally so the two helpers below serve both, which is what stopped
 *  phase 4 adding a second copy of each beside them. */
export type HostedRow = Partial<Record<NoteHostKey, string | undefined>>;

/** Is this row hosted by that entity? */
export function isHostedBy(row: HostedRow, entityType: EntityType, entityId: string): boolean {
  const field = NOTE_HOST_FIELD[entityType as keyof typeof NOTE_HOST_FIELD];
  return field ? row[field] === entityId : false;
}

/** **The host cascade, for any row that carries the five FKs** (ADR-0152 §2, generalised in
 *  phase 4). See `dropNotesForHostChange` below for why this exists at all.
 *
 *  **Where the generalisation stops, and why** (root rule 8's "ask before the bigger
 *  refactor"): this covers `dropNotesForHostChange` and `dropTasksForHostChange`, which are
 *  the same table and the same operation. It deliberately does NOT absorb
 *  `dropAttachmentsForHostChange` — that reads a different, two-member table AND carries an
 *  extra case (a deleted DOCUMENT drops its own links, not just links pointing at it) — nor
 *  `clearPlaceRefsForChange`, which CLEARS a field rather than dropping a row and is already
 *  generic over its own shape. Folding either in would mean a flag argument that exists to
 *  say "behave differently", which is the copy in a different costume. */
export function dropHostedForHostChange<T extends HostedRow>(rows: T[], change: HostChange): T[] {
  if (change.action !== CHANGE_ACTION.DELETE) return rows;
  if (!(change.entityType in NOTE_HOST_FIELD)) return rows;
  const kept = rows.filter((row) => !isHostedBy(row, change.entityType, change.entityId));
  return kept.length === rows.length ? rows : kept;
}

/**
 * **The sync half of the host cascade** (ADR-0152 §2), and the reason it exists is that the
 * storage half is silent: the five host FKs are `onDelete: Cascade`, so Postgres removes a
 * deleted host's notes **without writing `Change` rows**. A peer holding the trip in memory
 * or in Dexie would therefore never hear about them and would keep rendering notes whose
 * host is gone, until the next full snapshot.
 *
 * So a host's `delete` change drops the notes it hosted. One rule, registered in both places
 * a change is mirrored — the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS`
 * in `lib/cache.ts` — rather than a branch per host type: the entity type → FK lookup is
 * `NOTE_HOST_FIELD`, so a sixth note-bearing entity adds a line there and nothing here.
 *
 * Returns the SAME array reference when nothing was dropped, so the common case (every
 * change that is not a host delete) cannot cause a re-render.
 */
export function dropNotesForHostChange(notes: Note[], change: HostChange): Note[] {
  return dropHostedForHostChange(notes, change);
}

// --- Reading a note: its host, its category, its glyph, its order -------------------------
// The screen shows a note's category glyph and, when it has a host, that host's NAME — and
// a hosted note stores neither (§5's amendment: resolved, never copied). So every note
// render needs its host resolved, across five entity types. That resolution is here, once.

/** What a note's row needs to know about its host: which kind it is, what it is called, and
 *  the category the note inherits when it carries none of its own. */
export interface NoteHostRef {
  kind: NoteHostKind;
  id: string;
  name: string;
  category?: EventCategory;
  /** **Which day this host lives on**, for the two kinds whose surface is a DAY rather than
   *  a screen: an event's `date`, and an idea's pencilled `targetDate` (absent for someday).
   *  The way in needs it — you cannot open a card without first being on its day — and
   *  nothing else reads it, which is why it is here rather than a second lookup. */
  date?: string;
}

/** The five hostable entity types, as the row's own vocabulary — narrower than `EntityType`,
 *  so a chip's kind-mark lookup is exhaustive and a sixth host is a compile error there. */
export type NoteHostKind = keyof typeof NOTE_HOST_FIELD;

/** Everything the resolver needs, in the shapes trip-state already holds. Deliberately the
 *  minimum of each entity rather than the entity itself, so a fixture is a literal and the
 *  derivation cannot start depending on some other field. */
export interface NoteHostSources {
  events: { id: string; title: string; category?: EventCategory; date: string }[];
  bookings: { id: string; title: string; type: BookingType }[];
  places: { id: string; name: string; category?: EventCategory }[];
  maybeItems: { id: string; title: string; category?: EventCategory; targetDate?: string | null }[];
  documents: { id: string; title: string }[];
}

/** An id → host lookup per kind, built once per snapshot change rather than per row: the
 *  screen resolves a host for every note it renders, and the day card asks the same
 *  question once per row. `Map` rather than `.find()` for the same reason.
 *
 *  A **booking** has a `BookingType`, not an `EventCategory`, so it goes through the app's
 *  existing `categoryForBookingType` (ADR-0038) instead of a second mapping. A **place** and
 *  a **document** have no category at all — a place deliberately so (the referencing entity
 *  that has one is ambiguous, ADR-0147) — and a note on either simply falls back to the
 *  no-category glyph, which is the honest answer rather than an invented one. */
export function buildNoteHosts(sources: NoteHostSources): Map<string, NoteHostRef> {
  const index = new Map<string, NoteHostRef>();
  const put = (kind: NoteHostKind, ref: Omit<NoteHostRef, 'kind'>) =>
    index.set(`${kind}:${ref.id}`, { kind, ...ref });

  for (const e of sources.events)
    put('event', { id: e.id, name: e.title, category: e.category, date: e.date });
  for (const b of sources.bookings)
    put('booking', { id: b.id, name: b.title, category: categoryForBookingType(b.type) });
  // **A place says what it is** (ADR-0165), which is newer than the ADR-0147 reasoning this
  // line was written under: the "the referencing entity is ambiguous" objection was answered
  // by putting `category` on the place itself. Without this a note on a categorised place
  // still fell back to the no-category glyph, and its editor could not state an inheritance
  // the place was perfectly able to supply.
  for (const p of sources.places) put('place', { id: p.id, name: p.name, category: p.category });
  for (const m of sources.maybeItems)
    put('maybeItem', {
      id: m.id,
      name: m.title,
      category: m.category,
      date: m.targetDate ?? undefined,
    });
  for (const d of sources.documents) put('document', { id: d.id, name: d.title });
  return index;
}

/** This note's host, or `undefined` for a general note — **and also for a note whose host
 *  is not in the lookup**. That second case is real rather than defensive: a stale offline
 *  cache, or a peer's delete mid-render. Such a note reads as GENERAL (no chip) rather than
 *  showing an empty chip or a placeholder name, because "we don't know what this is about"
 *  is exactly what a general note looks like and it is the truthful degradation. */
/*  **Widened from `Note` to `HostedRow`** (ADR-0191 §8): it only ever read the five FKs, and a
 *  task carries the same five — so the tasks screen's host chip is this function rather than a
 *  copy of it. The same extraction `isHostedBy` and `dropHostedForHostChange` already took. */
export function noteHost(
  note: HostedRow,
  hosts: Map<string, NoteHostRef>,
): NoteHostRef | undefined {
  for (const [kind, field] of Object.entries(NOTE_HOST_FIELD) as [NoteHostKind, NoteHostKey][]) {
    const id = note[field];
    if (id) return hosts.get(`${kind}:${id}`);
  }
  return undefined;
}

/** The category a note READS as: its own, else its host's (ADR-0152 §5's amendment). The
 *  chip row, the chip counts, the filter and the badge glyph all go through this, so a
 *  hosted note cannot show one category and be filed under another. */
export function noteCategory(
  note: Note,
  hosts: Map<string, NoteHostRef>,
): EventCategory | undefined {
  return note.category ?? noteHost(note, hosts)?.category;
}

/** The badge glyph: the resolved category's, else the no-category fallback. `📌`
 *  (`DEFAULT_EVENT_ICON`) rather than a glyph invented for this surface. */
export function noteGlyph(note: Note, hosts: Map<string, NoteHostRef>): string {
  return noteGlyphFor(note, noteHost(note, hosts));
}

/** The same glyph, for a surface that already HOLDS the host rather than a lookup — a host's
 *  own note section knows its host as a fact (ADR-0153 §5). Same precedence, one implementation:
 *  resolving it a second way is how two surfaces end up disagreeing about one note. */
export function noteGlyphFor(note: Note, host?: NoteHostRef): string {
  const category = note.category ?? host?.category;
  return category ? iconForCategory(category) : DEFAULT_EVENT_ICON;
}

/** A note with no category still has to be findable, so it counts and filters under `other`
 *  — otherwise the one chip that could reach it is the one it is missing from. */
export const noteFilterCategory = (note: Note, hosts: Map<string, NoteHostRef>): EventCategory =>
  noteCategory(note, hosts) ?? 'other';

/** A note's searchable terms (ADR-0102's multi-field matching, ADR-0153 §3): title, body
 *  **and url** — the url is why searching `tabelog` finds a link-only note — plus its
 *  host's name, so "what did we say about the hotel" works from this screen too even
 *  though the screen itself is ungrouped. An array, not `||`-chained fields, so a future
 *  searchable facet is a push here rather than a branch in the matcher. */
export function noteSearchTerms(
  note: Note,
  hosts: Map<string, NoteHostRef>,
): (string | undefined)[] {
  return [note.title, note.body, note.url, noteHost(note, hosts)?.name];
}

export function matchesNoteQuery(
  note: Note,
  hosts: Map<string, NoteHostRef>,
  query: string,
): boolean {
  if (!query.trim()) return true;
  return matchesAnyTerm(query, noteSearchTerms(note, hosts));
}

/** The category-chip filter over the RESOLVED category, so a hosted note is filed where it
 *  visually belongs. `all` passes everything. */
export const NOTE_CATEGORY_ALL = 'all';
export type NoteCategoryFilter = EventCategory | typeof NOTE_CATEGORY_ALL;

export function matchesNoteCategory(
  note: Note,
  hosts: Map<string, NoteHostRef>,
  category: NoteCategoryFilter,
): boolean {
  return category === NOTE_CATEGORY_ALL || noteFilterCategory(note, hosts) === category;
}

/** Per-resolved-category counts for the chip row (ADR-0100 §2). Every value is initialized
 *  to 0 so the chip row's "only non-empty categories get a chip" rule has a total to read. */
export function countNotesByCategory(
  notes: Note[],
  hosts: Map<string, NoteHostRef>,
): Record<EventCategory, number> {
  const counts = Object.fromEntries(EVENT_CATEGORIES.map((c) => [c, 0])) as Record<
    EventCategory,
    number
  >;
  for (const note of notes) counts[noteFilterCategory(note, hosts)]++;
  return counts;
}

/** Newest first (ADR-0153 §2), on `createdAt` and **not** `updatedAt`: the group's memory
 *  should not shuffle under a reader because someone fixed a typo. `id` breaks ties, so the
 *  several notes one host save can write in the same millisecond hold a stable order. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id),
  );
}

/** Per-row visibility against the chip + query, through the app's ONE shared reveal
 *  derivation (ADR-0120) — never a `.filter()` on the array, which is the one-off that made
 *  the Map jump for two releases. */
export function visibleNotes(
  notes: Note[],
  hosts: Map<string, NoteHostRef>,
  category: NoteCategoryFilter,
  query: string,
): { rows: Revealed<Note>[]; nextIndex: number } {
  return revealRows(
    notes,
    (note) => matchesNoteCategory(note, hosts, category) && matchesNoteQuery(note, hosts, query),
  );
}

/** A note's line as PLAIN TEXT — for an accessible name, a sheet's title, a change-feed
 *  line. The render is the row's job (a body clamps, a url is an LTR island); this is the
 *  same precedence in one string: the title if there is one, else the body, else the url —
 *  the url as `prettyUrl` reads it, because a name read aloud has even less use for a
 *  tracking token than a name on screen. */
export function noteTitleText(note: Note): string {
  return note.title?.trim() || note.body?.trim() || prettyUrl(note.url);
}

/** "When", for a note's meta line — `לפני 4 ד׳`, `לפני 3 ימים`, `לפני שבועיים`.
 *
 *  Built on `formatDuration`, the app's ONE elapsed ladder (ADR-0114: minutes → hours →
 *  days → weeks → months → years, largest rung, rounded to nearest), rather than a second
 *  relative-time helper. `ChangeFeed`'s private `relTime` deliberately stops at hours
 *  because a 20-entry ring only ever holds recent things; a notes list holds the whole
 *  trip, so a note from last week must not read as `לפני 216 ש׳`.
 *
 *  Under a minute is "now" — the same floor the change feed uses, and the case that
 *  matters most, since it is what you see the instant you write one. **A timestamp that
 *  will not parse reads "now" as well**, through `formatDuration`'s own non-finite guard:
 *  the only row that can be in that state is one this device has just written and not yet
 *  had stamped, so "now" is the truth rather than a fallback. */
export function noteWhen(createdAt: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(createdAt)) / 60_000);
  const elapsed = formatDuration(minutes);
  return elapsed ? t.changeFeed.relTime.agoPrefix(elapsed) : t.changeFeed.relTime.now;
}

/** This host's notes, newest first — the list every host surface reads (ADR-0152 §6). Here
 *  rather than at each surface so the five hosts cannot drift on the order, and so a sixth
 *  is a `NOTE_HOST_FIELD` line and nothing else. */
export function notesForHost(notes: Note[], kind: NoteHostKind, id: string): Note[] {
  return sortNotes(notes.filter((note) => isHostedBy(note, kind, id)));
}

/** **Everything this surface shows** — its host's rows and those of every other host in its
 *  context (ADR-0172 §1). A linked booking and its event are one list; a place with exactly
 *  one relevant context shows that context's rows under its own.
 *
 *  Double-counting is impossible by construction rather than by a guard: a note carries at
 *  most one host FK (ADR-0152 §2), so it can match at most one member. */
export function notesForContext(notes: Note[], context: HostContext): Note[] {
  return sortNotes(notes.filter((note) => inContext(context, note, isHostedBy)));
}

/** The context's count, from the per-host tally a list screen already keeps. Summed rather
 *  than re-filtered because the caller asks per row. */
export function hostCountForContext(counts: Map<string, number>, context: HostContext): number {
  return context.members.reduce((total, m) => total + noteCountFor(counts, m.kind, m.id), 0);
}

/** The same sum, under its original name. It is generic over the TALLY — tasks pass their own
 *  map through it — so the neutral name above is the one new callers should use. */
export const noteCountForContext = hostCountForContext;

/** The host half of a `createNote` input — `{ bookingId: id }`, `{ documentId: id }`, … —
 *  looked up rather than spelled at the call site, which is what keeps a surface from
 *  attaching a note to the wrong field and makes the sixth host free. */
export function noteHostInput(
  kind: NoteHostKind,
  id: string,
): Partial<Record<NoteHostKey, string>> {
  return { [NOTE_HOST_FIELD[kind]]: id };
}

/** How many notes each host carries, keyed the same way `buildNoteHosts` keys its lookup.
 *  Built once per note-list change rather than filtered per row: a day of twelve events
 *  asks this twelve times, and the mark is on every row that has one. */
export function noteCountsByHost(notes: Note[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const [kind, field] of Object.entries(NOTE_HOST_FIELD) as [NoteHostKind, NoteHostKey][]) {
      const id = note[field];
      if (!id) continue;
      const key = `${kind}:${id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      break;
    }
  }
  return counts;
}

/** This host's note count, or 0. The key shape is an implementation detail of this file,
 *  so callers ask by kind and id rather than building it. */
export const noteCountFor = (counts: Map<string, number>, kind: NoteHostKind, id: string): number =>
  counts.get(`${kind}:${id}`) ?? 0;

/** **Is this note too long to read inside the list?** (ADR-0202 §9c.)
 *
 * A tap means "read this", and the app decides where: a short note lifts its clamp where it
 * sits, a long one opens on its own screen. That is state-dependent behaviour for one gesture,
 * which is a real cost — but the alternative shipped and was reported, because expanding a
 * document-length note produces a wall inside a list row and puts its verbs at the bottom of
 * it.
 *
 * **Estimated, not measured.** Measuring the rendered height first would mean rendering the
 * thing before deciding whether to render it. So this counts what the row WOULD show — the
 * flattened text, which is what `.note-body-line` receives — and turns it into a line count by
 * wrapping at `NOTE_ROW_CHARS_PER_LINE`. Counting characters alone was the first version and it
 * is wrong in a way that matters: a note of twelve short lines is twelve lines tall and barely
 * 150 characters, so it would have expanded into exactly the wall this exists to prevent.
 *
 * A note with no body never qualifies: a url-only note's row IS its url, and there is nothing
 * for a screen to add that the foot does not already carry.
 */
export function noteReadsFullScreen(note: Pick<Note, 'body'>): boolean {
  const text = flattenNoteMarkdown(note.body ?? '');
  if (!text) return false;
  const lines = text
    .split('\n')
    .reduce<number>(
      (total, line) => total + Math.max(1, Math.ceil(line.length / NOTE_ROW_CHARS_PER_LINE)),
      0,
    );
  return lines > NOTE_INLINE_MAX_LINES;
}
