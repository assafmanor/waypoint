// Shared types for the feedback-state family (ADR-0078). Kept in one place so
// EmptyState / ErrorState / StatusBanner share one action + tone vocabulary.
import type { ReactNode } from 'react';

// An optional call-to-action a feedback surface can offer. Label is the visible
// (Hebrew) copy; onClick does the thing. The app never dead-ends, so an empty or
// error state can always hand the user a next step.
export interface FeedbackAction {
  /** `ReactNode`, not `string`, because a CTA usually leads with an `<Icon>` —
   *  these labels used to be interpolated into a template string beside the copy,
   *  which is only expressible while the mark is an emoji (ADR-0138). */
  label: ReactNode;
  onClick: () => void;
}

// StatusBanner tones map to the Wave-0 status tokens (never the amber/teal/plan
// budget, which stays reserved for time/location/plan):
//   neutral → --muted · offline → --sync-pending · warn → --miss · ok → --ok
export type BannerTone = 'neutral' | 'offline' | 'warn' | 'ok';
