// **The recall probe** (ADR-0166 §22) — the production match pipeline, run against the LIVE
// Wikimedia APIs over a corpus of real saved names, so recall is a number somebody measured
// rather than a thing somebody believes.
//
// **Opt-in and skipped by default.** It talks to the network, it takes ~30 minutes, and its
// answers move when Wikidata does — none of which belongs in CI. Run it deliberately:
//
//   ENRICHMENT_LIVE_PROBE=1 pnpm --filter @waypoint/backend exec vitest run live-recall.probe
//   ENRICHMENT_LIVE_PROBE=1 PROBE_ONLY=gullfoss-he,bru-desc … (one case, while working on it)
//
// It writes every verdict to `PROBE_OUT` as it goes and resumes from that file, so a run
// interrupted by a rate limit continues rather than starting over; `PROBE_FRESH=1` ignores it.
// **The comparison is the point**: run it on `main`, run it on the branch, diff the two files.
// Two sessions have now been spent reconstructing this by hand (sessions 248 and 254); the
// third should not have to.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { WikidataProvider } from './providers/wikidata.provider';
import { EnrichmentFetcher, type EnrichmentFetchOptions } from './outbound-fetch';
import type { PlaceIdentity } from './enrichment.provider';
import { RECALL_CORPUS, type RecallCase } from './live-recall.corpus';

const OUT = process.env.PROBE_OUT ?? '/tmp/waypoint-recall-probe.json';

/** Wikimedia rate-limits a tight loop, and a 429 mid-corpus is not a matching result. Spacing
 *  the calls and backing off on a throttle is what makes a 170-case run finish at all. */
const GAP_MS = Number(process.env.PROBE_GAP_MS ?? 400);
const RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PoliteFetcher extends EnrichmentFetcher {
  private last = 0;

  override async fetchJson<T>(url: string, options: EnrichmentFetchOptions = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      try {
        return await super.fetchJson<T>(url, options);
      } catch (err) {
        const message = (err as Error).message;
        const throttled = ['429', '503', 'timed out'].some((sign) => message.includes(sign));
        if (!throttled || attempt >= RETRIES) throw err;
        await sleep(2000 * 2 ** attempt);
      }
    }
  }
}

interface Verdict extends Record<string, unknown> {
  id: string;
  name: string;
  expect: string;
  VERDICT: string;
}

/** Each route asked separately as well as through `match`, because "which route found it" and
 *  "which route could have" are different questions and the second is what a miss needs. */
async function probe(fetcher: EnrichmentFetcher, testCase: RecallCase): Promise<Verdict> {
  const identity: PlaceIdentity = {
    name: testCase.name,
    lat: testCase.lat,
    lng: testCase.lng,
  } as PlaceIdentity;
  // The routes are private because nothing in production picks one; the probe's whole job is to
  // report per-route, which is the one legitimate reason to reach past that.
  const provider = new WikidataProvider(fetcher) as unknown as Record<
    string,
    (id: PlaceIdentity, trace: unknown[]) => Promise<{ ref: string; confidence: number } | null>
  >;
  const row: Verdict = {
    id: testCase.id,
    name: testCase.name,
    expect: testCase.expect,
    VERDICT: 'MISS',
  };
  for (const [key, method] of [
    ['name_route', 'matchByName'],
    ['geo_route', 'matchByCoordinates'],
    ['text_route', 'matchByArticleText'],
  ] as const) {
    try {
      const found = await provider[method]!(identity, []);
      row[key] = found ? `${found.ref}@${found.confidence.toFixed(3)}` : null;
    } catch (err) {
      row[key] = `ERR ${(err as Error).message}`;
    }
  }
  const final = await new WikidataProvider(fetcher).match(identity);
  row.FINAL = final ? `${final.ref} ${final.method} ${final.confidence.toFixed(3)}` : null;
  row.VERDICT = verdict(testCase, final?.ref ?? null);
  return row;
}

function verdict(testCase: RecallCase, got: string | null): string {
  if (testCase.expect === 'refuse') return got == null ? 'OK-refused' : `BAD-matched ${got}`;
  if (got == null) return 'MISS';
  return got === testCase.expect ? 'OK' : `WRONG ${got} (want ${testCase.expect})`;
}

describe.skipIf(!process.env.ENRICHMENT_LIVE_PROBE)(
  'enrichment recall, against the live APIs',
  () => {
    it('matches the corpus', { timeout: 3 * 60 * 60_000 }, async () => {
      const fetcher = new PoliteFetcher();
      const only = process.env.PROBE_ONLY?.split(',').filter(Boolean);
      const cases = only ? RECALL_CORPUS.filter((c) => only.includes(c.id)) : RECALL_CORPUS;
      const done: Record<string, Verdict> =
        existsSync(OUT) && !process.env.PROBE_FRESH && !only
          ? (JSON.parse(readFileSync(OUT, 'utf8')) as Record<string, Verdict>)
          : {};

      for (const testCase of cases) {
        if (done[testCase.id]) continue;
        done[testCase.id] = await probe(fetcher, testCase);
        writeFileSync(OUT, JSON.stringify(done, null, 1));
        console.log(JSON.stringify(done[testCase.id]));
      }

      const rows = cases.map((testCase) => done[testCase.id]!);
      const missed = rows.filter((row) => !row.VERDICT.startsWith('OK'));
      console.log(`\n=== ${rows.length - missed.length}/${rows.length} OK — written to ${OUT} ===`);
      for (const row of missed) console.log(`  ${row.id}  ${row.VERDICT}  (${row.name})`);

      // Not an assertion on the score: Wikidata changes under us, and a probe that fails the
      // build on somebody else's edit is a probe people delete. The permanent guarantees are the
      // offline fixtures in `wikidata.provider.spec.ts`; this reports.
      expect(rows).toHaveLength(cases.length);
    });
  },
);
