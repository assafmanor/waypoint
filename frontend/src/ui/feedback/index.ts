// The shared feedback-state family (ADR-0078). One family owns the SHELL of
// empty / loading / error / status feedback; screens pass the CONTENT. Import
// primitives from here so the co-located CSS loads exactly once.
import './feedback.css';

export { BootScreen } from './BootScreen';
export { ChromeSkeleton } from './ChromeSkeleton';
export { EmptyState } from './EmptyState';
export { ErrorState } from './ErrorState';
export { HomeSkeleton } from './HomeSkeleton';
export { LoadingState } from './LoadingState';
export { Skeleton } from './Skeleton';
export { StatusBanner } from './StatusBanner';
export { SyncBadge } from './SyncBadge';
export type { FeedbackAction, BannerTone } from './types';
