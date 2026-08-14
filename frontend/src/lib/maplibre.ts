// **One lazy handle on `maplibre-gl`, shared by everything that needs it** (ADR-0186 §1).
//
// The library is BUNDLED rather than fetched at runtime — that is the whole point of the
// migration: no script tag, no page-global loader, no one-shot status, nothing to poison.
//
// **What the code-split actually is, measured rather than claimed** (ADR-0186 §1 asks for the
// renderer to stay out of the first-paint path). It does: `screens/Map.tsx` is lazy, so
// `maplibre-gl` lands in the **Map tab's chunk** (1.09 MB raw / 286 kB gzip at the time of
// writing) and the entry chunk never sees it. What the `import()` below does NOT buy is a
// further chunk boundary inside that: `lib/map-camera-adapter.ts` imports `MercatorCoordinate`
// statically — the camera's world space is mercator × 256 and that class is the true equivalent
// — so rolldown reports INEFFECTIVE_DYNAMIC_IMPORT and folds the module in. Opening the Map tab
// therefore evaluates the renderer whether or not a canvas is built, which is the honest
// description and is fine: nothing else on that tab is cheap either. Making it a real boundary
// means hand-rolling two mercator formulas, which is on the backlog rather than done quietly
// here — the adapter's test compares against `MercatorCoordinate` itself, so it would be a
// provable change rather than a hopeful one.
//
// It is a module-level promise rather than a call per consumer because two of them need the
// same module in the same tick: `MapCanvas` constructs the map, and `MapPane` needs
// `Marker` for the pins. So this is about there being ONE place that knows how the renderer
// arrives, and about `MapCanvas` being able to hand the module on to the pane with the instance.
//
// **And this is not the kind of global the migration is escaping.** It caches a MODULE, not
// a status: there is no success/failure latch, a rejection is not written down, and a later
// call retries. What poisoned the Google path was a write-once `LOADED`/`FAILED` that every
// later map inherited — see `MapCanvas`'s note on `addProtocol` for the same distinction.
export type MapLibreModule = typeof import('maplibre-gl');

// ── THE WORKER, WHICH THE BUNDLE BREAKS AND THE DEV SERVER HIDES ──────────────────────
//
// **This is field report #35's Phase-2 blank map, and the bug is four lines of the vendor's**
// (2026-08-14, ADR-0186 amendment 269i). MapLibre parses every tile on a Web Worker, and it
// finds that worker by rewriting its OWN module URL:
//
//     function getWorkerUrl() {
//       let here = import.meta.url;
//       if (!/^https?:/.test(here)) return '';
//       return new URL(`./maplibre-gl-worker.mjs`, here).href;   // a SIBLING file
//     }
//
// Unbundled that is right — `node_modules/maplibre-gl/dist/` holds the worker next to the
// entry. **Bundled it is wrong**: `import.meta.url` becomes our own hashed chunk
// (`/assets/Map-<hash>.js`), so the worker is fetched from `/assets/maplibre-gl-worker.mjs`,
// which the build never emits.
//
// **And it fails SILENTLY, which is the whole reason this took seven sessions.** MapLibre's
// fallback fetches that URL and blobs the response — and our SPA fallback answers any unknown
// path with `index.html` at **200**, so the fetch succeeds and a module worker is started from
// HTML. It dies on parse. Nothing reaches `onError`, because a dead worker is not a tile error:
// tiles are dispatched and never answered, so on the device it read
//
//     tiles:0 painted:n style:n/2g err:none      with BOTH archives serving real bytes
//     world:206[z0-6/5461t/6:42.3k]  extract:206[z0-14/127t/8:9.7k]
//
// which is what finally localised it: the archives, the region, the auth and the style were all
// provably fine and nothing rendered.
//
// **Why no test could see it.** `playwright.config.ts` runs e2e against `pnpm dev`, and
// `vite.config.ts`'s `optimizeDeps.exclude: ['maplibre-gl']` — added for this migration — makes
// dev serve the real `dist/maplibre-gl.mjs`, whose worker sibling exists. So the one thing that
// differs is the production bundle, and no test in the repo had ever rendered one. The
// `INEFFECTIVE_DYNAMIC_IMPORT` warning in the build log is a note about this module and says
// nothing about the worker.
//
// **The fix names the worker as an asset instead of leaving it to be guessed.** `?worker&url`
// rather than `?url` because the worker imports `maplibre-gl-shared.mjs` as its own sibling — a
// bare asset copy relocates the file and breaks that import in turn, which would be the same
// bug one layer down.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let pending: Promise<MapLibreModule> | null = null;

export function loadMapLibre(): Promise<MapLibreModule> {
  // Cleared on rejection so a transient chunk failure is retryable — the one property the
  // vis.gl global did not have, and the reason six fixes could not recover a poisoned page.
  pending ??= import('maplibre-gl')
    .then((gl) => {
      // Before any map exists, which is what makes this the right place: `config.WORKER_URL`
      // is read when the first worker is spawned, and every construction path in the app
      // awaits this function first.
      gl.setWorkerUrl(workerUrl);
      return gl;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
