import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
    // ADR-0026: real clock + dev time-travel. `new Date()`/`Date.now()` read the
    // real wall clock and silently skip the dev time-travel override — always go
    // through useClock() (components) or getNow() (non-hook code) instead.
    files: ['frontend/src/**/*.{ts,tsx}'],
    ignores: ['frontend/src/lib/useClock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use `new Date(getNow())` (lib/useClock) instead of `new Date()` — ADR-0026.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now'][arguments.length=0]",
          message: 'Use `getNow()` (lib/useClock) instead of `Date.now()` — ADR-0026.',
        },
        {
          // design-language.md "Emoji are content, icons are UI": UI arrows/carets
          // render as SVGs (ui/NavArrow, ui/Icon). The Assistant body font has no
          // glyphs for these, so a raw glyph falls back to a low-sitting substitute.
          selector: 'JSXText[value=/[→←›‹↩↺⬇▾▴▲▼]/]',
          message:
            'Use the <NavArrow>/<Icon> primitive, not a raw arrow/caret glyph — Assistant lacks these and the fallback renders low (design-language.md).',
        },
        {
          selector: 'JSXExpressionContainer Literal[value=/[→←›‹↩↺⬇▾▴▲▼]/]',
          message:
            'Use the <NavArrow>/<Icon> primitive, not a raw arrow/caret glyph — Assistant lacks these and the fallback renders low (design-language.md).',
        },
      ],
    },
  },
);
