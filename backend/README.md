# @waypoint/backend

NestJS + Prisma API for Waypoint. See `../docs/architecture/` for the design and `../docs/decisions/` for the why.

## Run (from repo root)

```bash
# 1. start Postgres + Redis
docker compose up -d

# 2. install deps (once, per machine)
pnpm install

# 3. generate the Prisma client + create the DB schema
pnpm --filter @waypoint/backend prisma:generate
pnpm --filter @waypoint/backend prisma:migrate

# 4. run the API (http://localhost:3000/health)
pnpm --filter @waypoint/backend dev
```

## Layout

```
src/
  main.ts                 app bootstrap (CORS, port)
  app.module.ts           root module
  health/                 /health endpoint
  prisma/prisma.service   Prisma client lifecycle
prisma/schema.prisma      the data model (T-003)
```

## Next

Auth (Google OAuth), trip/event/booking modules, WebSocket gateway for realtime — per the specs in `../docs/architecture/`.
