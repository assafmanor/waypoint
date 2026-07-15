// Icon picker (ADR-0038): a leading chip that opens a full-width panel of the
// curated ICON_SET, grouped and category-filterable. Picking a glyph reports
// both the glyph and its canonical EventCategory (categoryForIcon) so the host
// can persist the semantic category alongside the badge. Neutral chrome —
// selection is an ink fill, never a semantic hue (amber/teal/violet stay
// reserved). Controlled: the host owns the value. Design ref:
// mockups/event-item-icons-v1.html.
import { useEffect, useId, useRef, useState } from 'react';
import { ICON_SET, categoryForIcon, type EventCategory } from '@waypoint/shared';
import { t } from '../i18n/he';

const ALL = 'all';

export function IconPicker({
  icon,
  onChange,
  ariaLabel,
}: {
  icon: string;
  onChange: (icon: string, category: EventCategory | undefined) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  const pick = (glyph: string) => {
    onChange(glyph, categoryForIcon(glyph));
    setOpen(false);
  };

  const groups = activeCat === ALL ? ICON_SET : ICON_SET.filter((g) => g.id === activeCat);
  const currentCategory = categoryForIcon(icon);

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        type="button"
        className={'icon-chip' + (open ? ' open' : '')}
        aria-label={ariaLabel ?? t.iconPicker.open}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </button>

      {open && (
        <div className="icon-panel" id={panelId} role="dialog" aria-label={t.iconPicker.title}>
          <div className="icon-panel-head">
            <span className="lbl">{t.iconPicker.title}</span>
            {currentCategory && (
              <span className="cat-readout">
                {t.iconPicker.categoryReadout(t.iconPicker.categories[currentCategory])}
              </span>
            )}
          </div>

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
                <div className="icon-grid">
                  {g.icons.map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      className={'icon-cell' + (glyph === icon ? ' sel' : '')}
                      aria-pressed={glyph === icon}
                      onClick={() => pick(glyph)}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
