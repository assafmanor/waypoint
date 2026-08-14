import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapTileUrls } from './map-config';
import { downloadMapArchive, readLocalMapArchive } from './map-archive-cache';

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

export function useMapArchives(opts: {
  tripId: string;
  offline: boolean;
  ended: boolean;
  hasMappedPlaces: boolean;
  urls: MapTileUrls;
}) {
  const [local, setLocal] = useState({ world: false, extract: false });
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
    const found = { world: !!world, extract: !!extract };
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
        const targets = [
          ...(!found.world
            ? [{ url: opts.urls.world, kind: 'world' as const, tripId: undefined }]
            : []),
          ...(!found.extract && opts.hasMappedPlaces && opts.urls.extract
            ? [{ url: opts.urls.extract, kind: 'extract' as const, tripId: opts.tripId }]
            : []),
        ];
        for (const target of targets) {
          const result = await downloadMapArchive({
            ...target,
            currentTripId: opts.tripId,
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
        setLocal({ world: true, extract: opts.hasMappedPlaces && !!opts.urls.extract });
        setStatus('ready');
      } catch {
        setStatus('failed');
      } finally {
        running.current = false;
      }
    },
    [
      inspect,
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
    if (local.world && (local.extract || !needsExtract)) {
      setStatus('ready');
      return;
    }
    if (mapArchiveDownloadPolicy() === 'automatic') {
      void runDownload(false);
      return;
    }
    if (!needsExtract) return;
    if (promptDecision(opts.tripId) == null) setStatus('prompt');
  }, [
    checked,
    local,
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
