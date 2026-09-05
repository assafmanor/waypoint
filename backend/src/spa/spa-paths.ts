import { join } from 'node:path';

/**
 * **Where the production image puts the built PWA.** Never exists in dev or test (ADR-0020),
 * which is what every caller branches on.
 *
 * Its own file, with no imports but `node:path`, because it was in
 * `common/all-exceptions.filter.ts` — a module that imports `@prisma/client`. That made a
 * unit test of the shell renderer require a generated Prisma client to read a path constant,
 * which is a dependency nothing about it justifies. The filter still imports these; it is
 * simply no longer the owner.
 */
export const STATIC_ROOT = join(__dirname, '..', '..', 'public');
export const SPA_INDEX = join(STATIC_ROOT, 'index.html');
