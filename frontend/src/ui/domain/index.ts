// Domain-component layer barrel (review §12 target structure: ui/domain). The
// design-language lexicon made real: the departure-board hero, the day-timeline
// event card (VerbRow), the maybe-shelf card, the day-strip, the day-at-a-glance
// rail, the stat tile, and the shared list-row + manage sheet. Each composes the
// generic primitives/feedback/layout + tokens and takes ALL data via props — no
// trip-state, no screen imports (dependency direction §12). Co-located CSS loads
// with each component.

export { Board, DayRail, TransitProgress } from './Board';
export type { BoardProps, BoardVariant, BoardRow, BoardTransit, BoardNext } from './Board';

export { EventCard } from './EventCard';
export type { EventCardProps, EventKind, EventPhaseName } from './EventCard';

export { PlaceBadge } from './PlaceBadge';

export { MaybeCard } from './MaybeCard';
export type { MaybeCardProps } from './MaybeCard';

export { DayStrip } from './DayStrip';
export type { DayStripProps, DayStripDay, DayStripMode } from './DayStrip';

export { GlanceCard } from './GlanceCard';
export type { GlanceCardProps } from './GlanceCard';
// The rate on the Home (ADR-0180 §3). NOT `GlanceCard*` — that name is the
// day-at-a-glance time rail's, and this is the section it sits in, not the rail.
export { RateCard, rateLine } from './RateCard';

export { StatTile } from './StatTile';
export type { StatTileProps } from './StatTile';

export { IndexTile } from './IndexTile';
export type { IndexTileProps } from './IndexTile';

export { ListRow, RowManageSheet, RowActionList } from './ListRow';
export { NoteMark } from './NoteMark';
export { DocumentMark } from './DocumentMark';
export type { ListRowProps, RowAction, BadgeTone } from './ListRow';

export { ChangeFeed } from './ChangeFeed';
export type { ChangeFeedProps } from './ChangeFeed';

export { SettleControl } from './SettleControl';
export type { SettleOutcome, SettleVariant } from './SettleControl';

export { RouteField } from './RouteField';
export type { RouteFieldProps, RouteEnd } from './RouteField';
