# Production image: PWA + API + WS on one origin (ADR-0020, ADR-0031).
# Deployed by Railway via railway.json; runnable anywhere Docker runs.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS build
# No .git in the image — skip the husky prepare hook.
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
# prisma.config.ts demands DATABASE_URL even though `generate` never connects.
ARG BUILD_DB_URL="postgresql://build:build@build:5432/build"
RUN DATABASE_URL=$BUILD_DB_URL pnpm --filter @waypoint/backend prisma:generate && pnpm build
# pnpm deploy rebuilds node_modules and drops the generated client — regenerate.
RUN pnpm --filter @waypoint/backend deploy --prod /out && \
    cd /out && DATABASE_URL=$BUILD_DB_URL npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# /out carries the prisma CLI + migrations for Railway's pre-deploy migrate.
COPY --from=build /out ./
# Served by the backend when <dist>/../public exists (spa-fallback.filter.ts).
COPY --from=build /repo/frontend/dist ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
