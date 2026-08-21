import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapTileUrls } from './map-config';
import { MAP_ARCHIVE_VINTAGE_DAYS } from '@waypoint/shared';
import { downloadMapArchive, readLocalMapArchive, type MapArchiveMeta } from './map-archive-cache';
import { getNow } from './useClock';

const VINTAGE_WINDOW_MS = MAP_ARCHIVE_VINTAGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * **Is this archive worth replacing?** (ADR-0186 §6 amendment, 2026-08-21.)
 *
 * Two conditions, and the second is what keeps a preference from becoming a data plan:
 *
 * - the server is cutting a different vintage than this copy is, and
 * - this copy is older than the vintage window itself.
 *
 * Without the age test, a download late in one window would be chased by the next one days
 * later. With it, a device replaces an archive at most once per window and usually less — which
 * is the whole point of offline archives running on a slower clock than the daily build.
 *
 * A stale archive is never a broken one: it keeps rendering until a replacement is actually
 * stored, which is §6 rule 5's spirit — you do not lose your map mid-refresh.
 */
export function isMapArchiveStale(
  entry: MapArchiveMeta,
  currentVintage: string | null | undefined,
  now: number,
): boolean {
  if (!currentVintage) return false;
  if (entry.vintage === currentVintage) return false;
  return now - entry.downloadedAt >= VINTAGE_WINDOW_MS;
}

export type MapArchiveStatus =
  'idle' | 'prompt' | 'downloading' | 'preparing' | 'no-space' | 'failed' | 'ready';

interface ConnectionInfo {
  type?: string;
  saveData?: boolean;
}

function connectionInfo(): ConnectionInfo | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection;
}

export function mapArchiveDownloadPolicy(connection = connectionInfo()): 'automatic' | 'prompt' {
  if (connection?.saveData) return 'prompt';
  return connection?.type === 'wifi' || connection?.type === 'ethernet' ? 'automatic' : 'prompt';
}

function promptKey(tripId: string): string {
  return `waypoint:map-download-prompt:${tripId}`;
}

function promptDecision(tripId: string): string | null {
  try {
    return localStorage.getItem(promptKey(tripId));
  } catch {
    return null;
  }
}

function rememberPrompt(tripId: string, decision: 'accepted' | 'dismissed'): void {
  try {
    localStorage.setItem(promptKey(tripId), decision);
  } catch {
    // A refused localStorage write may repeat the prompt next visit; it must not block the map.
  }
}

/** What is on the device for one archive, or nothing. The METADATA rather than a boolean, so
 *  "is there one" and "is it still the current vintage" are one lookup. */
type LocalArchive = MapArchiveMeta | null;

/** **Do we want to download this one?** Missing, or stale enough to replace (ADR-0186 §6
 *  amendment) — the two cases the download path treats identically. */
function wanted(entry: LocalArchive, vintage: string | null | undefined): boolean {
  return !entry || isMapArchiveStale(entry, vintage, getNow());
}

export function useMapArchives(opts: {
  tripId: string;
  offline: boolean;
  ended: boolean;
  hasMappedPlaces: boolean;
  urls: MapTileUrls;
  /** **The vintage the server is cutting now** (`/me`'s `map.archiveVintage`). What makes a
   *  downloaded archive replaceable at all: without it a device holds its first download
   *  forever, which is a map of the world as it was the day you installed the app. */
  archiveVintage?: string | null;
}) {
  const [local, setLocal] = useState<{ world: LocalArchive; extract: LocalArchive }>({
    world: null,
    extract: null,
  });
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<MapArchiveStatus>('idle');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>();
  const [visible, setVisible] = useState(false);
  const running = useRef(false);

  const inspect = useCallback(async () => {
    const [world, extract] = await Promise.all([
      readLocalMapArchive(opts.urls.world).catch(() => null),
      opts.hasMappedPlaces && opts.urls.extract
        ? readLocalMapArchive(opts.urls.extract).catch(() => null)
        : Promise.resolve(null),
    ]);
    const found = { world: world?.meta ?? null, extract: extract?.meta ?? null };
    setLocal(found);
    setChecked(true);
    return found;
  }, [opts.hasMappedPlaces, opts.urls.extract, opts.urls.world]);

  useEffect(() => {
    setChecked(false);
    setStatus('idle');
    setVisible(false);
    void inspect();
  }, [inspect]);

  const runDownload = useCallback(
    async (manual = true) => {
      if (running.current || opts.offline || opts.ended) return;
      running.current = true;
      if (manual) rememberPrompt(opts.tripId, 'accepted');
      setVisible(manual);
      setStatus('downloading');
      setRetryAfterSeconds(undefined);
      try {
        const found = await inspect();
        // **Missing OR stale**, and one list for both: a refresh is the same download, decided
        // the same way, differing only in that something readable is already there (§6's
        // amendment). `wanted` is what says so.
        const targets = [
          ...(wanted(found.world, opts.archiveVintage)
            ? [{ url: opts.urls.world, kind: 'world' as const, tripId: undefined }]
            : []),
          ...(wanted(found.extract, opts.archiveVintage) &&
          opts.hasMappedPlaces &&
          opts.urls.extract
            ? [{ url: opts.urls.extract, kind: 'extract' as const, tripId: opts.tripId }]
            : []),
        ];
        for (const target of targets) {
          const result = await downloadMapArchive({
            ...target,
            currentTripId: opts.tripId,
            vintage: opts.archiveVintage,
          });
          if (result.status === 'preparing') {
            setRetryAfterSeconds(result.retryAfterSeconds);
            setStatus('preparing');
            return;
          }
          if (result.status === 'no-space') {
            setStatus('no-space');
            return;
          }
        }
        await inspect();
        setStatus('ready');
      } catch {
        setStatus('failed');
      } finally {
        running.current = false;
      }
    },
    [
      inspect,
      opts.archiveVintage,
      opts.ended,
      opts.hasMappedPlaces,
      opts.offline,
      opts.tripId,
      opts.urls.extract,
      opts.urls.world,
    ],
  );

  useEffect(() => {
    if (
      status !== 'preparing' ||
      visible ||
      opts.offline ||
      opts.ended ||
      retryAfterSeconds == null
    )
      return;
    const timer = window.setTimeout(
      () => void runDownload(false),
      Math.max(0, retryAfterSeconds * 1000),
    );
    return () => window.clearTimeout(timer);
  }, [opts.ended, opts.offline, retryAfterSeconds, runDownload, status, visible]);

  useEffect(() => {
    if (!checked || status !== 'idle' || opts.offline || opts.ended) return;
    const needsExtract = opts.hasMappedPlaces && !!opts.urls.extract;
    const missing = !local.world || (needsExtract && !local.extract);
    const stale =
      (!!local.world && isMapArchiveStale(local.world, opts.archiveVintage, getNow())) ||
      (needsExtract &&
        !!local.extract &&
        isMapArchiveStale(local.extract, opts.archiveVintage, getNow()));
    if (!missing && !stale) {
      setStatus('ready');
      return;
    }
    if (mapArchiveDownloadPolicy() === 'automatic') {
      void runDownload(false);
      return;
    }
    // **A refresh never asks, and never spends metered bytes.** A missing archive is the
    // difference between having a map on the plane and not, which is what earns §5's prompt; a
    // stale one is a preference, and a prompt offering to re-download 80 MB of a map you already
    // have is a nag by any other name. So on a connection we cannot vouch for, what is on the
    // device stays (ADR-0186 §6 amendment).
    if (!missing) {
      setStatus('ready');
      return;
    }
    if (!needsExtract) return;
    if (promptDecision(opts.tripId) == null) setStatus('prompt');
  }, [
    checked,
    local,
    opts.archiveVintage,
    opts.ended,
    opts.hasMappedPlaces,
    opts.offline,
    opts.tripId,
    opts.urls.extract,
    runDownload,
    status,
  ]);

  const dismiss = useCallback(() => {
    rememberPrompt(opts.tripId, 'dismissed');
    setVisible(false);
    setStatus('idle');
  }, [opts.tripId]);

  const renderUrls = useMemo<MapTileUrls>(() => {
    if (!opts.offline) return opts.urls;
    return {
      world: opts.urls.world,
      detail: local.extract && opts.urls.extract ? opts.urls.extract : opts.urls.world,
      extract: opts.urls.extract,
    };
  }, [local.extract, opts.offline, opts.urls]);

  return {
    urls: renderUrls,
    checked,
    status,
    retryAfterSeconds,
    visible: visible || status === 'prompt',
    download: () => runDownload(true),
    dismiss,
  };
}
