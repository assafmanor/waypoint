// Layout primitives barrel (review §12 target structure: ui/layout).
// Importing the co-located CSS here loads it exactly once for every consumer.
import './layout.css';

export {
  AppShell,
  BODY_FULLBLEED,
  CHROME_CONDENSED,
  CHROME_RECLAIMED,
  type AppShellProps,
} from './AppShell';
export { Screen, type ScreenProps } from './Screen';
export { Section, type SectionProps } from './Section';
export { Stack, Inline } from './Stack';
export { StickyActionBar, type StickyActionBarProps } from './StickyActionBar';
export { ResponsiveGrid, type ResponsiveGridProps } from './ResponsiveGrid';
export { TripHandoffLayer } from './TripHandoffLayer';
export type { Space, Align, Justify } from './shared';
