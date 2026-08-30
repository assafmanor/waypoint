// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareFileOrDownload, shareUrlOrCopy } from './system-share';

const URL_UNDER_TEST = 'travelive.app/s/7Kq2mB9x';
const payload = { title: 'איסלנד עם המשפחה', text: 'המסלול שלנו', url: URL_UNDER_TEST };

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

function setShare(value: unknown) {
  Object.defineProperty(navigator, 'share', { value, configurable: true });
}

function setCanShare(value: unknown) {
  Object.defineProperty(navigator, 'canShare', { value, configurable: true });
}

describe('shareUrlOrCopy', () => {
  let writeText: ReturnType<typeof stubClipboard>;

  beforeEach(() => {
    writeText = stubClipboard();
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses the phone sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);

    await expect(shareUrlOrCopy(payload)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(payload);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when native sharing is unavailable', async () => {
    setShare(undefined);

    await expect(shareUrlOrCopy(payload)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  // Somebody who swipes the sheet away has not hit an error, and a red toast telling them
  // so is the whole bug this test exists to prevent.
  it('treats a dismissed sheet as a quiet cancellation', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));

    await expect(shareUrlOrCopy(payload)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('still gives them the link when the sheet fails for another reason', async () => {
    setShare(vi.fn().mockRejectedValue(new Error('permissions policy')));

    await expect(shareUrlOrCopy(payload)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST);
  });
});

describe('shareFileOrDownload', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'itinerary.pdf', { type: 'application/pdf' });
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:${created.length}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shares the file itself where the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    setCanShare(() => true);

    await expect(shareFileOrDownload(file)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'itinerary.pdf' });
    expect(created).toHaveLength(0);
  });

  // `navigator.share` exists in browsers that cannot share a File, which is exactly why
  // the check is on the payload rather than on the API.
  it('downloads when the browser can share links but not files', async () => {
    setShare(vi.fn());
    setCanShare(() => false);

    await expect(shareFileOrDownload(file)).resolves.toBe('downloaded');
    expect(created).toHaveLength(1);
  });

  it('downloads when there is no native sharing at all', async () => {
    setShare(undefined);
    setCanShare(undefined);

    await expect(shareFileOrDownload(file)).resolves.toBe('downloaded');
  });

  it('treats a dismissed file sheet as a cancellation and creates no object url', async () => {
    setShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    setCanShare(() => true);

    await expect(shareFileOrDownload(file)).resolves.toBe('cancelled');
    expect(created).toHaveLength(0);
  });

  // A blob url left un-revoked pins the whole PDF in memory for the life of the document.
  it('always revokes the object url it created', async () => {
    setShare(undefined);
    setCanShare(undefined);

    await shareFileOrDownload(file);
    expect(revoked).toEqual(created);
  });
});
