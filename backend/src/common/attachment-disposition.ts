/**
 * RFC 6266/5987 `attachment` disposition.
 *
 * Titles here are Hebrew (non-ASCII), so the Unicode name rides `filename*`
 * (percent-encoded, and header-injection-safe by construction) with an ASCII `filename`
 * fallback for anything that only understands the older form.
 *
 * **Always `attachment`, never inline** (backend-review B-03): a document is caller-uploaded
 * bytes with a caller-declared type, so serving it inline is a same-origin
 * script-execution path. That reasoning did not change when ADR-0213 added an anonymous
 * download route — it got stronger, which is why this moved out of the documents controller
 * rather than being copied into the sharing one.
 */

/** The extension a saved file needs to be openable, per allowed upload type
 *  (`ALLOWED_DOCUMENT_MIME_TYPES`). Deliberately a closed map and not a lookup library:
 *  the set of types this app accepts is decided in `packages/shared`, and a type absent
 *  here gets no extension rather than a guessed one. */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

/**
 * **A document's name here is its TITLE, and a title has no extension** — so what the
 * reader saved was `כרטיס טיסה TLV`, a file the phone has no type for and no app offers to
 * open (owner, 2026-08-30: _"the document links aren't working"_). In the app this never
 * showed, because the viewer fetches the bytes and renders them against the `mimeType` it
 * already holds; a download has only the name.
 *
 * Appended from the served `Content-Type` rather than stored per file, because the type is
 * what the response actually promises — and skipped when the title already ends in that
 * extension, so a file the owner named `boarding.pdf` does not become `boarding.pdf.pdf`.
 */
export function attachmentDisposition(title: string, mimeType?: string): string {
  const extension = mimeType ? (EXTENSION_BY_MIME_TYPE[mimeType] ?? '') : '';
  const filename =
    extension && !title.toLowerCase().endsWith(extension) ? `${title}${extension}` : title;
  const asciiFallback =
    filename
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || `document${extension}`;
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
