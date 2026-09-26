// The archive banner: one calm line above a surface that has ended, read-only. Trip's past day
// (ADR-0029/0040, heading shortened by ADR-0219 §2) and a finished trip's Index (ADR-0240 §6)
// are its two hosts; the day keeps its `חזרה להיום`, the Index has no today to go back to.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import './archive-banner.css';

export function ArchiveBanner({
  label,
  action,
  memory,
}: {
  label: ReactNode;
  /** The trailing control, when the surface has somewhere to go back to. */
  action?: ReactNode;
  /** A finished trip's banner, on the archive's wash rather than --paper (ADR-0240 §6). */
  memory?: boolean;
}) {
  return (
    <div className={`archive-banner${memory ? ' is-memory' : ''}`}>
      <span className="ab-ic" aria-hidden="true">
        <Icon name="archive" />
      </span>
      <span className="ab-main">{label}</span>
      {action}
    </div>
  );
}
