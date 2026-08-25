// **The four things this provider gets silently wrong if nobody asserts them** (ADR-0205 §Z4/§Z7).
//
// Every failure here is a `200` carrying a plausible number, which is why they are worth a spec at
// all: a wrong host answers HTML, a defaulted ferry answers a walk that boards a boat, a
// kilometre answers as a metre, and a `null` cell answers as "you are already there".
import { describe, expect, it, vi } from 'vitest';
import { POLYLINE_PRECISION } from '@waypoint/shared';
import {
  EnrichmentFetcher,
  OutboundHttpError,
  isAllowedEnrichmentUrl,
} from '../enrichment/outbound-fetch';
import { RouteOutOfRangeError } from './route-provider';
import { ValhallaRouteProvider } from './valhalla.provider';

const TOKYO = { lat: 35.7107, lng: 139.7975 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };

/** A fetcher that records what was asked and answers a fixture — the same shape enrichment's own
 *  providers are tested with, so nothing here opens a socket. */
function stubFetcher(answer: unknown) {
  const calls: { url: string; options: Record<string, unknown> }[] = [];
  const fetcher = {
    fetchJson: vi.fn((url: string, options: Record<string, unknown>) => {
      calls.push({ url, options });
      return Promise.resolve(answer);
    }),
  } as unknown as EnrichmentFetcher;
  return { fetcher, calls };
}

const cell = (from: number, to: number, time: number | null, distanceKm: number | null) => ({
  from_index: from,
  to_index: to,
  time,
  distance: distanceKm,
});

describe('ValhallaRouteProvider', () => {
  it('asks the API host, not the demo web app, and identifies itself', async () => {
    // ADR-0205 §2 links `valhalla.openstreetmap.de`, which is the demo WEB APP: it answers 200
    // with an HTML page for every API path, so pointing at it fails in the most expensive way
    // there is. The API host is `valhalla1` (§Z4), and `X-Client-Id` is a condition of using the
    // FOSSGIS server at all (§2).
    const { fetcher, calls } = stubFetcher({ sources_to_targets: [[cell(0, 1, 60, 1)]] });
    await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], 'walking');

    expect(calls[0]!.url).toBe('https://valhalla1.openstreetmap.de/sources_to_targets');
    expect(calls[0]!.options.headers).toMatchObject({ 'X-Client-Id': expect.any(String) });
    // And the host it reaches for is one the process's outbound allowlist actually carries.
    expect(isAllowedEnrichmentUrl(calls[0]!.url)).toBe(true);
  });

  it('sends use_ferry: 0 on walking and cycling, and the group pace on walking', async () => {
    // §Z7: left at its default, pedestrian routing boards a scheduled tourist ferry — 22.7 min
    // optimistic on one seed leg, and optimistic about catching a boat. It also makes the matrix
    // answer depend on batch size, which §4's `(mode, from, to)` cache key cannot represent.
    for (const [mode, costing] of [
      ['walking', 'pedestrian'],
      ['cycling', 'bicycle'],
    ] as const) {
      const { fetcher, calls } = stubFetcher({ sources_to_targets: [[cell(0, 1, 60, 1)]] });
      await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], mode);
      const body = calls[0]!.options.json as Record<string, Record<string, unknown>>;
      expect(body.costing).toBe(costing);
      expect(body.costing_options![costing]).toMatchObject({ use_ferry: 0 });
    }

    const { fetcher, calls } = stubFetcher({ sources_to_targets: [[cell(0, 1, 60, 1)]] });
    await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], 'walking');
    const walking = (calls[0]!.options.json as Record<string, Record<string, never>>)
      .costing_options!.pedestrian as unknown as Record<string, number>;
    // §Z6: the default 5.1 km/h is a brisk solo adult, and this app serves groups of ~5. A pace
    // is a request parameter, not a hedge — Valhalla re-models the crossings around it.
    expect(walking.walking_speed).toBeLessThan(5.1);
  });

  it('leaves driving alone — a costing option nothing needs is a knob nobody checked', async () => {
    // §Z7 measured driving unaffected by the ferry setting on every leg tested, so it is set for
    // the two modes that section names and not globally.
    const { fetcher, calls } = stubFetcher({ sources_to_targets: [[cell(0, 1, 60, 1)]] });
    await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], 'driving');
    const body = calls[0]!.options.json as Record<string, unknown>;
    expect(body.costing).toBe('auto');
    expect(body.costing_options).toBeUndefined();
  });

  it('converts the provider’s kilometres to the metres every shape in this app uses', async () => {
    const { fetcher } = stubFetcher({ sources_to_targets: [[cell(0, 1, 4976, 6.72)]] });
    const cells = await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], 'walking');
    expect(cells).toEqual([
      { fromIndex: 0, toIndex: 1, durationSeconds: 4976, distanceMeters: 6720 },
    ]);
  });

  it('DROPS a null cell rather than answering it as zero', async () => {
    // §Z4's second failure mode: crow-flies under the limit but road path over returns 200 with
    // an empty cell, and the matrix survives. A `0 s` leg would render "no route" as "you are
    // already there"; an absent one is ADR-0206 §D4's ordinary absence.
    const { fetcher } = stubFetcher({
      sources_to_targets: [
        [cell(0, 0, 0, 0), cell(0, 1, null, null)],
        [cell(1, 0, null, null), cell(1, 1, 0, 0)],
      ],
    });
    const cells = await new ValhallaRouteProvider(fetcher).matrix([TOKYO, SHINJUKU], 'driving');
    expect(cells.map((c) => [c.fromIndex, c.toIndex])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('turns error_code 154 into a terminal refusal, and everything else into an outage', async () => {
    // §Z4's first failure mode, and the distinction decides whether anything retries: a stated
    // path limit fails identically forever, a 503 does not.
    const refusing = {
      fetchJson: () =>
        Promise.reject(
          new OutboundHttpError(
            400,
            'valhalla1.openstreetmap.de',
            JSON.stringify({
              error_code: 154,
              error: 'Path distance exceeds the max distance limit: 400000 meters',
            }),
          ),
        ),
    } as unknown as EnrichmentFetcher;
    await expect(
      new ValhallaRouteProvider(refusing).matrix([TOKYO, SHINJUKU], 'driving'),
    ).rejects.toBeInstanceOf(RouteOutOfRangeError);

    const down = {
      fetchJson: () =>
        Promise.reject(new OutboundHttpError(503, 'valhalla1.openstreetmap.de', 'unavailable')),
    } as unknown as EnrichmentFetcher;
    await expect(
      new ValhallaRouteProvider(down).matrix([TOKYO, SHINJUKU], 'driving'),
    ).rejects.not.toBeInstanceOf(RouteOutOfRangeError);
  });

  it('stamps a shape with precision 6, which is the trap ADR-0205 §1 wrote itself around', async () => {
    // Valhalla encodes at 6; Google, OSRM and every copy-pasted decoder assume 5. Decoded at 5
    // there is no error — just a well-formed pair of numbers ten times off and a line drawn
    // nowhere. The precision travels WITH the shape so that stays unrepresentable.
    const { fetcher } = stubFetcher({
      trip: { summary: { time: 8054.4, length: 10.606 }, legs: [{ shape: 'ikzbcAa_osiG' }] },
    });
    const answer = await new ValhallaRouteProvider(fetcher).shape(TOKYO, SHINJUKU, 'walking');
    expect(answer).toEqual({
      durationSeconds: 8054.4,
      distanceMeters: 10606,
      shape: { encoded: 'ikzbcAa_osiG', precision: POLYLINE_PRECISION.VALHALLA },
    });
  });

  it('reads the tileset date, which is the invalidation signal a TTL was standing in for', async () => {
    // ADR-0205 §Z5: `/status` states `tileset_last_modified`, and an OSM refresh is the only thing
    // that invalidates a route between two fixed points. Recorded per row so M12 evicts on a roll.
    const { fetcher } = stubFetcher({ tileset_last_modified: 1787650926 });
    expect(await new ValhallaRouteProvider(fetcher).dataVersion()).toEqual(
      new Date(1787650926 * 1000),
    );
  });

  it('answers no version rather than throwing when the provider will not say', async () => {
    const silent = {
      fetchJson: () => Promise.reject(new Error('boom')),
    } as unknown as EnrichmentFetcher;
    // A row with no eviction handle beats no row: the estimate is still correct.
    expect(await new ValhallaRouteProvider(silent).dataVersion()).toBeNull();
  });
});
