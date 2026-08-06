# 0170 — The product is Travelive; the codebase stays Waypoint

**Status:** Accepted, and **BUILT** (owner, 2026-08-06)
**Date:** 2026-08-06

**Relates:** [0169](0169-the-app-answers-on-one-host.md) (the domain the name arrived with), [0009](0009-docs-english-ui-hebrew.md) (docs English, UI Hebrew — the brand mark is Latin in both)

## Context

`Waypoint` was always a working codename (root `CLAUDE.md`, first paragraph). The product now has a bought name and a bought domain: **Travelive**, at `travelive.app`. The owner's instruction was exact — change what the reader sees, and _"internally it could still be called waypoint. No problem with that."_

## Decision

**The rename is a UI change and nothing else, and the name is defined once.** Four surfaces carry it to a person, and all four read `frontend/src/app-name.ts` — changing the product's name is one line:

| Surface                                               | Reads                                                   |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `/login` and `/join/:token` wordmarks                 | `APP_NAME`, re-exported by `constants.ts`               |
| `index.html` `<title>`                                | an `%APP_TITLE%` token, substituted by `vite.config.ts` |
| PWA manifest `name` / `short_name` (`vite.config.ts`) | `APP_TITLE` / `APP_NAME`, imported directly             |

The awkward half is the bottom two: `index.html` is read by the browser and the manifest is built by the Vite config, so **neither can import from the app graph**. That is why `app-name.ts` has no imports and is not allowed any — it is the one module both a React screen and a build-time config can read. `index.html` gets a `transformIndexHtml` substitution rather than a second copy of the string, because two copies drift the first time one of them changes, and the one nobody would notice is the `<title>`.

The name is not in `i18n/he.ts` with the UI copy: it is a proper noun that stays Latin in an RTL Hebrew interface and would never be translated.

**Everything an identifier touches stays `waypoint`:** the repo, the pnpm packages (`@waypoint/shared`, `@waypoint/backend`, `@waypoint/frontend`), the Postgres database, the Dexie database name, the `waypoint:*` localStorage keys, the doc-cache and map-style ids, the Swagger title. Two reasons, and the second is the one that matters:

1. It buys nothing a reader can see.
2. **The client-side names are load-bearing.** `new Dexie('waypoint')` and the `waypoint:*` storage keys _are_ the identity of every user's local cache. Renaming them doesn't migrate anything — it points the app at a fresh, empty database, so every member silently loses their offline cache and their theme choice on the deploy that ships the rename. A cosmetic change with a data cost is not cosmetic.

## Consequences

- Grep results split by intent, permanently: `Waypoint` in a string a person reads is a bug; `waypoint` in an import, key, id or table name is correct. This ADR is what tells a future contributor — or an agent doing a helpful sweep — which is which.
- Installed PWAs keep their old label until the browser refreshes the manifest; the icon and start URL are unchanged, so nothing reinstalls.

## Alternatives considered

- **Rename everything, including the packages and the client-side stores.** The tidy answer, and the one with a real user cost (a wiped Dexie cache and a reset theme for every member) in exchange for consistency nobody outside the repo can observe.
- **Let `index.html` and the manifest keep their own copy of the string.** One line shorter today, and it makes the name a thing that lives in three files — the `<title>` being the copy nobody would notice had gone stale.
