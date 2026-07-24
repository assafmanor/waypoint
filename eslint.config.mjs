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

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', '_internal/**'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // ponytail: no-any left off — conventions.md requires a comment, not a lint block
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
      'no-restricted-syntax': ['error', ...CLOCK_SELECTORS, ...RENDERED_GLYPH_SELECTORS],
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
