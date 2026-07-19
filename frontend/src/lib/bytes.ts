/** Human file size, e.g. "1.2MB" / "540KB" / "512B" — used on document rows and
 *  the file-picker preview. Generic (no documents dependency) so any attachment
 *  surface can share one wording. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
