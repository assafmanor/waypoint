import { describe, expect, it } from 'vitest';
import { externalHref, prettyUrl } from './external-url';

describe('externalHref', () => {
  // THE REPORTED BUG. `tabelog.com/…` as an href is RELATIVE, so the tap resolves it against
  // the current page and re-enters the app — the whole window in the installed PWA.
  it('supplies the scheme nobody types', () => {
    expect(externalHref('tabelog.com/tokyo/A1303')).toBe('https://tabelog.com/tokyo/A1303');
    expect(externalHref('www.example.co.jp')).toBe('https://www.example.co.jp/');
  });

  it('leaves a url that already has one alone', () => {
    expect(externalHref('https://example.com/x')).toBe('https://example.com/x');
    expect(externalHref('http://example.com/x')).toBe('http://example.com/x');
  });

  it('takes the two contact schemes a travel note can mean', () => {
    expect(externalHref('mailto:hotel@example.com')).toBe('mailto:hotel@example.com');
    expect(externalHref('tel:+81312345678')).toBe('tel:+81312345678');
  });

  // A note is group-visible free text, so a `url` field is a script one member could hand
  // another. Answering `null` is what makes the call site render text instead of a link.
  it('refuses a scheme that is not a place to go', () => {
    expect(externalHref('javascript:alert(1)')).toBeNull();
    expect(externalHref('JavaScript:alert(1)')).toBeNull();
    expect(externalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(externalHref('file:///etc/passwd')).toBeNull();
  });

  it('answers null for what is not a url at all, rather than throwing', () => {
    expect(externalHref('')).toBeNull();
    expect(externalHref('   ')).toBeNull();
    expect(externalHref(undefined)).toBeNull();
    expect(externalHref(null)).toBeNull();
  });

  it('trims, because a pasted url brings whitespace with it', () => {
    expect(externalHref('  tabelog.com  ')).toBe('https://tabelog.com/');
  });

  // A blind prefix would make this `https:////host/x`.
  it('handles a scheme-relative url', () => {
    expect(externalHref('//example.com/x')).toBe('https://example.com/x');
  });
});

describe('prettyUrl', () => {
  // THE REPORTED UGLINESS. 64 characters, 30 of them a token that tells Instagram who
  // forwarded the reel and tells the reader nothing — and it wrapped the row to three lines.
  it('drops the scheme, the www and the share token', () => {
    expect(prettyUrl('https://www.instagram.com/reel/DbTc4IRhNDT/?igsh=azVieW45b2lscHh2')).toBe(
      'instagram.com/reel/DbTc4IRhNDT',
    );
  });

  // …but a query is not automatically noise: this one IS the video.
  it('keeps a query that carries the destination', () => {
    expect(prettyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123')).toBe(
      'youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(prettyUrl('https://example.com/x?page=2')).toBe('example.com/x?page=2');
  });

  it('drops every utm_ parameter by prefix, not by name', () => {
    expect(prettyUrl('https://example.com/a?utm_source=x&utm_whatever=y&id=7')).toBe(
      'example.com/a?id=7',
    );
  });

  it('reads a bare host as the host', () => {
    expect(prettyUrl('https://tabelog.com')).toBe('tabelog.com');
    expect(prettyUrl('tabelog.com/tokyo/A1303/')).toBe('tabelog.com/tokyo/A1303');
  });

  it('leads a contact scheme with the address, which is all it has', () => {
    expect(prettyUrl('mailto:hotel@example.com')).toBe('hotel@example.com');
    expect(prettyUrl('tel:+81312345678')).toBe('+81312345678');
  });

  // Whatever this is, it is what someone typed — printing nothing would be worse.
  it('falls back to the raw string for something that is not a url', () => {
    expect(prettyUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(prettyUrl('  not a url at all  ')).toBe('not a url at all');
    expect(prettyUrl(undefined)).toBe('');
  });

  // The label is shorter than the href on purpose, and only the label. A dropped parameter
  // is still sent when the link is followed, so this can never break a destination.
  it('never shortens the href it is a label for', () => {
    const raw = 'https://www.instagram.com/reel/DbTc4IRhNDT/?igsh=azVieW45b2lscHh2';
    expect(externalHref(raw)).toContain('igsh=azVieW45b2lscHh2');
  });
});
