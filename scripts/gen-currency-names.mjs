// Regenerates `frontend/src/lib/currency-names.ts` from the running Node's CLDR
// data (ADR-0180 §6's amendment). Run from the repo root:
//
//     node scripts/gen-currency-names.mjs
//
// Checked in rather than run at build time, for the reason the table exists at
// all: the output must be identical on every machine and every engine, which a
// build step reading the BUILDER's ICU would not guarantee. Node ships full ICU;
// a phone may not, and that difference is the whole point.
//
// Requires `packages/shared` to be built (`pnpm --filter @waypoint/shared build`),
// because the currency floor comes from `COUNTRY_CURRENCY`.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COUNTRY_CURRENCY } = require('../packages/shared/dist/destinations.js');

const APP_LOCALE = 'he-IL';
const OUT = 'frontend/src/lib/currency-names.ts';

/** The same union the picker offers: the runtime's breadth, our own floor. */
const codes = [
  ...new Set([...Intl.supportedValuesOf('currency'), ...Object.values(COUNTRY_CURRENCY)]),
].sort();

/** `Intl` wraps a value in bidi marks inside an RTL locale; they are invisible,
 *  they break equality against the code, and isolation belongs at the render
 *  site (ADR-0118) rather than smuggled into stored data. */
const stripBidi = (value) => value.replace(/[‎‏؜⁦-⁩]/g, '').trim();

function part(code, display, locale) {
  try {
    const value = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: display,
    })
      .formatToParts(1)
      .find((p) => p.type === 'currency')?.value;
    return value ? stripBidi(value) : code;
  } catch {
    return code;
  }
}

const rows = [];
for (const code of codes) {
  const values = [
    part(code, 'name', APP_LOCALE),
    part(code, 'name', 'en'),
    part(code, 'narrowSymbol', APP_LOCALE),
    part(code, 'symbol', APP_LOCALE),
  ];
  // A currency CLDR knows nothing about answers with its own code four times —
  // there is nothing to fall back to, so it earns no row.
  if (values.every((v) => v === code)) continue;
  // **Written out in full, never abbreviated to an empty string.** The first
  // draft encoded "same as the code" as `''` to save about 1.5 KB, and every one
  // of the 140 rows that used it was correct only because ONE `|| currency` in
  // one reader held. That is a convention a future direct reader of this table
  // has no way to know about, and its failure mode is a blank name on screen.
  // The bytes are not worth a rule you have to remember.
  const cells = values.map((v) => JSON.stringify(v));
  rows.push(`  ${code}: [${cells.join(', ')}],`);
}

const header = `// **The CLDR names and symbols, snapshotted** — the fallback for an engine that
// does not carry them (ADR-0180 §6's amendment).
//
// §6 chose \`Intl\` over a shipped dataset and that choice stands: the runtime is
// still asked FIRST, and on a full-ICU build every value here is exactly what it
// answers. What this adds is a floor, because a real phone turned out to ship
// without ISK at all — and an engine missing a currency does not merely omit it
// from \`supportedValuesOf\`, it renders that currency's NAME as the bare code. So
// the row came back once the list was unioned, and then dropped out of a \`כתר\`
// search anyway, because it no longer had a name to match.
//
// Patching that per currency is what the first fix did, and it does not scale:
// the problem is not ISK, it is ANY currency an engine trims. This table is the
// general answer — every currency keeps its Hebrew name, its English name and
// both symbols on every engine, so the picker reads the same and searches the
// same everywhere.
//
// **Generated, not hand-written** — see \`scripts/gen-currency-names.mjs\`. Every
// value is written out in full: a currency with no distinct symbol carries its
// own CODE in that slot, exactly as \`Intl\` answers, rather than an empty string
// standing for "same as the code". That convention saved ~1.5 KB and cost a rule
// every future reader would have to know, whose failure mode is a blank name on
// screen. A stale entry is harmless by construction: it is consulted only when
// the runtime has nothing to say, and the runtime wins whenever it does.

/** \`code → [Hebrew name, English name, narrow symbol, wide symbol]\`. */
export const CURRENCY_NAMES: Record<string, readonly [string, string, string, string]> = {`;

writeFileSync(OUT, `${header}\n${rows.join('\n')}\n};\n`);
console.log(`${OUT}: ${rows.length} currencies`);
