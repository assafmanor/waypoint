// **The record, by kind and by search** — the memory Home's reading surfaces over every row
// (ADR-0240 §4, epic 4.7, specs 2a and 2c).
//
// One row list (`memoryRecord`) read in one place, the search: "the ramen place" one query away
// from the cover's first control, and where we ate, slept or what we saw one chip away. The Home
// keeps only the kinds' counts, each a way into the search on its kind (owner, 2026-09-27: the
// list of the fullest kind was most of the page). The rows go through the app's one reveal
// (ADR-0120), so a chip tap or a keystroke collapses rows in place.
import { useMemo, useState } from 'react';
import type { EventCategory } from '@waypoint/shared';
import { DOT_SEPARATOR } from '../constants';
import { t } from '../i18n/he';
import { autoIsolate } from '../lib/bidi';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { countVisible, revealRows } from '../lib/filter-reveal';
import { matchesRecordQuery, recordKinds, type RecordRow } from '../lib/memory-home';
import { useMode } from '../state/mode-state';
import { ListRow } from '../ui/domain/ListRow';
import { EmptyState } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { ChoiceGrid, type Choice } from '../ui/primitives/ChoiceGrid';
import { RevealList } from '../ui/primitives/RevealList';
import { SearchOverlay } from '../ui/primitives/SearchOverlay';

export interface RecordRowActions {
  onOpenDay: (date: string) => void;
  /** Shows the row's place on the Map, when it has one the Map can find. */
  toMap: (row: RecordRow) => (() => void) | undefined;
}

function RecordListRow({ row, onOpenDay, toMap }: { row: RecordRow } & RecordRowActions) {
  return (
    <ListRow
      icon={row.icon}
      title={autoIsolate(row.event.title)}
      openLabel={row.event.title}
      meta={
        <>
          {row.subject}
          {row.outcome === 'skipped' && (
            <>
              {` ${DOT_SEPARATOR} `}
              <span className="tag-skip">{t.event.skipped}</span>
            </>
          )}
          {row.outcome === 'open' && ` ${DOT_SEPARATOR} ${t.planHome.past.record.open}`}
        </>
      }
      onOpen={() => onOpenDay(row.event.date)}
      onShowOnMap={toMap(row)}
    />
  );
}

const rowKey = (row: RecordRow) => row.event.id;

/** The search's `הכל` chip, prefixed so it can never collide with an `EventCategory` (the same
 *  sentinel shape as `NO_CATEGORY`). */
const RECORD_KIND_ALL = '@all' as const;
type RecordKind = EventCategory | typeof RECORD_KIND_ALL;

/** The kind chips, as `ChoiceGrid` pills (the Index's notes filter is the model): `הכל` first when
 *  `all` is given, then one per kind the trip has, the fullest first. */
function kindOptions(rows: readonly RecordRow[], all?: string): Choice<RecordKind>[] {
  const labelOf = new Map(EVENT_CATEGORY_OPTIONS.map((option) => [option.value, option]));
  return [
    ...(all ? [{ value: RECORD_KIND_ALL, icon: '', label: all, count: rows.length }] : []),
    ...recordKinds(rows).map(({ kind, count }) => ({
      value: kind,
      icon: labelOf.get(kind)!.icon,
      label: labelOf.get(kind)!.label,
      count,
    })),
  ];
}

/**
 * **By kind, as a way in** (spec 2c; owner, 2026-09-27). The counts are what the section says
 * about the trip; the rows are the search's, so a chip opens it filtered to that kind rather than
 * printing every waterfall on the Home. No chip is `on`: nothing here is filtered.
 */
export function RecordKinds({
  rows,
  onPick,
}: {
  rows: RecordRow[];
  onPick: (kind: EventCategory) => void;
}) {
  const options = useMemo(() => kindOptions(rows), [rows]);
  if (options.length === 0) return null;
  return (
    <div className="mem-kinds mem-kinds-entry">
      <ChoiceGrid
        options={options}
        onChange={(kind) => onPick(kind as EventCategory)}
        layout="pills"
        ariaLabel={t.planHome.past.record.kindsLabel}
      />
    </div>
  );
}

/** The search over the whole record (spec 2a), on the app's full-screen search shell. */
export function RecordSearch({
  rows,
  tripName,
  kind: initialKind = RECORD_KIND_ALL,
  onClose,
  ...actions
}: {
  rows: RecordRow[];
  tripName: string;
  /** The kind a Home chip opened the search on; the chips above the results can widen it. */
  kind?: RecordKind;
  onClose: () => void;
} & RecordRowActions) {
  const { mode } = useMode();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<RecordKind>(initialKind);
  const options = useMemo(() => kindOptions(rows, t.planHome.past.record.kindsAll), [rows]);
  // A kind whose last row went (a peer's delete) falls back to all, derived rather than reset.
  const kind = options.some((option) => option.value === picked) ? picked : RECORD_KIND_ALL;
  const visible = revealRows(
    rows,
    (row) => (kind === RECORD_KIND_ALL || row.category === kind) && matchesRecordQuery(row, query),
  );
  const copy = t.planHome.past.record.search;
  return (
    <SearchOverlay
      title={copy.modeTitle}
      contextLabel={tripName}
      mode={mode}
      finished
      query={query}
      onQueryChange={setQuery}
      placeholder={copy.placeholder}
      clearLabel={copy.clear}
      backAria={copy.backAria}
      onClose={onClose}
    >
      <div className="mem-kinds">
        <ChoiceGrid
          options={options}
          value={kind}
          onChange={setPicked}
          layout="pills"
          ariaLabel={t.planHome.past.record.kindsLabel}
        />
      </div>
      {countVisible(visible.rows) > 0 ? (
        <RevealList
          className="checklist listcard"
          rows={visible.rows}
          getKey={rowKey}
          // A row opens its day, which is a navigation: the search closes on the way.
          renderRow={(row) => (
            <RecordListRow
              row={row}
              onOpenDay={(date) => {
                onClose();
                actions.onOpenDay(date);
              }}
              toMap={(r) => {
                const go = actions.toMap(r);
                return (
                  go &&
                  (() => {
                    onClose();
                    go();
                  })
                );
              }}
            />
          )}
        />
      ) : (
        <EmptyState icon={<Icon name="search" />} title={copy.noResults} />
      )}
    </SearchOverlay>
  );
}
