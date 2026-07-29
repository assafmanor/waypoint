// Shared SVG icon primitive. The app's body font (Assistant) has no glyphs for
// symbol characters like ▾ ↩ ↺ ⬇, so the browser substitutes a fallback whose
// baseline sits low — the glyph drifts down inside its box. These SVGs render
// identically on every platform and centre cleanly. See NavArrow for the line
// nav arrows (forward/back, RTL-mirrored); this covers the non-arrow symbols.
//
// Size rides on the parent's font-size (1em), colour on currentColor, so a call
// site styles the icon by styling its container — same as the glyph it replaces.
// `dir` rotates the icon (canonical orientation points down / is upright).

export type IconName =
  | 'caret'
  | 'undo'
  | 'reset'
  | 'download'
  | 'settings'
  | 'search'
  | 'close'
  | 'locate'
  | 'frame'
  | 'pin'
  | 'external'
  | 'camera'
  | 'check'
  | 'skip'
  | 'cloud-check'
  | 'cloud-up'
  | 'cloud-bang'
  // ── The emoji sweep (ADR-0138). Every shape below replaces an emoji that was
  // drawing a CONTROL. Grouped by what they replace, not alphabetically, so the
  // sweep's boundary stays legible from the type alone.
  // Row-menu verbs.
  | 'edit'
  | 'trash'
  | 'shelf'
  | 'swap'
  | 'calendar'
  // Status marks a control or chip carries.
  | 'lock'
  | 'warn'
  | 'clock'
  | 'offline'
  | 'sync'
  // Verbs elsewhere in the app.
  | 'plus'
  | 'more'
  | 'clipboard'
  | 'budget'
  | 'ticket'
  | 'wifi'
  | 'documents'
  | 'share'
  | 'link'
  | 'upload'
  | 'navigate'
  | 'crown'
  | 'exit'
  // Bottom nav (ADR-0138 §4 — the owner's call to cross this line).
  | 'home'
  | 'map'
  | 'cards';
type Dir = 'up' | 'right' | 'down' | 'left';

// Cloud base shared by the three per-entity sync glyphs (SyncBadge, ADR-0080/0091).
// Each state appends a distinct inner mark so the SHAPE — not color — carries the
// state (accessibility): check = synced, up-arrow = pending/uploading, "!" = failed.
const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';

const PATHS: Record<IconName, string> = {
  caret: 'M5 9l7 7 7-7z',
  undo: 'M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4',
  reset: 'M3 4v6h6M3.5 15a9 9 0 1 0 2.2-9.4L3 10',
  download: 'M12 3v12m-5-5l5 5 5-5M5 20h14',
  // Cog outline + centre circle (replaces the lone ⚙ emoji-as-control, U-11).
  settings:
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  // Magnifying glass (the Index bookings-screen search control, ADR-0098) +
  // a plain X (its clear/close affordance) — replacing 🔍/✕ raw glyphs on a
  // real UI control, per "emoji are content, icons are UI" (design-language.md).
  search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
  close: 'M6 18 18 6M6 6l12 12',
  // The conventional crosshair every map app puts on its canvas — the rendered
  // map's one added control (ADR-0121 §12). A real SVG, never a raw ⌖ glyph:
  // "emoji are content, icons are UI" (design-language.md).
  locate:
    'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0',
  // Frame the filtered set (ADR-0126 §6) — the second camera control, beside
  // `locate`. Four corner brackets: every map app's fit-to-content mark, and
  // rectangular where the crosshair is round, which is what keeps the two apart at
  // a glance (the objection ADR-0109 §1 raises against a pair of glyphs is about
  // CONFUSABLE silhouettes, and these two share none).
  frame:
    'M4 9V6a2 2 0 0 1 2-2h3 M15 4h3a2 2 0 0 1 2 2v3 M20 15v3a2 2 0 0 1-2 2h-3 M9 20H6a2 2 0 0 1-2-2v-3',
  // `מפה` — show a place on OUR map (ADR-0121 §8). Deliberately the Waypoint
  // marker's own silhouette (ADR-0087: a teardrop, tip down, with a centre dot), so
  // the control wears the shape of the thing it takes you to. A real SVG, never the
  // 🗺️ emoji: emoji are content, icons are UI (design-language.md), and a row's one
  // emoji slot is already spent on the category badge (ADR-0038).
  pin: 'M12 21.5s6.5-5.9 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21.5 12 21.5Z M14.2 10.8a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0',
  // Opens OUTSIDE the app — a result row's way out to Google Maps (ADR-0134 §5). The
  // arrow-out-of-a-box every platform uses for "this leaves here", deliberately NOT a map
  // glyph: `pin` above already means "our map", and two map-shaped marks on one row would
  // compete. What this control says is where you END UP, which is the honest distinction.
  external: 'M14 4h6v6 M20 4 11 13 M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  // The badge on the avatar hero that changes your picture (ADR-0133 §6/§12): a body
  // with the raised shutter hump, plus the lens. The one affordance on a profile
  // surface that needs no label — and a real SVG, because `FilePicker` still draws 📷
  // and design-language's "emoji are content, icons are UI" forbids that on a control.
  // Adding the shape here is also the first step of the emoji sweep the backlog carries,
  // so the retrofit has something to point at.
  camera:
    'M4 8h2.5l1.4-2.2a1 1 0 0 1 .84-.46h6.52a1 1 0 0 1 .84.46L17.5 8H20a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z M15 13.2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  // WHAT HAPPENED AT A PLACE, on the map's pins (ADR-0137, drawn on the canvas from
  // session 187). The pair is deliberately the two most different silhouettes available:
  // a pin's mark is ~15px on the shipped canvas, and telling היינו from דילגנו at a
  // glance is the whole feature. Shape carries the state INDEPENDENTLY of colour — the
  // same rule the cloud family below is built on. Here the marks do also carry `--ok`/
  // `--miss` (an outcome is a status, ADR-0028), so the shape is the redundant channel
  // rather than the only one: it is what survives the tier's own quieting, and what a
  // reader who cannot separate the two hues reads instead.
  //
  // `check` is not `cloud-check`'s mark: that one is inset inside the cloud's body, this
  // one is centred in the whole box. `skip` is not `close` either, and the distinction is
  // load-bearing — `close` is a control that dismisses something, this is a statement
  // about a place. Same family of shape, two different jobs, so two names.
  check: 'M5 12.6l4.7 4.7L19 7.4',
  skip: 'M7.5 7.5l9 9 M16.5 7.5l-9 9',
  // Per-entity sync glyphs — a cloud + a distinct inner mark per state (ADR-0091).
  'cloud-check': CLOUD + ' M9.3 13.6l1.9 1.9 3.6-3.8',
  'cloud-up': CLOUD + ' M11.8 16.6v-4.6 M9.6 14l2.2-2.2 2.2 2.2',
  'cloud-bang': CLOUD + ' M11.8 11.9v2.7 M11.8 16.3v.02',

  // ══ The emoji sweep (ADR-0138) ══════════════════════════════════════════
  // Drawn to the same contract as everything above: one path, 24×24, stroke,
  // `currentColor`, upright. That last property is what the emoji never had —
  // a `danger` row now tints its icon WITH its label instead of leaving a
  // full-colour 🗑️ beside red text.

  // Pencil, tip leading. Replaces ✏️.
  edit: 'M12 20h9 M16.4 3.6a2.12 2.12 0 0 1 3 3L7.5 18.5l-4.2 1.2 1.2-4.2Z',
  // Lid, body, two tines. Replaces 🗑️.
  trash:
    'M4 6.5h16 M9 6.5V4.7a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 4.7v1.8 M6.4 6.5l.8 12.3A2 2 0 0 0 9.2 20.7h5.6a2 2 0 0 0 2-1.9l.8-12.3 M10.4 10.4v6 M13.6 10.4v6',
  // A tray with something going INTO it — `העבר למדף` is putting the thing
  // away, so the arrow is the verb and the tray is the destination. Replaces 📥.
  shelf:
    'M12 3v7.5 M8.8 7.6 12 10.8l3.2-3.2 M20 14.5v3.6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.6 M4 14.5h3.8l1.4 2h5.6l1.4-2H20',
  // Two arrows exchanging, on the BLOCK axis so RTL cannot flip the meaning (a
  // horizontal pair would read backwards). Replaces 🔄 at the `swap` sites.
  swap: 'M8 20.5V4.2 M4.8 7.4 8 4.2l3.2 3.2 M16 3.5v16.3 M12.8 16.6 16 19.8l3.2-3.2',
  // Replaces 📅 at BOTH its jobs — `schedule` (put this on a day) and the days
  // tab. One shape, because they mean the same thing.
  calendar:
    'M8 2.6v3.4 M16 2.6v3.4 M3.4 10.2h17.2 M5.4 4.3h13.2a2 2 0 0 1 2 2v13.1a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V6.3a2 2 0 0 1 2-2Z',
  // Shackle + body. The hard-commitment mark (ADR-0011), so it appears on chips
  // and warnings far more than any other shape here. Replaces 🔒.
  lock: 'M7.4 10.4V7.6a4.6 4.6 0 0 1 9.2 0v2.8 M5.8 10.4h12.4a1.4 1.4 0 0 1 1.4 1.4v8a1.4 1.4 0 0 1-1.4 1.4H5.8a1.4 1.4 0 0 1-1.4-1.4v-8a1.4 1.4 0 0 1 1.4-1.4Z',
  // Triangle + bang. Replaces ⚠️ (and `EventForm`'s ⚠︎, and `ErrorState`'s).
  warn: 'M12 3.6 22 20.4H2Z M12 9.8v4.6 M12 17.4v.02',
  // (`check` lives above, with `skip` — ADR-0137 added it for the pin's outcome
  // marks and this sweep reuses it for the bare ✓ rather than drawing a second
  // tick. A typographic character rather than an emoji, but swept on the same
  // font-fallback grounds the arrow guard used: Assistant has no glyph for it.)
  // Replaces 🕐/🕓 — the zone chip, the free-until readout, the dev clock.
  clock: 'M12 6.4V12l3.6 2.2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  // Signal arcs with a slash through them. Replaces 📡 — which was a dish, i.e.
  // the equipment rather than the state; what the banner means is "no signal".
  offline: 'M12 19.6h.02 M8.6 16.2a4.8 4.8 0 0 1 6.8 0 M5.2 12.8a9.6 9.6 0 0 1 13.6 0 M3 3l18 18',
  // Circular arrows — the "in flight" mark, deliberately NOT `swap`'s pair even
  // though both shipped as 🔄. Two meanings behind one emoji is exactly the
  // drift this sweep exists to end.
  sync: 'M20.5 5.5v5h-5 M3.5 18.5v-5h5 M19.4 10.5a7.6 7.6 0 0 0-13.3-3.2L3.5 10.5 M4.6 13.5a7.6 7.6 0 0 0 13.3 3.2l2.6-3.2',
  // Replaces ＋ (U+FF0B, fullwidth plus) — same font-fallback grounds as `check`.
  plus: 'M12 4.8v14.4 M4.8 12h14.4',
  // The kebab itself. Three dots, drawn as zero-length capped segments so the
  // round linecap IS the dot. Replaces ⋯.
  more: 'M6 12h.02 M12 12h.02 M18 12h.02',
  // ── The three section markers the first sweep left behind, because `GLYPH` had
  // them filed as content. They are not: each sits on a TILE you tap, and the
  // Home quick-action row proved it by ending up with three emoji beside one SVG
  // compass. The Index's two tiles are the same case — the nav tab that leads to
  // them is `cards`, so the tab and its destination disagreed.
  //
  // A ticket with its stub perforation. Replaces 🎫.
  ticket:
    'M3.4 8.6V6.8a1.6 1.6 0 0 1 1.6-1.6h14a1.6 1.6 0 0 1 1.6 1.6v1.8a2.2 2.2 0 0 0 0 4.4v1.8a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6v-1.8a2.2 2.2 0 0 0 0-4.4Z M14.4 5.2v1.9 M14.4 10.2v1.9 M14.4 15.1v1.9',
  // Signal arcs — `offline` above is this shape with a slash through it, which is
  // the point: the pair reads as one state and its negation.
  wifi: 'M12 19.6h.02 M8.6 16.2a4.8 4.8 0 0 1 6.8 0 M5.2 12.8a9.6 9.6 0 0 1 13.6 0 M2 9.4a14.4 14.4 0 0 1 20 0',
  // An ID page — portrait block plus lines. Replaces 🛂, which was passport CONTROL
  // signage rather than the documents themselves. The per-type badges inside the
  // section (📕 🛡️ 🎫 📄) stay emoji: those are content, one per document.
  documents:
    'M5.4 2.8h13.2a1.6 1.6 0 0 1 1.6 1.6v15.2a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6V4.4a1.6 1.6 0 0 1 1.6-1.6Z M10.6 9.4a1.9 1.9 0 1 1-3.8 0 1.9 1.9 0 0 1 3.8 0 M6.8 15.4c0-1.5 1-2.4 1.9-2.4s1.9.9 1.9 2.4 M13.6 9.2h3.6 M13.6 12.6h3.6 M13.6 16h3.6',
  // A wallet with its clasp — trip settings' daily-budget row. Replaces 💰, which
  // was the one emoji left among four SVG `ReadRow`s in the same list (ADR-0138's
  // follow-up sweep). A budget is money you are carrying, not a pile of it.
  budget:
    'M3.4 8.4a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2Z M3.4 9.6h13.2a1.6 1.6 0 0 1 1.6 1.6v3.6a1.6 1.6 0 0 1-1.6 1.6H3.4 M14.6 13.4h.02',
  // Board + clip. Replaces 📋 (copy-to-clipboard).
  clipboard:
    'M9 4.4H7.4a2 2 0 0 0-2 2v12.2a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V6.4a2 2 0 0 0-2-2H15 M9.6 2.6h4.8a.9.9 0 0 1 .9.9v1.8a.9.9 0 0 1-.9.9H9.6a.9.9 0 0 1-.9-.9V3.5a.9.9 0 0 1 .9-.9Z',
  // Three nodes joined — the share/invite verb. Replaces 💬, which was a speech
  // bubble doing a share's job.
  share:
    'M18 8.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M6 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M18 21a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 18 21Z M8.3 10.7l7.4-4.3 M8.3 13.3l7.4 4.3',
  // Two chain links. Replaces 🔗.
  link: 'M10.6 13.4a4 4 0 0 0 6 .4l2.4-2.4a4 4 0 0 0-5.6-5.6l-1.4 1.4 M13.4 10.6a4 4 0 0 0-6-.4L5 12.6a4 4 0 0 0 5.6 5.6l1.4-1.4',
  // Arrow out of a tray — `FilePicker`'s pick-a-file tile. Replaces ⬆️, and is
  // deliberately `download` mirrored so the pair reads as one family.
  upload: 'M12 16.2V3.6m-5 5 5-5 5 5M4.6 20.4h14.8',
  // A compass needle. Replaces 🧭 — the on-the-ground `ניווט` verb.
  navigate: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M15.6 8.4l-2.2 5.2-5.2 2.2 2.2-5.2Z',
  // Replaces 👑 — `MemberSheet`'s promote-to-admin.
  crown:
    'M3.4 7.2 6.8 12l5.2-6.8L17.2 12l3.4-4.8v10a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4Z',
  // A door with an arrow leading AWAY from it. Replaces 🚪 — remove-from-trip,
  // and trip settings' own leave row. Two directional decisions, both load-bearing:
  // the arrow points OUT of the frame (drawn the other way round it is the sign-IN
  // mark), and the whole thing is authored mirrored from the LTR convention, door
  // on the trailing side, because leaving moves leftward in an RTL layout. Authored
  // that way rather than transformed — this app has no LTR mode to flip back to.
  exit: 'M14.6 20.4H18.4a2 2 0 0 0 2-2V5.6a2 2 0 0 0-2-2h-3.8 M8 16.6 3.4 12 8 7.4 M3.4 12h11.2',
  // ── Bottom nav. Four shapes, one per tab (ADR-0138 §4).
  home: 'M3.4 10.2 12 3.4l8.6 6.8v9.2a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6Z M9.4 21V13h5.2v8',
  // A folded map. NOT `pin` — that shape already means "our marker" (ADR-0121
  // §8) and the tab is the whole canvas, not one place on it.
  map: 'M2.8 6.6 9 4.2v13.2l-6.2 2.4Zm6.2-2.4 6 2.4v13.2l-6-2.4Zm6 2.4 6.2-2.4v13.2L15 19.8Z',
  // A card with content, behind it a second one. Replaces 📇. The two content
  // rules are load-bearing: a bare pair of offset rectangles is the universal
  // COPY mark, and the Index is a directory, not a duplicate.
  cards:
    'M7.4 6.6V4.8a1.6 1.6 0 0 1 1.6-1.6h9.8a1.6 1.6 0 0 1 1.6 1.6v9.8a1.6 1.6 0 0 1-1.6 1.6h-1.8 M4.8 6.6h10.4a1.6 1.6 0 0 1 1.6 1.6v11a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6v-11a1.6 1.6 0 0 1 1.6-1.6Z M6.6 11.2h7 M6.6 14.8h4.2',
};
const FILLED: ReadonlySet<IconName> = new Set(['caret']);
const ROTATE: Record<Dir, number> = { down: 0, left: 90, up: 180, right: 270 };

export function Icon({
  name,
  dir,
  className = '',
}: {
  name: IconName;
  dir?: Dir;
  className?: string;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={`icon ${className}`.trim()}
      style={dir ? { transform: `rotate(${ROTATE[dir]}deg)` } : undefined}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
