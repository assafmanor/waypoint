/** Minimal `Cookie:` header parser — shared by Express requests and the raw WS
 *  upgrade request, neither of which run `cookie-parser` middleware. */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}
