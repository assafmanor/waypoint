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
# A Docker build sees only variables declared as ARG. Staging's build badge needs one or the
# service variable looks set while Vite sees nothing. Empty by default: no badge ships in prod.
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
# **`ca-certificates` is required AT RUNTIME, not only to fetch the binary above** — and
# leaving it out of this stage is what made the map fail to load on 2026-08-14:
#
#     pmtiles extract https://build.protomaps.com/…: tls: failed to verify certificate:
#     x509: certificate signed by unknown authority
#
# The trap is that the app itself is unaffected, so nothing else in the image looks wrong.
# **Node bundles its own CA store**, so every `fetch` from JavaScript verifies fine; the
# `pmtiles` binary is **Go**, which reads the SYSTEM store at `/etc/ssl/certs`, and
# `node:22-slim` ships none. The builder stage installs the package to run `curl`, and only
# the binary is copied forward — so the one process in this image that needs a system trust
# store is the one process that had no access to one.
#
# `openssl` rides along for Prisma, which logs `failed to detect the libssl/openssl version`
# on slim images and falls back to guessing an engine. Same class of omission, same fix.
#
# **`chromium` is here for the itinerary PDF** (ADR-0213 §4), and it is a SYSTEM package
# rather than a Playwright download on purpose: `backend/package.json` depends on
# `playwright-core`, which ships no browser, so nothing in this build fetches ~150 MB from
# a CDN at image-build time or (worse) at first request. `PDF_CHROMIUM_PATH` defaults to
# where this package puts it. `fonts-liberation` is Chromium's own baseline — the app's
# Hebrew faces are inlined into the document as data URLs, so the PDF does not depend on
# any system font, but a browser with no fontconfig match at all fails to start.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pmtiles /usr/local/bin/pmtiles /usr/local/bin/pmtiles
# /out carries the prisma CLI + migrations for Railway's pre-deploy migrate.
COPY --from=build /out ./
# Served by the backend when <dist>/../public exists (all-exceptions.filter.ts).
COPY --from=build /repo/frontend/dist ./public
# The PDF renderer reads these off disk and inlines them into the document; neither source
# tree is in the runtime image, so both sets are copied to the path
# `itinerary-pdf.template.ts` looks in first. The second is the emoji face the APP has no
# use for and the paper does — an event's icon is an emoji, and this base image has no
# emoji coverage at all, so without it every icon prints as a rectangle
# (`backend/assets/fonts/README.md`).
COPY --from=build /repo/frontend/src/assets/fonts ./pdf-fonts
COPY --from=build /repo/backend/assets/fonts/noto-emoji.woff2 ./pdf-fonts/
EXPOSE 3000
CMD ["node", "dist/main.js"]
