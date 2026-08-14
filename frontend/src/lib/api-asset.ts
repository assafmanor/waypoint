// **A path the server built, made loadable** — the one place the API origin is prefixed onto
// content the server addressed for us.
//
// There are three such paths now: an uploaded avatar's bytes (ADR-0133 §12), an enrichment
// image's (ADR-0167 §1), and the map's own tile archive (ADR-0186 §3, which routes tile reads
// through our backend rather than a vendor for exactly the reasons ADR-0108/0110 gave for
// place data). All are root-relative and assembled server-side precisely so no client knows
// the route shape, which is also why the origin cannot be baked into them.
import { API_BASE_URL } from '../constants';

/** A prefix, not a `new URL()` base: same-origin production leaves `API_BASE_URL` empty and
 *  the server's path is already root-relative, so concatenation covers both deployments. */
export function apiAssetUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
