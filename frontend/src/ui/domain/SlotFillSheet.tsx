// **"Which idea fits this slot?"** — one sheet, two questions (ADR-0161 §6).
//
// It was `GapFillSheet`, inside `PlanDay`, and it answered one of them: pick a shelf idea for
// a gap, or start a fresh event there. The other question is `החלף`, which used to `skip` the
// event and post a toast telling you to go and find a replacement yourself — so the verb
// emptied the slot and then left. Owner: it is _"confusing and hard to understand how to
// use."_
//
// They are the same question, and this is the same sheet: the shelf's ideas **ranked against
// this slot** (`rankIdeas` + `slotStops`, ADR-0151's ranking, which the gap fill already ran),
// each with its reason, plus `אירוע חדש`. Only the header differs — a gap names the slot,
// because it has no other name; a replacement names the event being displaced, because that is
// what you are deciding about. A second sheet here would have drifted on its ranking, its cap,
// its search threshold and its empty state, which is the app's sixth instance of that rule.
//
// `ui/domain/`: presentational, every value via props. The ranking happens in `lib/`, so the
// two hosts cannot disagree about the order; what a pick DOES is the host's (a gap schedules,
// a replacement replaces — one write and one undo either way).
import { useState } from 'react';
import { matchesAnyTerm, type MaybeItem } from '@waypoint/shared';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { SearchField } from '../primitives/SearchField';
import { RevealList } from '../primitives/RevealList';
import { countVisible, revealRows } from '../../lib/filter-reveal';
import { SLOT_FILL_CAP, SLOT_FILL_SEARCH_AT } from '../../constants';
import { reasonText, type RankedIdea } from '../../lib/shelf';
import type { DayNaming } from '../../lib/time';
import type { Mode } from '../../lib/mode';
import { t } from '../../i18n/he';
import './slot-fill-sheet.css';

export function SlotFillSheet({
  title,
  sub,
  mode,
  naming,
  ideas,
  glyph,
  onPickIdea,
  onNewEvent,
  onClose,
}: {
  /** The sheet's header, in the host's words — `t.slotFill.gapTitle` / `replaceTitle`. */
  title: string;
  /** A line under the list's question, where the host has something to say about the slot:
   *  what a replacement inherits. Absent on a gap fill, which said it in the header. */
  sub?: string;
  /** Which mode is showing this. **Not decoration** — the accent is plan violet in Plan mode
   *  and the neutral `--cta` in Trip mode (root rule 4, ADR-0028), and a `Modal` portals
   *  outside `.app`, so the surface has to carry `data-mode` itself for CSS to see it. Same
   *  mechanism, and the same reason, as `.header`/`.mode-chrome`. */
  mode: Mode;
  /** The slot's day, which is what makes a reason readable ("מחר", "היום"). */
  /** How a day is named in a ranking reason (`dayLabel`) — anchored on the slot's own
   *  day, so a live trip's "מחר" is the day after the one being filled. */
  naming: DayNaming;
  /** Already ranked against this slot's own neighbours, each with its reason. */
  ideas: RankedIdea[];
  /** **The glyph a row shows**, resolved by the host (`ideaGlyph`) rather than read off the
   *  idea here: an idea's own icon is only the first rung of the chain — its place's pick and
   *  its category are the next two — and this layer takes all data via props, so it cannot
   *  look a place up. Required, not defaulted to `item.icon`: a host that forgot it would
   *  quietly show the shelf's `💡` beside a categorised pin, which is the defect
   *  ADR-0165 §4's amendment is about. */
  glyph: (item: MaybeItem) => string;
  onPickIdea: (m: MaybeItem) => void;
  onNewEvent: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  // A control that only appears once it is needed: a shelf of six never grows a
  // search box. Past the threshold the cap is what keeps the sheet a decision
  // rather than a list, and `expanded` is the way past it.
  const searchable = ideas.length > SLOT_FILL_SEARCH_AT;
  const searching = query.trim().length > 0;
  const shown = searching || expanded ? ideas : ideas.slice(0, SLOT_FILL_CAP);
  const hidden = ideas.length - shown.length;

  // The shared reveal (ADR-0120), not a `.filter()`: a row that stops matching
  // collapses in place instead of being dropped from the array.
  const { rows } = revealRows(shown, ({ item }) => matchesAnyTerm(query, [item.title]));

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="slotfill" data-mode={mode}>
        {sub && <div className="slotfill-sub">{sub}</div>}
        {searchable && (
          <SearchField
            className="slotfill-search"
            value={query}
            onChange={setQuery}
            placeholder={t.slotFill.search}
            clearLabel={t.slotFill.searchClear}
          />
        )}
        <RevealList
          rows={rows}
          className="slotfill-list"
          getKey={({ item }) => item.id}
          renderRow={({ item: m, reason }) => (
            <button className="slotfill-row" onClick={() => onPickIdea(m)}>
              <span className="slotfill-ic">{glyph(m)}</span>
              <span className="slotfill-main">
                <span className="slotfill-t">{m.title}</span>
                {/* The ranking REASON, never a score and never a star: it says which
                    fact put this row here, so a wrong order is arguable instead of
                    magic (ADR-0151 §8). */}
                <span className="slotfill-m">{reasonText(reason, naming)}</span>
              </span>
              <span className="slotfill-add">
                <Icon name="plus" />
              </span>
            </button>
          )}
        />
        {countVisible(rows) === 0 && <div className="slotfill-empty">{t.slotFill.empty}</div>}
        {hidden > 0 && (
          <button className="slotfill-more" onClick={() => setExpanded(true)}>
            {t.slotFill.all(ideas.length)}
          </button>
        )}
        <button className="slotfill-new" onClick={onNewEvent}>
          <Icon name="plus" /> {t.actions.newEvent}
        </button>
      </div>
    </Sheet>
  );
}
