// Prisma 7 no longer auto-loads .env, so we load it before reading DATABASE_URL.
// backend/.env first (wins when present), then the repo-root .env from the
// CLAUDE.md quickstart — dotenv never overrides vars that are already set.
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
