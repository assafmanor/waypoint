// **An invite is two strings, not one.**
//
// The API hands back a path (`/join/7Kq2mB`, ADR-0024) — the origin is the client's to
// supply, because the backend serves the app and the API on one host and has no business
// hardcoding which name that host answers to. So the url is built here, against the origin
// this page is actually on, which the server has already canonicalised for us (ADR-0169):
// land on `www.` and you were sent to the bare host before this code ever ran.
//
// What goes on screen is not that url. `https://travelive.app/join/7Kq2mB` is mostly
// plumbing — every link has a scheme, and `www.` says nothing — and the invite box is one
// line on a 360px phone. The reader gets `travelive.app/join/7Kq2mB`; the clipboard gets
// the whole thing, because a label is not a link.

import { prettyUrl } from './external-url';

export interface InviteLink {
  /** What is copied, shared and pasted. Absolute, scheme and all. */
  url: string;
  /** What is shown. Same destination, minus what nobody reads. */
  label: string;
}

/** @param path the `inviteUrl` the API returned — a root-relative `/join/<code>`. */
export function inviteLink(path: string): InviteLink {
  const url = new URL(path, window.location.origin).href;
  return { url, label: prettyUrl(url) };
}
