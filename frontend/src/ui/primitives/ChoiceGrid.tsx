// One icon+label single-select grid. The document-type picker (upload + manage
// sheets) and, in shape, the booking-type picker all render the same grid of
// tappable icon/label cards with one selected — this folds that pattern into one
// controlled primitive so it stops being copy-pasted markup. Neutral chrome only
// (selected = --cta ring), never a semantic hue (design-language color budget).
import type { CSSProperties, ReactNode } from 'react';
import { useCenterSelected } from '../../lib/useCenterSelected';
import { edgeFadeRef } from '../../lib/edge-fade';
import './choice-grid.css';

export interface Choice<T extends string> {
  value: T;
  /** Leading glyph (emoji or short symbol); decorative, hidden from a11y. An
   *  empty string omits the icon slot entirely (e.g. a plain "all" option). */
  icon: string;
  /** `pills` only — a rendered mark at the LEADING edge, where `icon` is a trailing glyph.
   *  Exists for an axis whose options are PEOPLE (the task editor's `מי אחראי`, ADR-0189):
   *  the host passes `<Avatar>`, the app's one renderer for a person (ADR-0133 §3), and
   *  the scroll, the snap, the edge mask, `useCenterSelected` and the radiogroup ARIA all
   *  keep arriving from here instead of from a second grid.
   *
   *  A `ReactNode` rather than an `AvatarPerson`, which is what the design proposed: the
   *  unassigned option is a **person-shaped absence** and there is no person to pass for
   *  it, so a typed field would have forced it to be a differently-shaped chip beside the
   *  people — saying "this is a different kind of answer" about the same question's
   *  default one. Decorative: the label beside it is the option's accessible name. */
  lead?: ReactNode;
  label: string;
  /** Trailing count badge, `pills` layout only (the Index category filter,
   *  ADR-0100 §2 — each chip carries label+icon+count). Decorative/aria-hidden
   *  like the icon, so it never changes the option's accessible name.
   *  `undefined` omits the slot entirely. */
  count?: number;
}

export function ChoiceGrid<T extends string>({
  options,
  value,
  onChange,
  columns = options.length,
  disabled = false,
  ariaLabel,
  layout = 'grid',
  compact = false,
}: {
  options: Choice<T>[];
  /** The selected value, or `undefined` for no selection yet (a single-select
   *  that starts unset — e.g. the optional event category, ADR-0109 §11). No
   *  option is highlighted until one matches. */
  value?: T;
  onChange: (value: T) => void;
  /** Cards per row. Defaults to one row of all options. Ignored in `pills` layout. */
  columns?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** `grid` (default) — a fixed CSS grid of icon-over-label cards (form pickers).
   *  `pills` — a horizontally-scrollable row of icon+label pills (the Index
   *  category filter, ADR-0098 §reuse: too many options for a fixed grid on a
   *  narrow phone). Same controlled single-select radiogroup either way. */
  layout?: 'grid' | 'pills';
  /** `pills` only — GLYPH + COUNT chips, with the label kept as each pill's
   *  accessible name (ADR-0122 §2). For a dense row over a map the glyph is already
   *  the category's whole vocabulary (ADR-0038) and the row badge and the pin carry
   *  the same one, so the word beside it states the same thing twice — which is most
   *  of why the worded row was as wide as it was. It is a flag on the primitive rather
   *  than a CSS trick precisely so the accessible name survives: hiding the label
   *  visually would leave a pill named by its count alone. An option with no glyph
   *  (`הכל`) keeps its word — there is nothing to stand in for it. */
  compact?: boolean;
}) {
  const pills = layout === 'pills';
  // The selected pill centres itself in the row (`lib/useCenterSelected`) — only in `pills`,
  // since the grid doesn't scroll and has nothing to centre in.
  const selectedRef = useCenterSelected<HTMLButtonElement>(value, { active: pills });
  return (
    <div
      // `edge-fade` only in `pills`: the grid doesn't scroll, so it has no edge to fade
      // and nothing behind one (`lib/edge-fade.ts`, ADR-0100 §6).
      className={
        'choice-grid' + (pills ? ' pills edge-fade' : '') + (pills && compact ? ' compact' : '')
      }
      ref={pills ? edgeFadeRef : undefined}
      role="radiogroup"
      aria-label={ariaLabel}
      style={pills ? undefined : ({ '--choice-cols': columns } as CSSProperties)}
    >
      {options.map((o) => {
        // Compact drops the word only where a glyph can carry it, and pays for that by
        // naming the button.
        const glyphOnly = pills && compact && o.icon !== '';
        return (
          <button
            key={o.value}
            ref={o.value === value ? selectedRef : undefined}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={glyphOnly ? o.label : undefined}
            className={(pills ? 'choice-pill' : 'choice-card') + (o.value === value ? ' on' : '')}
            onClick={() => onChange(o.value)}
            disabled={disabled}
          >
            {pills ? (
              <>
                {o.lead !== undefined && <span aria-hidden="true">{o.lead}</span>}
                {!glyphOnly && <span>{o.label}</span>}
                {o.icon !== '' && <span aria-hidden="true">{o.icon}</span>}
                {o.count !== undefined && (
                  <span className="choice-pill-count" aria-hidden="true">
                    {o.count}
                  </span>
                )}
              </>
            ) : (
              <>
                {o.icon !== '' && (
                  <span className="choice-card-ic" aria-hidden="true">
                    {o.icon}
                  </span>
                )}
                <span className="choice-card-lbl">{o.label}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
