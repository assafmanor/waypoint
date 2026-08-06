// **The product's name, defined once** (owner, 2026-08-06 — ADR-0170).
//
// It reaches a person in four places: the `/login` and `/join/:token` wordmarks, the
// document `<title>`, and the PWA manifest's `name` + `short_name`. The first two are React
// and could read `constants.ts`; the other two are read **before and outside the bundle** —
// `index.html` by the browser, the manifest by `vite.config.ts` at build time — so they
// cannot import from anything that pulls in the app graph.
//
// Hence this file: **no imports, none allowed**. `vite.config.ts` imports it directly (and
// substitutes `%APP_TITLE%` into `index.html` as it serves/builds it); `constants.ts`
// re-exports `APP_NAME` so screens keep reading names from where names live. Changing the
// product's name is this one line.
//
// What is deliberately NOT here: `@waypoint/*`, the Dexie database, the `waypoint:*` storage
// keys. Those are identifiers, not the name — and the local ones are the identity of every
// user's offline cache, so renaming them empties it (ADR-0170).

export const APP_NAME = 'Travelive';

/** The name with its Hebrew tagline — the `<title>` and the manifest's long `name`. */
export const APP_TITLE = `${APP_NAME} · מרכז שליטה לטיול`;
