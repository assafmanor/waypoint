/**
 * **Hand something to the phone's own share sheet**, with the two fallbacks that make it
 * work everywhere else.
 *
 * A trip is shared into WhatsApp, not into a "copy this URL" dialog, so the native sheet is
 * the ordinary path and the clipboard is the compatibility one. Three rules run through
 * both helpers:
 *
 * **A cancellation is not a failure.** `navigator.share` rejects with `AbortError` when
 * somebody swipes the sheet away, and treating that as an error puts a red toast on screen
 * for a person who simply changed their mind. It is reported as `cancelled` and says
 * nothing.
 *
 * **The object URL is always revoked.** A blob URL that is never revoked pins the whole PDF
 * in memory for the life of the document, and a few of those on a phone is a tab the OS
 * kills.
 *
 * **Feature-detect the payload, not the API.** `navigator.share` exists in browsers that
 * cannot share a `File`, so files go through `canShare({ files })` — which is the whole
 * reason `share` alone is not enough of a check.
 */
export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled';

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export async function shareUrlOrCopy(data: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // Anything else (a permissions policy, an unsupported payload) falls through to the
      // clipboard rather than surfacing — the person asked to share a link, and there is
      // still a way to give them one.
    }
  }
  await navigator.clipboard.writeText(data.url);
  return 'copied';
}

export async function shareFileOrDownload(file: File): Promise<ShareOutcome> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    return 'downloaded';
  } finally {
    URL.revokeObjectURL(url);
  }
}
