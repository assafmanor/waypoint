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

afterEach(() => vi.unstubAllGlobals());

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
