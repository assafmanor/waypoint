import { describe, expect, it } from 'vitest';
import { externalHref } from './external-url';

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
