// Prisma 7 no longer auto-loads .env. backend/.env first, then the repo-root
// .env (CLAUDE.md quickstart) — dotenv never overrides already-set vars.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv();
loadEnv({ path: '../.env' });

// `prisma generate` never opens a connection — it reads the schema and writes a
// client — so a missing `DATABASE_URL` must not fail it. `env('DATABASE_URL')` throws
// while the config is being LOADED, i.e. before the command is even known, which made
// one unset secret fail the **whole repo**: the generated client is a typecheck
// dependency, so `pnpm typecheck` and `pnpm build` both died on a fresh checkout, in
// CI, and in every agent session that has no `.env` (the quickstart's `cp .env.example
// .env` has to happen first, and nothing said so).
//
// Commands that really do connect still fail, and the placeholder is worded so the
// connection error names the cause: `… @DATABASE_URL-is-not-set:5432 …`.
const UNSET_DATABASE_URL = 'postgresql://waypoint@DATABASE_URL-is-not-set:5432/waypoint';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? UNSET_DATABASE_URL,
  },
});
