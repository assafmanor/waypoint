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
);
