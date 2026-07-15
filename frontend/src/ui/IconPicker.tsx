// Icon picker (ADR-0038): a leading chip that opens a panel of curated glyphs.
// Two shapes from one component:
//   • default (events) — the categorised ICON_SET (filter tabs + saved-category
//     readout). Picking reports the glyph AND its canonical EventCategory.
//   • trip — country flags (searchable) + the vibe clusters below, no category
//     (a trip has no category). Flags come from `destinations`; the archetype
//     `flatClusters` render with subtle spacing, no labels.
// Neutral chrome — selection is an ink fill, never a semantic hue (amber/teal/
// violet stay reserved). Controlled: the host owns the value. Design ref:
// mockups/event-item-icons-v1.html.
import { useEffect, useId, useRef, useState } from 'react';
import {
  ICON_SET,
  categoryForIcon,
  flagFromCode,
  searchDestinations,
  searchVibeIcons,
  type Destination,
  type EventCategory,
} from '@waypoint/shared';
import { t } from '../i18n/he';

const ALL = 'all';

export function IconPicker({
  icon,
  onChange,
  ariaLabel,
  flatClusters,
  destinations,
}: {
  icon: string;
  onChange: (icon: string, category: EventCategory | undefined) => void;
  ariaLabel?: string;
  // Trip mode: archetype vibe clusters (spaced, no labels) shown first; flags last.
  flatClusters?: readonly (readonly string[])[];
  // Trip mode: searchable country flags. Presence switches the picker to trips.
  destinations?: readonly Destination[];
}) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const tripMode = destinations != null;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const toggle = () => {
    setOpen((v) => !v);
    setQuery('');
  };

  // Trip picks carry no category; event picks derive it from the glyph.
  const pick = (glyph: string) => {
    onChange(glyph, tripMode ? undefined : categoryForIcon(glyph));
    setOpen(false);
  };

  const cell = (glyph: string, label?: string) => (
    <button
      key={label ? `${label}-${glyph}` : glyph}
      type="button"
      className={'icon-cell' + (glyph === icon ? ' sel' : '')}
      aria-pressed={glyph === icon}
      aria-label={label}
      title={label}
      onClick={() => pick(glyph)}
    >
      {glyph}
    </button>
  );

  const groups = activeCat === ALL ? ICON_SET : ICON_SET.filter((g) => g.id === activeCat);
  const currentCategory = categoryForIcon(icon);
  // Trip search covers vibe glyphs AND flags; vibe icons render first, flags last.
  const searching = tripMode && query.trim().length > 0;
  const vibeMatches = searching ? searchVibeIcons(query) : [];
  const flagMatches = tripMode ? searchDestinations(query) : [];

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        type="button"
        className={'icon-chip' + (open ? ' open' : '')}
        aria-label={ariaLabel ?? t.iconPicker.open}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        {icon}
      </button>

      {open && (
        <div className="icon-panel" id={panelId} role="dialog" aria-label={t.iconPicker.title}>
          <div className="icon-panel-head">
            <span className="lbl">{t.iconPicker.title}</span>
            {!tripMode && currentCategory && (
              <span className="cat-readout">
                {t.iconPicker.categoryReadout(t.iconPicker.categories[currentCategory])}
              </span>
            )}
          </div>

          {tripMode ? (
            <>
              <div className="icon-search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.iconPicker.searchPlaceholder}
                  aria-label={t.iconPicker.searchPlaceholder}
                />
              </div>
              <div className="icon-grid-scroll">
                {searching ? (
                  <>
                    {/* Vibe glyph matches first… */}
                    {vibeMatches.length > 0 && (
                      <div className="icon-grid">{vibeMatches.map((g) => cell(g))}</div>
                    )}
                    {/* …then flag matches, separated when both are present. */}
                    {flagMatches.length > 0 && (
                      <div className={'icon-grid' + (vibeMatches.length > 0 ? ' icon-sep' : '')}>
                        {flagMatches.map((d) => cell(flagFromCode(d.code), d.he))}
                      </div>
                    )}
                    {vibeMatches.length === 0 && flagMatches.length === 0 && (
                      <div className="icon-empty">{t.iconPicker.noMatch}</div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Default: the vibe clusters first (spaced), flags last. */}
                    {flatClusters?.map((cluster, i) => (
                      <div className="icon-grid icon-cluster" key={i}>
                        {cluster.map((g) => cell(g))}
                      </div>
                    ))}
                    <div className="icon-grid icon-sep">
                      {flagMatches.map((d) => cell(flagFromCode(d.code), d.he))}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="icon-cats">
                <button
                  type="button"
                  className={'icon-cat' + (activeCat === ALL ? ' on' : '')}
                  onClick={() => setActiveCat(ALL)}
                >
                  {t.iconPicker.all}
                </button>
                {ICON_SET.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={'icon-cat' + (activeCat === g.id ? ' on' : '')}
                    onClick={() => setActiveCat(g.id)}
                  >
                    {t.iconPicker.groups[g.id as keyof typeof t.iconPicker.groups]}
                  </button>
                ))}
              </div>
              <div className="icon-grid-scroll">
                {groups.map((g) => (
                  <div key={g.id}>
                    {activeCat === ALL && (
                      <div className="icon-cat-label">
                        {t.iconPicker.groups[g.id as keyof typeof t.iconPicker.groups]}
                      </div>
                    )}
                    <div className="icon-grid">{g.icons.map((glyph) => cell(glyph))}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
