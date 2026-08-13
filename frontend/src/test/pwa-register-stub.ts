// **`virtual:pwa-register/react`, for the unit run only** — aliased in by
// `vite.config.ts`'s `test.resolve`.
//
// The module is a VIRTUAL one, minted by `vite-plugin-pwa` at build/dev time. Under vitest
// the plugin is loaded but its virtual id resolves to `file:///@vite-plugin-pwa/virtual:…`,
// which Node refuses as a filename — so any spec whose import graph reaches
// `lib/useAppUpdate.ts` failed to COLLECT, with no test in the file ever running.
// `App.authgate.test.tsx` and `Header.test.tsx` were two of them, and they had been failing
// that way long enough that the count read as normal.
//
// A stub here rather than a `vi.mock` per spec, because the reach is transitive and grows:
// anything that renders `App` or the shared header is in that graph and would need its own
// copy of a mock for a module it has never heard of. A spec that genuinely tests update
// behaviour still mocks the id itself (`AppUpdateNotice.test.tsx`), and a `vi.mock` beats an
// alias, so that keeps working untouched.
//
// It does nothing on purpose: no service worker exists in jsdom, so the honest stand-in is a
// registration that never reports a new build. The callbacks are dropped rather than stored —
// a spec that wants to fire them is the spec that should be mocking this.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

export function useRegisterSW(_options?: RegisterSWOptions) {
  return {
    needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
