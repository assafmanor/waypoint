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

let pending: Promise<MapLibreModule> | null = null;

export function loadMapLibre(): Promise<MapLibreModule> {
  // Cleared on rejection so a transient chunk failure is retryable — the one property the
  // vis.gl global did not have, and the reason six fixes could not recover a poisoned page.
  pending ??= import('maplibre-gl').catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
