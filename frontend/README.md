# @waypoint/frontend

React + Vite PWA for Waypoint (RTL, offline-capable). See `../docs/design/design-language.md`.

## Run (from repo root)

```bash
pnpm install
pnpm --filter @waypoint/frontend dev   # http://localhost:5173
```

## Layout

```
index.html              RTL shell, fonts
src/
  main.tsx              entry
  App.tsx / App.css     4-tab shell (placeholder screens)
  styles/tokens.css     design tokens from the mockup
  db.ts                 Dexie/IndexedDB offline cache scaffold
```

Real screens are ported from `../mockups/trip-dashboard-v2.html` in later tasks (T-002+).
