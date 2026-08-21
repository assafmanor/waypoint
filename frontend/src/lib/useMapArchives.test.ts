// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const archives = vi.hoisted(() => ({
  read: vi.fn(),
  download: vi.fn(),
}));

vi.mock('./map-archive-cache', () => ({
  readLocalMapArchive: archives.read,
  downloadMapArchive: archives.download,
}));

import { useMapArchives } from './useMapArchives';
import { setSimulatedNow } from './useClock';

const urls = {
  world: 'https://app.example/map/world.pmtiles',
  detail: 'https://app.example/map/planet.pmtiles',
  extract: 'https://app.example/trips/t1/map/extract.pmtiles',
};

beforeEach(() => {
  localStorage.clear();
  archives.read.mockReset().mockResolvedValue(null);
  archives.download.mockReset().mockResolvedValue({ status: 'stored', sizeBytes: 4 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSimulatedNow(null);
});

// ── A DOWNLOADED MAP IS NOT PERMANENT (ADR-0186 §6 amendment, 2026-08-21) ─────────────────
//
// Owner's call: _"offline maps have to be updated too, not because they won't work but because we
// prefer updated maps."_ The server states which vintage it is cutting; a device replaces what it
// holds when it is a vintage behind AND older than the window. The age half is not decoration —
// without it a download late in one window is chased by the next one days later, which for a
// 42.7 MB world layer is a data plan rather than a preference.
const NOW = Date.UTC(2026, 7, 21);
const DAY = 24 * 60 * 60 * 1000;

/** One stored archive, as `readLocalMapArchive` answers. */
const stored = (vintage: string | undefined, ageDays: number) => ({
  blob: new Blob(),
  meta: { vintage, downloadedAt: NOW - ageDays * DAY },
});

describe('useMapArchives', () => {
  it('renders a downloaded extract offline and otherwise keeps the world floor visible', async () => {
    archives.read.mockImplementation((url: string) =>
      Promise.resolve(url === urls.extract ? { blob: new Blob(), meta: {} } : null),
    );
    const withExtract = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: true, ended: false, hasMappedPlaces: true, urls }),
    );
    await waitFor(() => expect(withExtract.result.current.urls.detail).toBe(urls.extract));
    withExtract.unmount();

    archives.read.mockResolvedValue(null);
    const worldOnly = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: true, ended: false, hasMappedPlaces: true, urls }),
    );
    await waitFor(() => expect(worldOnly.result.current.checked).toBe(true));
    expect(worldOnly.result.current.urls.detail).toBe(urls.world);
  });

  it('downloads missing archives automatically only on confidently unmetered connections', async () => {
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    const view = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: false, ended: false, hasMappedPlaces: true, urls }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(archives.download).toHaveBeenCalledTimes(2);
    expect(view.result.current.visible).toBe(false);
  });

  it('uses a one-time prompt when metering cannot be known, including iOS', async () => {
    vi.stubGlobal('navigator', {});
    const view = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: false, ended: false, hasMappedPlaces: true, urls }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('prompt'));
    expect(view.result.current.visible).toBe(true);
    expect(archives.download).not.toHaveBeenCalled();
    await act(() => view.result.current.download());
    expect(localStorage.getItem('waypoint:map-download-prompt:t1')).toBe('accepted');
  });

  it('reports a manually requested 503 extract as preparing instead of a map failure', async () => {
    vi.stubGlobal('navigator', {});
    archives.download
      .mockResolvedValueOnce({ status: 'stored', sizeBytes: 4 })
      .mockResolvedValueOnce({ status: 'preparing', retryAfterSeconds: 9 });
    const view = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: false, ended: false, hasMappedPlaces: true, urls }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('prompt'));
    await act(() => view.result.current.download());
    await waitFor(() => expect(view.result.current.status).toBe('preparing'));
    expect(view.result.current.retryAfterSeconds).toBe(9);
    expect(view.result.current.visible).toBe(true);
  });

  it('silently retries an automatic 503 after Retry-After', async () => {
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    let worldStored = false;
    let extractAttempts = 0;
    archives.read.mockImplementation((url: string) =>
      Promise.resolve(url === urls.world && worldStored ? { blob: new Blob(), meta: {} } : null),
    );
    archives.download.mockImplementation(async ({ url }: { url: string }) => {
      if (url === urls.world) {
        worldStored = true;
        return { status: 'stored', sizeBytes: 4 };
      }
      extractAttempts += 1;
      return extractAttempts === 1
        ? { status: 'preparing', retryAfterSeconds: 0.01 }
        : { status: 'stored', sizeBytes: 4 };
    });
    const view = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: false, ended: false, hasMappedPlaces: true, urls }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(archives.download).toHaveBeenCalledTimes(3);
    expect(view.result.current.visible).toBe(false);
  });

  it('leaves a current-vintage archive alone', async () => {
    setSimulatedNow(NOW);
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    archives.read.mockImplementation(() => Promise.resolve(stored('v7', 90)));
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: false,
        ended: false,
        hasMappedPlaces: true,
        urls,
        archiveVintage: 'v7',
      }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(archives.download).not.toHaveBeenCalled();
  });

  it('replaces a superseded archive on an unmetered connection, quietly', async () => {
    setSimulatedNow(NOW);
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    archives.read.mockImplementation(() => Promise.resolve(stored('v6', 40)));
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: false,
        ended: false,
        hasMappedPlaces: true,
        urls,
        archiveVintage: 'v7',
      }),
    );

    await waitFor(() => expect(archives.download).toHaveBeenCalledTimes(2));
    // Labelled with what the server said it is cutting, so the next window can tell the
    // difference — and no banner: nothing is missing, so there is nothing to announce.
    expect(archives.download).toHaveBeenCalledWith(expect.objectContaining({ vintage: 'v7' }));
    expect(view.result.current.visible).toBe(false);
  });

  it('does NOT chase a new vintage while the copy it has is younger than the window', async () => {
    setSimulatedNow(NOW);
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    // Downloaded three days ago, one window behind: a refresh here is 80 MB for three days of
    // OSM edits, which is the trade this guard exists to refuse.
    archives.read.mockImplementation(() => Promise.resolve(stored('v6', 3)));
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: false,
        ended: false,
        hasMappedPlaces: true,
        urls,
        archiveVintage: 'v7',
      }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(archives.download).not.toHaveBeenCalled();
  });

  it('never spends metered bytes, or asks, to refresh a map that already works', async () => {
    setSimulatedNow(NOW);
    // No `navigator.connection` — Safari, where §5 cannot tell wifi from roaming. A MISSING
    // archive earns its one-time prompt; a merely stale one does not get to nag.
    vi.stubGlobal('navigator', {});
    archives.read.mockImplementation(() => Promise.resolve(stored('v6', 90)));
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: false,
        ended: false,
        hasMappedPlaces: true,
        urls,
        archiveVintage: 'v7',
      }),
    );

    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(archives.download).not.toHaveBeenCalled();
    expect(view.result.current.visible).toBe(false);
  });

  it('renders a stale archive rather than nothing — a refresh is never a gap', async () => {
    setSimulatedNow(NOW);
    archives.read.mockImplementation((url: string) =>
      Promise.resolve(url === urls.extract ? stored('v5', 200) : null),
    );
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: true,
        ended: false,
        hasMappedPlaces: true,
        urls,
        archiveVintage: 'v7',
      }),
    );

    await waitFor(() => expect(view.result.current.urls.detail).toBe(urls.extract));
  });

  it('never auto-downloads an ended trip', async () => {
    vi.stubGlobal('navigator', { connection: { type: 'wifi', saveData: false } });
    const view = renderHook(() =>
      useMapArchives({ tripId: 't1', offline: false, ended: true, hasMappedPlaces: true, urls }),
    );

    await waitFor(() => expect(view.result.current.checked).toBe(true));
    expect(view.result.current.status).toBe('idle');
    expect(archives.download).not.toHaveBeenCalled();
  });

  it('does not suggest or request an extract until the trip has a saved mapped place', async () => {
    vi.stubGlobal('navigator', {});
    const view = renderHook(() =>
      useMapArchives({
        tripId: 't1',
        offline: false,
        ended: false,
        hasMappedPlaces: false,
        urls,
      }),
    );

    await waitFor(() => expect(view.result.current.checked).toBe(true));
    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.visible).toBe(false);
    expect(archives.download).not.toHaveBeenCalled();
  });
});
