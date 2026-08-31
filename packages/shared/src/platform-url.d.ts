// **The one platform global this package depends on**, declared rather than pulled in.
//
// `tsconfig.json` here sets `lib: ["ES2022"]` and no `types`, deliberately: it is what makes
// `document` and `process` fail to compile inside a package whose whole contract is that it
// talks to no DOM, no socket and no filesystem (`packages/shared/CLAUDE.md`). Adding `DOM`
// or `@types/node` to reach `URL` would buy one constructor and open that door for
// everything else.
//
// `URL` is a WHATWG global present in every browser and in Node since v10, so it is
// genuinely available everywhere this package runs — it simply is not an ECMAScript library
// type. Only the members `external-url.ts` actually uses are declared, so a future
// dependency on some other global still fails the build rather than arriving silently.
declare class URLSearchParams {
  keys(): IterableIterator<string>;
  delete(name: string): void;
}

declare class URL {
  constructor(url: string, base?: string);
  hash: string;
  host: string;
  href: string;
  pathname: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
}
