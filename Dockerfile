# Production image (ADR-0031): ONE container serving the API + WebSockets and
# the built PWA on a single origin (ADR-0020). Built/deployed by Railway from
# railway.json; runnable anywhere Docker runs.

FROM node:22-slim AS base
# packageManager in package.json pins the pnpm version corepack activates.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ── Build: install the workspace, build shared → backend + frontend ─────────
FROM base AS build
# Skips the root husky "prepare" hook — no .git inside the image.
ENV HUSKY=0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY backend ./backend
COPY frontend ./frontend
# prisma.config.ts resolves DATABASE_URL eagerly, but `generate` never
# connects — a placeholder satisfies it without leaking into the image env.
ARG BUILD_DB_URL="postgresql://build:build@build:5432/build"
RUN DATABASE_URL=$BUILD_DB_URL pnpm --filter @waypoint/backend prisma:generate && pnpm build

# Standalone backend: production node_modules only, workspace deps packed in.
# The Prisma client is regenerated inside the pruned tree because `pnpm deploy`
# rebuilds node_modules and would otherwise drop the generated client.
RUN pnpm --filter @waypoint/backend deploy --prod /out && \
    cd /out && DATABASE_URL=$BUILD_DB_URL npx prisma generate

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Includes prisma/ + prisma.config.ts + the prisma CLI, so Railway's
# pre-deploy `npx prisma migrate deploy` runs against this same image.
COPY --from=build /out ./
# The PWA, served by ServeStaticModule at <dist>/../public (app.module.ts).
COPY --from=build /repo/frontend/dist ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
