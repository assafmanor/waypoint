// Documents section on the Index (ADR-0047/0049/0052/0056/0058): grouped by type,
// upload + view + per-row manage ("⋯"). Documents ride the trip snapshot and are a
// live reactive list (ADR-0058) — a peer's upload/rename/delete and our own writes
// (via the WS self-echo) reflect live, and the list reads offline like every other
// snapshot entity. Queued uploads (ADR-0056) render as pending "uploading" rows
// straight from the outbox, so they survive a reopen and reconcile to the real row
// once flushed. The title/encrypted-badge header lives in IndexDocumentsView's
// merged `idx-head` row now (ADR-0100 Consequences), not here — this component
// is content only.
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { type DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { usePendingUploads, useIsOffline } from '../lib/outbox';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { ListRow, NoteMark } from './domain';
import { noteCountFor, noteCountsByHost } from '../lib/notes';
import {
  countDocumentsByType,
  countVisibleDocuments,
  visibleDocumentGroups,
  withPendingUploads,
  DOCUMENT_TYPE_ALL,
  type DocumentRevealGroup,
  type DocumentTypeFilter,
} from '../lib/documents';
import { overlayOriginOffset } from '../lib/motion';
import { formatBytes } from '../lib/bytes';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { DocumentViewer } from './MediaViewer';
import { DocumentManageSheet } from './DocumentManageSheet';
import { Spinner } from './Spinner';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { RevealList, RevealRow } from './primitives/RevealList';
import { SearchOverlay } from './primitives/SearchOverlay';
import { EmptyState } from './feedback';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';
import { Icon } from './Icon';

export function DocumentsSection({
  initialDocumentId,
  filter = DOCUMENT_TYPE_ALL,
  onFilterChange,
}: {
  initialDocumentId?: string;
  /** The type chip in force. **Owned by `IndexDocumentsView`, not here** (ADR-0052 §7): back
   *  must peel the filter before it leaves the screen (ADR-0102), and that has to be the same
   *  handler the header's back arrow runs — so the state lives with the one `useBackLayer`
   *  and the back row, and this component is told. Defaulted so the section still renders
   *  unfiltered anywhere it is mounted without a screen around it. */
  filter?: DocumentTypeFilter;
  onFilterChange?: (filter: DocumentTypeFilter) => void;
} = {}) {
  const { trip, documents, notes } = useTrip();
  const { mode } = useMode();
  // Built once per note-list change rather than filtered per row (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<DocumentSummary | null>(null);
  // Where the viewer should appear to grow from — measured off the row at the moment it
  // is tapped, because the card has not been laid out yet and the row is about to be
  // covered. `null` for the deep link below, which has no row (ADR-0140's amendment).
  const [viewFrom, setViewFrom] = useState<number | null>(null);
  // Runs once against the id this screen was mounted with — a note about a document sends
  // you here (ADR-0153 §8's way-in amendment), and the id is spent on arrival. A fresh mount
  // is what re-arms it, exactly as the bookings screen's `initialBookingId` works.
  useEffect(() => {
    if (!initialDocumentId) return;
    const target = documents.find((d) => d.id === initialDocumentId);
    if (target) {
      setViewing(target);
      setViewFrom(null);
    }
    // The id is the trigger, deliberately once — a fresh mount handles the next deep link,
    // exactly as `IndexBookingsView`'s does.
  }, [initialDocumentId]);
  const [managing, setManaging] = useState<DocumentSummary | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const pending = usePendingUploads(trip.id);

  // Merge the live list with queued uploads not yet reflected server-side; a Set of
  // pending ids drives the per-row "uploading" affordance. The merge itself is shared
  // (`withPendingUploads`) — the attach slot is its second reader (ADR-0173 §5).
  const serverIds = new Set(documents.map((d) => d.id));
  const allDocs = withPendingUploads(documents, pending);
  const pendingIds = new Set(allDocs.filter((d) => !serverIds.has(d.id)).map((d) => d.id));

  const typeCounts = countDocumentsByType(allDocs);
  // A chip whose last document was deleted (or re-typed out from under a still-selected
  // filter) falls back to "all" rather than filtering against a chip that is no longer
  // shown — derived, not a reset effect (ADR-0101).
  const activeFilter: DocumentTypeFilter =
    filter !== DOCUMENT_TYPE_ALL && typeCounts[filter] === 0 ? DOCUMENT_TYPE_ALL : filter;

  const groups = visibleDocumentGroups(allDocs, activeFilter, query);
  const matchCount = countVisibleDocuments(groups);
  // **Search spans every type regardless of the chip** (ADR-0102) — it is an escape hatch
  // from the current filter, not a continuation of it.
  const searchGroups = visibleDocumentGroups(allDocs, DOCUMENT_TYPE_ALL, query);
  const searchMatchCount = countVisibleDocuments(searchGroups);

  const isEmpty = allDocs.length === 0;

  // Only a type that HAS a document gets a chip (ADR-0101); `הכל` always does. Worded rather
  // than `compact`: the owner asked for the row "where category titles are also shown", which
  // is the bookings density — and since 2026-08-21 the notes row is worded too, leaving
  // `compact` to the one strip ADR-0122 §2 argued it for, the Map's.
  const typeOptions: Choice<DocumentTypeFilter>[] = [
    { value: DOCUMENT_TYPE_ALL, icon: '', label: t.docs.filter.all, count: allDocs.length },
    ...Object.entries(typeCounts)
      .filter(([, n]) => n > 0)
      .map(([ty, n]) => {
        const type = ty as keyof typeof typeCounts;
        return {
          value: type as DocumentTypeFilter,
          icon: DOCUMENT_TYPE_ICON[type],
          label: t.docs.type[type],
          count: n,
        };
      }),
  ];

  const closeSearch = () => {
    setSearchMode(false);
    setQuery('');
  };

  const renderGroups = (revealed: DocumentRevealGroup[]) =>
    revealed.map((group) => (
      // **The group collapses as a whole when nothing in it matches** — heading and card
      // frame included — through the same `RevealRow` its rows ride (ADR-0120). Not
      // `groups.filter(...)`: that pops a heading out with no animation while the rows
      // beside it collapse, which is the one-off that ADR exists to end.
      <RevealRow key={group.type} visible={group.visible > 0} delayMs={0}>
        <div className="doc-group">
          <div className="gt">{t.docs.group[group.type]}</div>
          <RevealList
            className="listcard"
            rows={group.rows}
            getKey={(d) => d.id}
            renderRow={(d) => (
              <DocumentRow
                doc={d}
                isPending={pendingIds.has(d.id)}
                notes={noteCountFor(noteCounts, 'document', d.id)}
                onOpen={(e) => {
                  setViewFrom(overlayOriginOffset(e.currentTarget));
                  setViewing(d);
                }}
                onManage={() => setManaging(d)}
              />
            )}
          />
        </div>
      </RevealRow>
    ));

  return (
    <>
      {/* Hidden (not merely covered) while search is open: `SearchOverlay` renders the same
          rows in its own list, and leaving this mounted underneath duplicates every row for
          assistive tech — the same reasoning as the bookings and notes screens. */}
      {!isEmpty && !searchMode && (
        <div className="filter-row">
          <ChoiceGrid
            options={typeOptions}
            value={activeFilter}
            onChange={(next) => onFilterChange?.(next)}
            layout="pills"
            ariaLabel={t.docs.filter.categoryLabel}
          />
          <button
            type="button"
            className="search-icon-btn"
            aria-label={t.docs.search.button}
            onClick={() => setSearchMode(true)}
          >
            <Icon name="search" />
          </button>
        </div>
      )}

      {!isEmpty && !searchMode && (
        <button type="button" className="addbtn" onClick={() => setUploading(true)}>
          <Icon name="plus" /> {t.docs.add}
        </button>
      )}

      {isEmpty && (
        <div className="empty-card doc">
          {/* Not `DOCUMENT_TYPE_ICON.passport`: that is one document's badge, and
              borrowing it here made an empty SECTION announce itself as a passport. */}
          <div className="ei" aria-hidden="true">
            <Icon name="documents" />
          </div>
          <div className="et">{t.docs.emptyTitle}</div>
          <div className="es">{t.docs.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setUploading(true)}>
            <span className="plus">
              <Icon name="plus" />
            </span>{' '}
            {t.docs.emptyAdd}
          </button>
        </div>
      )}

      {!isEmpty &&
        !searchMode &&
        (matchCount > 0 ? (
          renderGroups(groups)
        ) : (
          // "Nothing matches" offers no action, unlike the empty section above: the control
          // that fixes it — the chip — is already on screen (ADR-0101).
          <EmptyState icon={<Icon name="search" />} title={t.docs.filter.noResults} />
        ))}

      {searchMode && (
        <SearchOverlay
          title={t.docs.search.modeTitle}
          contextLabel={trip.name}
          mode={mode}
          query={query}
          onQueryChange={setQuery}
          placeholder={t.docs.search.placeholder}
          clearLabel={t.docs.search.clear}
          backAria={t.docs.search.backAria}
          onClose={closeSearch}
        >
          {/* Re-establishes the `.index` ancestor the scoped row/card/group rules expect —
              `SearchOverlay` portals to document.body, outside the real subtree. */}
          <div className="index">
            {searchMatchCount > 0 ? (
              // **The results are the screen's own grouped shape**, not a flat list of their
              // own (ADR-0052 §7): the category title the search was asked to show is the
              // group heading that already exists, so there is no second renderer and no CSS.
              renderGroups(searchGroups)
            ) : (
              <EmptyState icon={<Icon name="search" />} title={t.docs.search.noResults} />
            )}
          </div>
        </SearchOverlay>
      )}

      {uploading && <DocumentUploadSheet tripId={trip.id} onClose={() => setUploading(false)} />}
      {viewing && (
        <DocumentViewer
          tripId={trip.id}
          doc={viewing}
          originY={viewFrom}
          onClose={() => setViewing(null)}
        />
      )}
      {managing && (
        <DocumentManageSheet tripId={trip.id} doc={managing} onClose={() => setManaging(null)} />
      )}
    </>
  );
}

// One document row. A queued upload and a committed row share one grammar now
// (ADR-0092): both carry the connected cloud sync marker (cloud-up while the
// upload is queued/in-flight, silent once synced) and fade while pending. A
// queued upload keeps a progress affordance in its trailing slot — a spinner
// while the flush is genuinely in flight (online), a static "waiting" when
// offline, since nothing is uploading until the network returns.
function DocumentRow({
  doc: d,
  isPending,
  notes,
  onOpen,
  onManage,
}: {
  doc: DocumentSummary;
  isPending: boolean;
  /** How many notes this document carries (ADR-0152 §6): a mark on the row, never a body. */
  notes: number;
  /** Carries the click through to `ListRow`, so the caller can measure the row the
   *  viewer should grow out of. */
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  onManage: () => void;
}) {
  const offline = useIsOffline();
  const unsynced = useUnsynced(d.id);
  return (
    <ListRow
      icon={DOCUMENT_TYPE_ICON[d.type]}
      onOpen={onOpen}
      openLabel={d.title}
      disabled={isPending}
      title={d.title}
      // The document row is the one host with no meta line of its own, so the mark brings
      // one — and costs no height, because the row's height is set by its 36px badge and a
      // title + an 11.5px meta line still measure under it (pinned in e2e, since jsdom
      // reports every rect as zero).
      meta={notes > 0 ? <NoteMark count={notes} /> : undefined}
      unsynced={unsynced}
      right={
        isPending ? (
          <span className="doc-uploading">
            {offline ? (
              t.docs.upload.queued
            ) : (
              <>
                <Spinner /> {t.docs.upload.saving}
              </>
            )}
          </span>
        ) : (
          <>
            <span className="size" dir="auto">
              {formatBytes(d.sizeBytes)}
            </span>
            <span className="doc-lock" aria-hidden="true">
              <Icon name="lock" />
            </span>
          </>
        )
      }
      sync={<EntitySyncBadge id={d.id} />}
      onManage={isPending ? undefined : onManage}
      manageLabel={t.docs.manage.actions}
    />
  );
}
