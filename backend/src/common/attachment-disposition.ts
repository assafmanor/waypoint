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
export function attachmentDisposition(title: string): string {
  const asciiFallback =
    title
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'document';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(title)}`;
}
