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
# The frontend's Maps config is BUILD-time: Vite inlines `import.meta.env.VITE_*`
# into the bundle, so these must exist during `pnpm build` below — a runtime env
# var on the service reaches the container but never the JavaScript.
#
# A Docker build sees only what the Dockerfile declares as ARG. Railway passes
# every service variable as a `--build-arg`, so declaring them here is what turns
# them into env vars for the RUN, and Vite picks up `process.env.VITE_*` at its
# default `VITE_` prefix. Without these three lines the vars are simply absent
# from the bundle and the Map tab renders its list-only form (ADR-0121 §2's
# graceful absence) — which is correct behaviour, and indistinguishable from a
# misconfigured deploy, so `vite.config.ts` warns in the build log too.
#
# Defaulted to empty on purpose: a build with no Maps setup must still succeed.
ARG VITE_GOOGLE_MAPS_BROWSER_KEY=""
ARG VITE_GOOGLE_MAPS_MAP_ID=""
ARG VITE_GOOGLE_MAPS_MAP_ID_DARK=""
# Staging's build badge (`ui/BuildBadge.tsx`) — same build-time rule as the three above, so
# it needs its own ARG or the service variable looks set and does nothing. Empty by default,
# which is the production case: no badge ships.
ARG VITE_BUILD_BADGE=""
# The badge's TEXT is not a variable — `vite.config.ts` reads the commit itself, because a
# label somebody has to remember to bump is one that eventually lies. Railway exports these
# two, so declaring them is what lets the build see the commit it is building.
ARG RAILWAY_GIT_COMMIT_SHA=""
ARG RAILWAY_GIT_BRANCH=""
RUN DATABASE_URL=$BUILD_DB_URL pnpm --filter @waypoint/backend prisma:generate && pnpm build
# pnpm deploy rebuilds node_modules and drops the generated client — regenerate.
RUN pnpm --filter @waypoint/backend deploy --prod /out && \
    cd /out && DATABASE_URL=$BUILD_DB_URL npx prisma generate

# The offline map's cutter (ADR-0186 §3). A single static Go binary with no runtime
# deps — fetched in its own stage so the toolchain used to get it (curl, tar) never
# reaches the runtime image. Pinned: this reads a 128 GiB archive over range requests,
# and "whatever is latest" is not a thing to discover on a deploy.
#
# It runs a handful of times per trip EVER, not per tile — measured, one trip's two
# areas cost 54 requests and 9.3s — which is the whole reason the backend stores slices
# instead of proxying tiles.
FROM base AS pmtiles
ARG PMTILES_VERSION=1.31.2
ARG TARGETARCH=amd64
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in \
    amd64) PM_ARCH=x86_64 ;; \
    arm64) PM_ARCH=arm64 ;; \
    *) echo "unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL -o /tmp/pmtiles.tar.gz \
    "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${PM_ARCH}.tar.gz" \
    && tar -xzf /tmp/pmtiles.tar.gz -C /usr/local/bin pmtiles \
    && chmod +x /usr/local/bin/pmtiles \
    && rm /tmp/pmtiles.tar.gz

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=pmtiles /usr/local/bin/pmtiles /usr/local/bin/pmtiles
# /out carries the prisma CLI + migrations for Railway's pre-deploy migrate.
COPY --from=build /out ./
# Served by the backend when <dist>/../public exists (spa-fallback.filter.ts).
COPY --from=build /repo/frontend/dist ./public
EXPOSE 3000
CMD ["node", "dist/main.js"]
