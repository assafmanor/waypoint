import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// No dotenv dependency in this package; .env only has simple KEY=VALUE lines.
const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, '') ?? '';
    }
  }
}

// The two secrets `.env.example` ships **blank** on purpose (they are generated per
// checkout, never committed — ADR-0020). Without them seven auth specs failed with
// `TOKEN_ENCRYPTION_KEY not configured`, so `pnpm test` could not be green on a fresh
// clone or in any sandbox until someone ran `openssl rand` by hand — the same class of
// trap as `prisma generate` demanding a DATABASE_URL it never uses (`prisma.config.ts`).
// A test suite should not need a real secret: these are throwaway values, applied ONLY
// when the var is absent, so a real `.env` and CI both still win. `TOKEN_ENCRYPTION_KEY`
// must base64-decode to exactly 32 bytes.
const TEST_ONLY_SECRETS = {
  JWT_SECRET: 'vitest-only-jwt-secret-not-for-any-real-use',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 'vitest-only-key-').toString('base64'),
};
for (const [name, value] of Object.entries(TEST_ONLY_SECRETS)) {
  if (!process.env[name]) process.env[name] = value;
}

export default defineConfig({
  test: {
    environment: 'node',
    // `nest start`/`nest build` emit compiled specs into dist/ — exclude it so a
    // stale build doesn't get picked up alongside the TS source.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
