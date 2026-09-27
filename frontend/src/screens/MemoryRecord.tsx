// **The record, by kind and by search** — the memory Home's reading surfaces over every row
// (ADR-0240 §4, epic 4.7, specs 2a and 2c).
//
// One row list (`memoryRecord`) read two ways. By kind: where we ate, where we slept, what we
// saw, as the Map's facets filter but as a list to read, each row with its day and what became
// of it. By search: "the ramen place" one query away, from the cover's first control. Both go
// through the app's one reveal (ADR-0120), so a chip tap or a keystroke collapses rows in place.
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

/** Lists by kind (spec 2c): one chip per kind the trip has, the fullest first. */
export function RecordKinds({ rows, ...actions }: { rows: RecordRow[] } & RecordRowActions) {
  const kinds = useMemo(() => recordKinds(rows), [rows]);
  const [picked, setPicked] = useState<EventCategory | undefined>();
  // A kind whose last row went (a settle cannot remove a row, but a peer's delete can) falls back
  // to the fullest, derived rather than reset (ADR-0101).
  const active = kinds.some((k) => k.kind === picked) ? picked! : kinds[0]?.kind;
  if (!active) return null;

  const labelOf = new Map(EVENT_CATEGORY_OPTIONS.map((option) => [option.value, option]));
  const options: Choice<EventCategory>[] = kinds.map(({ kind, count }) => ({
    value: kind,
    icon: labelOf.get(kind)!.icon,
    label: labelOf.get(kind)!.label,
    count,
  }));
  const visible = revealRows(rows, (row) => row.category === active);

  return (
    <div className="mem-kinds">
      <ChoiceGrid
        options={options}
        value={active}
        onChange={setPicked}
        layout="pills"
        ariaLabel={t.planHome.past.record.kindsLabel}
      />
      <RevealList
        className="checklist listcard"
        rows={visible.rows}
        getKey={rowKey}
        renderRow={(row) => <RecordListRow row={row} {...actions} />}
      />
    </div>
  );
}

/** The search over the whole record (spec 2a), on the app's full-screen search shell. */
export function RecordSearch({
  rows,
  tripName,
  onClose,
  ...actions
}: { rows: RecordRow[]; tripName: string; onClose: () => void } & RecordRowActions) {
  const { mode } = useMode();
  const [query, setQuery] = useState('');
  const visible = revealRows(rows, (row) => matchesRecordQuery(row, query));
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
