// Prisma 7 no longer auto-loads .env. backend/.env first, then the repo-root
// .env (CLAUDE.md quickstart) — dotenv never overrides already-set vars.
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnv();
loadEnv({ path: '../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
