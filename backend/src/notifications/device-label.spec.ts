import { describe, expect, it } from 'vitest';
import { deviceLabel, UNKNOWN_DEVICE } from './device-label';

/** Real strings, copied from real browsers. A hand-shortened UA would be a test of a value
 *  the parser never sees — and the nesting these assert (every Edge says Chrome, every
 *  Chrome-on-iOS says Safari) is only visible in the full thing. */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('deviceLabel', () => {
  it.each([
    ['iphoneSafari', UA.iphoneSafari, 'iPhone · Safari'],
    ['macChrome', UA.macChrome, 'Mac · Chrome'],
    ['macSafari', UA.macSafari, 'Mac · Safari'],
    ['androidChrome', UA.androidChrome, 'Android · Chrome'],
    ['ipadSafari', UA.ipadSafari, 'iPad · Safari'],
    ['linuxFirefox', UA.linuxFirefox, 'Linux · Firefox'],
  ])('reads %s', (_name, ua, expected) => {
    expect(deviceLabel(ua)).toBe(expected);
  });

  it('picks the LONGEST claim, because these strings nest', () => {
    // Every Edge UA also says Chrome and Safari; a naive first-hit-wins over an unordered
    // table would label a Windows Edge install "Windows · Chrome".
    expect(deviceLabel(UA.windowsEdge)).toBe('Windows · Edge');
    // And an iPad UA also says `Mac OS X`, which would otherwise read as a Mac.
    expect(deviceLabel(UA.ipadSafari)).toBe('iPad · Safari');
    // Android's says `Linux`.
    expect(deviceLabel(UA.androidChrome)).toBe('Android · Chrome');
  });

  it('tells the truth about Chrome on iOS as far as the string allows', () => {
    // `CriOS` is the one marker that survives Apple's WebKit-only rule, and it is why this
    // label is a hint rather than an identity: without it the row would say Safari.
    expect(deviceLabel(UA.iphoneChrome)).toBe('iPhone · Chrome');
  });

  it('falls back rather than inventing', () => {
    expect(deviceLabel(null)).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel(undefined)).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel('   ')).toBe(UNKNOWN_DEVICE);
    expect(deviceLabel('curl/8.4.0')).toBe(UNKNOWN_DEVICE);
  });

  it('gives half a label when it only knows half', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone)')).toBe('iPhone');
    expect(deviceLabel('something Firefox/1')).toBe('Firefox');
  });

  it('separates with `·` and never a dash', () => {
    // The label renders as an LTR island inside a Hebrew row, where a dash reads as a range
    // (root CLAUDE.md).
    expect(deviceLabel(UA.macChrome)).not.toContain('-');
    expect(deviceLabel(UA.macChrome)).toContain('·');
  });
});
