import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// `no-restricted-syntax` is one rule key: a later config block that sets it for a
// file REPLACES the earlier list rather than adding to it. So the frontend
// selectors are named here and composed per block, instead of a block re-declaring
// the rule and silently dropping the guards it didn't mention.

// ADR-0026: real clock + dev time-travel. `new Date()`/`Date.now()` read the real
// wall clock and silently skip the dev time-travel override — always go through
// useClock() (components) or getNow() (non-hook code) instead.
const CLOCK_SELECTORS = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Use `new Date(getNow())` (lib/useClock) instead of `new Date()` — ADR-0026.',
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now'][arguments.length=0]",
    message: 'Use `getNow()` (lib/useClock) instead of `Date.now()` — ADR-0026.',
  },
];

// design-language.md "Emoji are content, icons are UI": UI arrows/carets render as
// SVGs (ui/NavArrow, ui/Icon). The Assistant body font has no glyphs for these, so
// a raw glyph falls back to a low-sitting substitute.
const GLYPHS = '[→←›‹↩↺⬇▾▴▲▼]';
const GLYPH_MESSAGE =
  'Use the <NavArrow>/<Icon> primitive, not a raw arrow/caret glyph — Assistant lacks these and the fallback renders low (design-language.md).';

const RENDERED_GLYPH_SELECTORS = [
  `JSXText[value=/${GLYPHS}/]`,
  `JSXExpressionContainer Literal[value=/${GLYPHS}/]`,
  `JSXExpressionContainer TemplateElement[value.raw=/${GLYPHS}/]`,
].map((selector) => ({ selector, message: GLYPH_MESSAGE }));

// The same rule at its source: UI copy holds no arrow glyph either, since every
// string in `i18n/` is rendered as-is. A sentence that wraps a directional label is
// split around it so the call site renders the SVG between the halves (see
// `event.conflictWarn` / `confirm.hardEditBody`). The app's ONE textual arrow is the
// route-title separator in `lib/route-title.ts` — stored data + screen-reader
// labels, where an SVG says nothing.
const COPY_GLYPH_SELECTORS = [
  `Literal[value=/${GLYPHS}/]`,
  `TemplateElement[value.raw=/${GLYPHS}/]`,
].map((selector) => ({
  selector,
  message:
    'No arrow/caret glyph in UI copy — split the sentence and render <NavArrow>/<Icon> at the call site (design-language.md).',
}));

// ADR-0138: the same rule, now enforced for CONTROL emoji and not only arrows.
// Until this, "emoji are content, icons are UI" was true of arrows/carets and
// aspirational everywhere else, which is how ✏️ 🗑️ 📥 🔄 👑 🚪 ⬆️ 📷 🔗 ended up
// drawing verbs — and how two call sites came to pass an emoji as an inline
// literal rather than through the shared constant that a sweep could find.
//
// Scoped two ways, each for a reason:
//
//  - To JSX. `constants.ts` and `i18n/` hold plain literals in `.ts` files; what
//    matters is a glyph being RENDERED, the only place the distinction shows.
//  - To non-test source (the block below carries `ignores` for tests). A fixture
//    passing `icon="📄"` is standing in for content, and a test is not shipped UI.
//
// Deliberately NOT an `icon=`-prop selector: that prop carries CONTENT at almost
// every call site (a booking's ✈️, a document's 📕). The menu case — the one that
// started this — is covered far better by the compiler, since `RowAction.icon` is
// typed `IconName` and an emoji literal simply does not typecheck.
//
// This list is now the EXPRESSION half only; the JSXText half went positional in
// the 2026-08-02 amendment (see `ANY_EMOJI` below, and why a denylist here could
// never have caught the misses that prompted it).
//
// An ALTERNATION, not a character class — and that is load-bearing. These selector
// regexes are compiled without the `u` flag, so `[📥📋…]` is a class of SURROGATE
// HALVES: every one of these lives in the U+1F4xx block and shares the lead unit
// \uD83D, which made the class match any emoji in the plane. It flagged 📍 and 🗺️
// as controls on first run. Each alternative below is a whole code point.
const CONTROL_EMOJI = '(✏|🗑|📥|🔄|↩|👑|🚪|⬆|📷|🔗|📋|💬|📡|🧭|🔒|⚠|⏱|🔍|✕|⋯)';
const CONTROL_EMOJI_MESSAGE =
  'Use <Icon name="…"> (ui/Icon) — this glyph is drawing a CONTROL, and emoji are content while icons are UI (design-language.md, ADR-0138). Content glyphs belong in constants.ts\'s GLYPH.';

// The JSXText half is POSITIONAL, not a list (ADR-0138's 2026-08-02 amendment).
// A denylist can only ever catch a regression of the glyphs already swept: the list
// above was built FROM that sweep, so 📕 🗺️ 🗓️ 📍 📖 📄 🎫 👥 sat outside it and CI
// stayed green while an empty state drew a pink book. What actually separates the two
// kinds is not which glyph it is but WHERE it is written — content flows in from
// entity data or a named constant, so a glyph typed straight into the markup is
// decoration by construction. That test needs no list and cannot go stale.
//
// Kept as a denylist on the EXPRESSION half, where content legitimately flows
// (`{e.icon ?? GLYPH.…}`, `icon={BOOKING_TYPE_ICON[b.type]}`): there, only the known
// control glyphs are wrong.
//
// Matches astral emoji as a surrogate PAIR — these regexes compile without the `u`
// flag, so a bare `[\uD800-\uDBFF]` class would match one half of every emoji and
// half of nothing else. The BMP class beside it catches the dingbats and misc
// symbols that need no pair (✈ U+2708, ⚠ U+26A0) plus the variation selector.
const ANY_EMOJI =
  '([\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\u2300-\\u23FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\uFE0F])';
const ANY_EMOJI_MESSAGE =
  'No emoji typed directly into JSX. If it marks a control, use <Icon name="…"> (ui/Icon); if it is content, name it in constants.ts (GLYPH / *_TYPE_ICON) and render that — "emoji are content, icons are UI" (design-language.md, ADR-0138).';

const CONTROL_EMOJI_SELECTORS = [
  { selector: `JSXText[value=/${ANY_EMOJI}/]`, message: ANY_EMOJI_MESSAGE },
  {
    selector: `JSXExpressionContainer Literal[value=/${CONTROL_EMOJI}/]`,
    message: CONTROL_EMOJI_MESSAGE,
  },
];

// ADR-0118: in an RTL app, `dir="ltr"` on an element that renders Hebrew lays the
// whole element out left-to-right, so the Hebrew reader meets the last logical word
// first — "9 ק״מ" reads "ק״מ 9", "+3 ש׳" reads "ש׳ 3+". `dir="auto"` is never worse
// (with no strong character, and with a Latin-led one, it resolves LTR exactly as
// before) and self-corrects the moment the content is Hebrew-led. The LTR island
// belongs to the numeric run inside the string — `ltrIsolate`/`measure` in
// `lib/bidi.ts` — not to the element wrapping it together with its unit.
//
// `<input>` is exempt: a code/time field's value is Latin by construction, and for
// date/time controls `dir` also drives the native control's own layout.
//
// The selector matches the `'ltr'` literal ANYWHERE under the attribute, not just as its
// value: the original rule keyed on `value.value` and so read past a computed one, which
// is how `BookingDetail`'s `dir={mono ? 'ltr' : undefined}` survived the ADR-0118 sweep of
// 75 sites and kept forcing a base direction onto stored content.
const BIDI_SELECTORS = [
  {
    selector:
      'JSXOpeningElement[name.name!="input"] > JSXAttribute[name.name="dir"] Literal[value="ltr"]',
    message:
      'Use dir="auto" (or no dir) — a hardcoded dir="ltr" flips a number+unit token in Hebrew ("9 ק״מ" → "ק״מ 9") and reverses stored content that is not Latin. Isolate the numeric run instead: ltrIsolate/measure in lib/bidi.ts (ADR-0118).',
  },
];

// ADR-0090 + ADR-0103: back is COMPUTED from nav state and executed as an explicit
// navigation. It must never be a blind history traversal — the stack's contents are
// unknowable (OAuth round-trips, PWA cold launches, react-router idx desync), and the
// app deliberately leaves entries behind it that are only unreachable BECAUSE nothing
// traverses: a place errand strands a `?tab=map` entry on every round trip (ADR-0103's
// 2026-07-29 session-177 amendment). A single `history.back()` in app code would walk
// into one of those and drop the user on a screen they never asked for — which is the
// exact class of bug sessions 174-177 were spent on.
//
// Documented as an anti-pattern since ADR-0090 and honoured by hand until now. It is a
// lint rule so the invariant fails loudly instead of relying on the next person having
// read the ADR.
//
// Tests are exempt by pattern: `nav-state.system-back.test.tsx` and `Map.back.test.tsx`
// call `history.back()` to SIMULATE the platform, which is the one legitimate use.
const BACK_TRAVERSAL_SELECTORS = [
  {
    selector: "CallExpression[callee.name='navigate'] > UnaryExpression[operator='-']",
    message:
      'Back is computed, never traversed (ADR-0090): resolve it through resolveBack/runBack and navigate explicitly, instead of navigate(-1).',
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(back|forward|go)$/][callee.object.name='history']",
    message:
      'Back is computed, never traversed (ADR-0090/0103): a traversal can land on an entry the app left behind (an errand strands one per round trip). Navigate explicitly.',
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(back|forward|go)$/][callee.object.property.name='history']",
    message:
      'Back is computed, never traversed (ADR-0090/0103): a traversal can land on an entry the app left behind (an errand strands one per round trip). Navigate explicitly.',
  },
  {
    selector: "MemberExpression[property.name='length'][object.name='history']",
    message:
      'History depth does not resolve back (ADR-0090) — `resolveBack` is a pure function of nav state. Never read history.length.',
  },
  {
    selector: "MemberExpression[property.name='length'][object.property.name='history']",
    message:
      'History depth does not resolve back (ADR-0090) — `resolveBack` is a pure function of nav state. Never read history.length.',
  },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '_internal/**'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // ponytail: no-any left off — conventions.md requires a comment, not a lint block
      // A leading `_` marks a binding that exists precisely so it can be LEFT OUT: an
      // omitted argument, or a key destructured only to keep it out of a `...rest` spread
      // (`mergeBookingDetails`, `outboxOpToCacheChanges`, `readMapsConfig`'s test). The
      // convention was already declared for arguments and the omit-by-destructuring case
      // is the same statement about variables, so it says both rather than carrying six
      // disable comments — or, worse, six rewrites of correct code.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // ADR-0019: Change rows are written only through ChangeService (backend/src/sync).
    // Reads of prisma.change (e.g. the snapshot's latestSeq) are fine anywhere.
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/sync/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.property.name='change'][callee.property.name=/^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/]",
          message: 'Write Change rows only via ChangeService.mutate() (ADR-0019).',
        },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: ['frontend/src/lib/useClock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...CLOCK_SELECTORS,
        ...RENDERED_GLYPH_SELECTORS,
        ...BIDI_SELECTORS,
      ],
    },
  },
  {
    // The back-traversal ban, on app code only — see BACK_TRAVERSAL_SELECTORS. Layered as
    // its own block so it composes with the frontend selectors above rather than replacing
    // them (the note at the top of this file), and so the test exemption is one `ignores`.
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: ['frontend/src/**/*.test.{ts,tsx}', 'frontend/src/lib/useClock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...CLOCK_SELECTORS,
        ...RENDERED_GLYPH_SELECTORS,
        ...CONTROL_EMOJI_SELECTORS,
        ...BIDI_SELECTORS,
        ...BACK_TRAVERSAL_SELECTORS,
      ],
    },
  },
  {
    // ADR-0146: the dev affordances (`DevTimeTravel`, the map's device-pass tuning panel)
    // are English-only surfaces that never ship — `import.meta.env.DEV` gates every mount
    // and a production build drops them with everything they import. They render inside the
    // RTL document, so the panel's own content sets `dir="ltr"`: mirrored, a column of
    // `− 14 +` steppers reads backwards and the emitted `MAP_ZOOM.PLACE: 14 → 13` block —
    // which IS the sitting's deliverable — is unreadable. ADR-0118's hazard is a Hebrew
    // number-and-unit token laid out LTR, and there is no Hebrew here for it to apply to.
    // Layered after the blocks above so it drops BIDI_SELECTORS for this tree only;
    // everything else (the clock, the glyph and emoji bans) still applies.
    files: ['frontend/src/dev/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...CLOCK_SELECTORS,
        ...RENDERED_GLYPH_SELECTORS,
        ...CONTROL_EMOJI_SELECTORS,
        ...BACK_TRAVERSAL_SELECTORS,
      ],
    },
  },
  {
    files: ['frontend/src/i18n/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...CLOCK_SELECTORS,
        ...RENDERED_GLYPH_SELECTORS,
        ...COPY_GLYPH_SELECTORS,
      ],
    },
  },
  {
    // ADR-0035: every overlay must register with the back stack so one back /
    // Escape / return-gesture closes it instead of navigating out from under it.
    // `createPortal` is the tell of a free-floating overlay, and registration
    // lives in `useOverlay` — reached for free by rendering through the single
    // `Modal` primitive (Sheet/ConfirmDialog/RowManageSheet wrap it). A bespoke
    // portal that skips this floats over the app invisibly to the back model, the
    // exact regression this rule prevents. `no-restricted-imports` is a distinct
    // rule key from the `no-restricted-syntax` block above, so the two coexist
    // without either overriding the other for these files.
    //
    // Allowlist: `Modal` (the one primitive that owns the portal) and
    // `DocumentViewer` (a full-screen viewer that legitimately needs its own
    // portal but is already back-aware — it calls `useOverlay` directly). A new
    // portal file failing this must EITHER build on `Modal` (preferred) or, if it
    // truly needs a raw portal, call `useOverlay()` and add itself here.
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: ['frontend/src/ui/primitives/Modal.tsx', 'frontend/src/ui/DocumentViewer.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-dom',
              importNames: ['createPortal'],
              message:
                'Overlays must register with the back stack (ADR-0035): render through the Modal primitive (ui/primitives/Modal — Sheet/ConfirmDialog/RowManageSheet wrap it) so back/Escape/the return gesture close them. If you truly need a bespoke portal, call useOverlay() and add the file to the allowlist in eslint.config.mjs.',
            },
          ],
        },
      ],
    },
  },
);
