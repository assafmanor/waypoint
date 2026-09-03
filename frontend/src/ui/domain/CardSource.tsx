// **A glance card's own source line** (ADR-0218's 2026-09-03 amendment §A, amending ADR-0180 §9).
//
// One component for both tenants of `מבט מהיר`, and that is the whole point. The owner's report
// was about placement — _"they should be inside the card itself, otherwise it looks a little bit
// out of place"_ — but the drawing found the sharper constraint: putting weather's line inside
// and leaving the rate's outside gives one section two grammars for one job, side by side, with
// no rule a reader could state. That is the split ADR-0078/0079/0094/0095 exist to undo, so the
// line is one component from the start rather than two that later have to be collapsed.
//
// **The label is never translated.** It is the source's own required wording, carried on the data
// (`fxRates.provider`, `forecast.provider`) — a Hebrew rendering would both break those terms and
// mean a second provider needs a copy change. `i18n/he.ts` says the same thing where the string
// would otherwise have gone.
import './card-source.css';

export interface CardSourceProps {
  /** The credit, verbatim, as the provider requires it (`Data from MET Norway`). */
  label: string;
  href: string;
}

export function CardSource({ label, href }: CardSourceProps) {
  return (
    <p className="card-src">
      <a className="card-src-link" href={href} target="_blank" rel="noopener noreferrer" dir="auto">
        {label}
      </a>
    </p>
  );
}
